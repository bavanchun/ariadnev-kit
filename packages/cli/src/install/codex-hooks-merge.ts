// Pure `hooks.json` merge for Codex hook bindings. Same contract as
// hook-settings-merge.ts: the caller reads the file and writes the returned
// string, this module never touches the filesystem and throws on unparseable
// input rather than clobbering a config it could not understand.
//
// Two things make this file different from Claude Code's settings.json. It is
// shared — three other tools were already writing to the one observed on disk —
// and Codex keys each hook's trust on `<source>:<event>:<group index>:<hook
// index>`. Moving a foreign group orphans its trust hash and asks the user to
// re-approve a hook they never touched, so ours are always appended after
// whatever is already there, and removing ours never reorders the rest.

import type { HookBinding } from "./hook-settings-merge.js";
import { commandOwnedBy } from "./owned-command.js";

interface CodexHandler {
  type: "command";
  command: string;
  [key: string]: unknown;
}

interface CodexGroup {
  matcher?: string;
  hooks: CodexHandler[];
  [key: string]: unknown;
}

type HooksJson = Record<string, unknown> & {
  hooks?: Record<string, CodexGroup[]>;
};

/**
 * The file as an object, or a refusal.
 *
 * `JSON.parse` answers for far more shapes than this format has. An array takes
 * the `hooks` assignment as a named property and then loses it at stringify
 * time, so the install would report a registration the file does not carry; a
 * string throws on the same assignment, surfacing as a raw TypeError rather
 * than as a statement about the user's file. Both are refused here instead,
 * which is the same answer this module already gives to bytes it cannot parse:
 * stop before the write rather than clobber a config it did not understand.
 */
function asObject(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${what} is not a JSON object — refusing to merge into it`);
  }
  return value as Record<string, unknown>;
}

function parseFile(existing: string): HooksJson {
  if (!existing.trim().length) return {};
  return asObject(JSON.parse(existing), "codex hooks.json") as HooksJson;
}

/**
 * One event's groups, or a refusal.
 *
 * A foreign writer's malformed-but-parseable entry would otherwise reach
 * `.filter` and abort the install with a stack trace. The event is named so the
 * message points at the key to look at.
 */
function eventGroups(hooks: Record<string, CodexGroup[]>, event: string): CodexGroup[] {
  const value = hooks[event];
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new Error(`codex hooks.json entry ${event} is not a list of hook groups — refusing to merge into it`);
  }
  return value;
}

function render(file: HooksJson): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}

/**
 * Whether a group is one this installer wrote.
 *
 * Every handler must be ours, not merely one of them: a group someone extended
 * by hand is a group with a stranger's command in it, and deleting that on
 * uninstall would take their hook with ours. Such a group is left alone and a
 * fresh one is written beside it, which is the safe direction to be wrong in.
 */
function isOurs(group: CodexGroup, ownedDir: string): boolean {
  const handlers = group.hooks ?? [];
  return handlers.length > 0 && handlers.every((h) => typeof h.command === "string" && commandOwnedBy(h.command, ownedDir));
}

/**
 * One group per `(event, matcher)` pair.
 *
 * A Codex group carries a single matcher for all of its handlers, so bindings
 * that differ by matcher cannot share one — grouping by event alone would file
 * a `Bash`-only guard under whatever matcher happened to come first.
 */
function ourGroups(bindings: HookBinding[], event: string): CodexGroup[] {
  const byMatcher = new Map<string, CodexGroup>();
  for (const binding of bindings) {
    if (binding.event !== event) continue;
    const key = binding.matcher ?? "";
    let group = byMatcher.get(key);
    if (!group) {
      // No `timeout`: the observed files set one, but this installer has no
      // basis for choosing a number, and the provider's default is a better
      // answer than an invented one.
      group = binding.matcher ? { matcher: binding.matcher, hooks: [] } : { hooks: [] };
      byMatcher.set(key, group);
    }
    group.hooks.push({ type: "command", command: binding.command });
  }
  return [...byMatcher.values()];
}

/**
 * Merge av hook bindings into an existing hooks.json string.
 *
 * Idempotent by construction rather than by deduplication: every group of ours
 * is dropped first and rebuilt from the bindings, so a binding that disappeared
 * between releases leaves no stale entry behind. Foreign groups keep both their
 * contents and their positions.
 */
export function mergeCodexHooks(existing: string, bindings: HookBinding[], ownedDir: string): string {
  const file = parseFile(existing);
  if (file.hooks !== undefined) asObject(file.hooks, "codex hooks.json key hooks");
  const hooks = (file.hooks ??= {});
  const events = [...new Set(bindings.map((b) => b.event))];
  for (const event of [...new Set([...Object.keys(hooks), ...events])]) {
    const foreign = eventGroups(hooks, event).filter((group) => !isOurs(group, ownedDir));
    const mine = ourGroups(bindings, event);
    if (foreign.length === 0 && mine.length === 0) {
      delete hooks[event];
      continue;
    }
    hooks[event] = [...foreign, ...mine];
  }
  return render(file);
}

/**
 * Remove exactly our groups again, leaving every other writer's untouched.
 *
 * The ownership test is the install directory rather than a list of commands
 * from the receipt: a hooks tree that moved between versions leaves entries the
 * receipt no longer names, and those are still ours to clean up.
 */
export function unmergeCodexHooks(existing: string, ownedDir: string): string {
  // An empty directory is a substring of every command, so an ownership test
  // against it claims the whole file — including three other tools' hooks. On a
  // removal path that is not a bug worth recovering from afterwards.
  if (ownedDir === "") throw new Error("refusing to unmerge codex hooks without an owned directory");
  const file = parseFile(existing);
  const hooks = file.hooks === undefined ? undefined : (asObject(file.hooks, "codex hooks.json key hooks") as Record<string, CodexGroup[]>);
  if (hooks) {
    for (const event of Object.keys(hooks)) {
      const remaining = eventGroups(hooks, event).filter((group) => !isOurs(group, ownedDir));
      if (remaining.length > 0) hooks[event] = remaining;
      else delete hooks[event];
    }
    if (Object.keys(hooks).length === 0) delete file.hooks;
  }
  return render(file);
}
