// Pure `hooks.json` merge for antigravity hook bindings. Same contract as the
// other two mergers: the caller reads the file and writes the returned string,
// this module never touches the filesystem, and unparseable input throws rather
// than being clobbered.
//
// This is a third wire format, not a variant of the other two. Top-level keys
// are hook *names* the writer picks — the live file on the machine this was
// built against is keyed `"orca-status"` — and each maps to an object of
// events. Only five events exist. `PreToolUse` and `PostToolUse` take grouped
// `[{matcher, hooks:[…]}]` entries; `PreInvocation`, `PostInvocation` and
// `Stop` take flat `[{type, command}]` arrays.
//
// Two consequences shape the code. Ownership needs no command inspection: our
// entries live under one key that nobody else writes, so a merge replaces that
// key and touches nothing else. And the file is built from the five events
// rather than from the bindings, so a binding for an event this provider does
// not have is dropped here as well as by the caller — the alternative is a
// Claude Code event name appearing in agy's config, where it would look
// supported and never fire.

import type { HookBinding } from "./hook-settings-merge.js";

/** The top-level key this installer owns in the shared file. */
export const AV_HOOK_KEY = "av";

/**
 * Every event antigravity dispatches, and how each carries its handlers.
 *
 * `PreInvocation` and `PostInvocation` are listed because the provider has
 * them, not because anything binds to them: they fire per model turn, so a
 * session-scoped hook filed there would run on every turn of every session.
 */
const GROUPED_EVENTS = ["PreToolUse", "PostToolUse"] as const;
const FLAT_EVENTS = ["PreInvocation", "PostInvocation", "Stop"] as const;
export const ANTIGRAVITY_HOOK_EVENTS = [...GROUPED_EVENTS, ...FLAT_EVENTS];

interface Handler {
  type: "command";
  command: string;
}
interface MatcherGroup {
  matcher?: string;
  hooks: Handler[];
}
type EventConfig = Record<string, MatcherGroup[] | Handler[]>;
type HooksJson = Record<string, unknown>;

/**
 * The file as an object, or a refusal.
 *
 * Our bindings live under one top-level key, so an array root accepts the
 * assignment as a named property and then drops it at stringify time — the
 * install would report hooks registered into a file that carries none of them,
 * which is the one failure the user has no way to notice. A string root throws
 * a raw TypeError on the same line. Both get the answer this module already
 * gives to unparseable bytes: refuse before the caller writes.
 */
function parseFile(existing: string): HooksJson {
  if (!existing.trim().length) return {};
  const parsed: unknown = JSON.parse(existing);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("antigravity hooks.json is not a JSON object — refusing to merge into it");
  }
  return parsed as HooksJson;
}

function render(file: HooksJson): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}

function handler(binding: HookBinding): Handler {
  // No `timeout`: the observed file sets one, but this installer has no basis
  // for choosing a number and the provider's default beats an invented one.
  return { type: "command", command: binding.command };
}

/**
 * One group per matcher, in the order the bindings arrive.
 *
 * A group carries a single matcher for all of its handlers, so bindings that
 * differ by matcher cannot share one — grouping by event alone would file a
 * `Bash`-only guard under whichever matcher happened to come first.
 */
function groupedEntries(bindings: HookBinding[]): MatcherGroup[] {
  const byMatcher = new Map<string, MatcherGroup>();
  for (const binding of bindings) {
    const key = binding.matcher ?? "";
    let group = byMatcher.get(key);
    if (!group) {
      group = binding.matcher ? { matcher: binding.matcher, hooks: [] } : { hooks: [] };
      byMatcher.set(key, group);
    }
    group.hooks.push(handler(binding));
  }
  return [...byMatcher.values()];
}

function buildOurs(bindings: HookBinding[]): EventConfig {
  const ours: EventConfig = {};
  for (const event of GROUPED_EVENTS) {
    const mine = bindings.filter((b) => b.event === event);
    if (mine.length) ours[event] = groupedEntries(mine);
  }
  for (const event of FLAT_EVENTS) {
    const mine = bindings.filter((b) => b.event === event);
    if (mine.length) ours[event] = mine.map(handler);
  }
  return ours;
}

/**
 * Merge av hook bindings into an existing hooks.json string.
 *
 * Idempotent by construction rather than by deduplication: our key is rebuilt
 * from the bindings every time, so a binding that disappeared between releases
 * leaves no stale entry behind. Every other key keeps its contents and its
 * position, because a key we rewrote is a hook somebody else has to debug.
 */
export function mergeAntigravityHooks(existing: string, bindings: HookBinding[]): string {
  const file = parseFile(existing);
  const ours = buildOurs(bindings);
  if (Object.keys(ours).length === 0) delete file[AV_HOOK_KEY];
  else file[AV_HOOK_KEY] = ours;
  return render(file);
}

/**
 * Remove our key and nothing else.
 *
 * No ownership predicate is needed or wanted here. The other mergers have to
 * infer ownership from command strings because their entries sit in a shared
 * list; ours sit under a name, and deleting a name cannot reach a stranger's
 * hook by accident.
 */
export function unmergeAntigravityHooks(existing: string): string {
  const file = parseFile(existing);
  delete file[AV_HOOK_KEY];
  return render(file);
}
