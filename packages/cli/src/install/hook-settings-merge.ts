// Pure settings.json merge for Claude Code hook bindings. Follows the
// managed-merge philosophy of agents-md.ts: caller reads the existing file and
// writes the returned string; this module never touches the filesystem.

import type { HooksConfigFormat } from "../providers/resolver.js";
import {
  ANTIGRAVITY_HOOK_EVENTS,
  mergeAntigravityHooks,
  unmergeAntigravityHooks,
} from "./antigravity-hooks-merge.js";
import { mergeCodexHooks, unmergeCodexHooks } from "./codex-hooks-merge.js";
import { commandOwnedBy } from "./owned-command.js";

export interface HookBinding {
  /** Claude Code hook event, e.g. "SessionStart". */
  event: string;
  /** Optional tool matcher (PreToolUse/PostToolUse). */
  matcher?: string;
  /** Full shell command, e.g. `node /abs/.claude/hooks/av/session-init.cjs`. */
  command: string;
}

interface HookCommandEntry {
  type: "command";
  command: string;
  [key: string]: unknown;
}

interface HookMatcherGroup {
  matcher?: string;
  hooks: HookCommandEntry[];
  [key: string]: unknown;
}

type SettingsJson = Record<string, unknown> & {
  hooks?: Record<string, HookMatcherGroup[]>;
};

function eventContainsCommand(groups: HookMatcherGroup[], command: string): boolean {
  return groups.some((g) => (g.hooks ?? []).some((h) => h.command === command));
}

/**
 * Merge av hook bindings into an existing settings.json string. Idempotent:
 * bindings are deduped by exact command; entries not owned by av are preserved
 * untouched. Throws on unparseable input rather than clobbering user config.
 */
/**
 * Pick the merger for a provider's hook-binding registry.
 *
 * One dispatch point, so a provider whose config is not settings.json-shaped
 * adds a case here rather than a second op action that would then need parallel
 * handling in the consent gate, the reconciler, uninstall and the receipt.
 */
export function mergeHooksConfig(
  format: HooksConfigFormat,
  existing: string,
  bindings: HookBinding[],
  ownedDir: string,
): string {
  switch (format) {
    case "claude-settings-json":
      return mergeHookSettings(existing, bindings);
    case "codex-hooks-json":
      return mergeCodexHooks(existing, bindings, ownedDir);
    case "antigravity-hooks-json":
      // No owned directory: this format keys ownership on a top-level name
      // nobody else writes, so there is no command string to inspect.
      return mergeAntigravityHooks(existing, bindings);
  }
}

/**
 * The events a registry dispatches, or `null` when it takes any event name.
 *
 * The planner asks before it binds, because a binding for an event the runtime
 * has never heard of is not an error anyone sees: it is written, it looks
 * installed, and it never fires. Answering `null` is not "unknown" — it says
 * the registry passes the kit's event names through as they are.
 */
export function supportedHookEvents(format: HooksConfigFormat): readonly string[] | null {
  switch (format) {
    case "claude-settings-json":
    case "codex-hooks-json":
      return null;
    case "antigravity-hooks-json":
      return ANTIGRAVITY_HOOK_EVENTS;
  }
}

/**
 * Reverse of `mergeHooksConfig`, dispatching on the same discriminator.
 *
 * The statusline rides along in Claude Code's settings.json and comes out in the
 * same pass; codex has no statusline surface, so its config is only ever asked
 * about hooks.
 */
export function unmergeHooksConfig(
  format: HooksConfigFormat,
  existing: string,
  bindings: HookBinding[],
  ownedDir: string,
): string {
  switch (format) {
    case "claude-settings-json":
      return unmergeStatusLine(unmergeHookSettings(existing, bindings), ownedDir);
    case "codex-hooks-json":
      return unmergeCodexHooks(existing, ownedDir);
    case "antigravity-hooks-json":
      return unmergeAntigravityHooks(existing);
  }
}

export function mergeHookSettings(existing: string, bindings: HookBinding[]): string {
  const settings: SettingsJson = existing.trim().length
    ? (JSON.parse(existing) as SettingsJson)
    : {};
  const hooks = (settings.hooks ??= {});
  for (const binding of bindings) {
    const groups = (hooks[binding.event] ??= []);
    if (eventContainsCommand(groups, binding.command)) continue;
    const group: HookMatcherGroup = { hooks: [{ type: "command", command: binding.command }] };
    if (binding.matcher) group.matcher = binding.matcher;
    groups.push(group);
  }
  return `${JSON.stringify(settings, null, 2)}\n`;
}

/**
 * Remove exactly the given av bindings from an existing settings.json string.
 * Reverse of mergeHookSettings: entries not matching one of `bindings`'
 * commands are left untouched; an event whose groups all get removed drops
 * the event key entirely. Idempotent, throws on unparseable input.
 */
export function unmergeHookSettings(existing: string, bindings: HookBinding[]): string {
  const settings: SettingsJson = existing.trim().length
    ? (JSON.parse(existing) as SettingsJson)
    : {};
  const ourCommands = new Set(bindings.map((b) => b.command));
  const hooks = settings.hooks;
  if (hooks) {
    for (const event of Object.keys(hooks)) {
      const remaining = hooks[event]
        .map((group) => ({ ...group, hooks: group.hooks.filter((h) => !ourCommands.has(h.command)) }))
        .filter((group) => group.hooks.length > 0);
      if (remaining.length > 0) {
        hooks[event] = remaining;
      } else {
        delete hooks[event];
      }
    }
    if (Object.keys(hooks).length === 0) delete settings.hooks;
  }
  return `${JSON.stringify(settings, null, 2)}\n`;
}

/**
 * Copy-pasteable `hooks` block for users who declined the automatic merge.
 *
 * Takes the merged file text rather than the bindings, because which merger
 * produced it is the caller's to know: a provider that keeps its hooks in a
 * file of its own gets a block built by that provider's merger, and naming
 * `.claude/settings.json` for it would send the user to a file it never reads.
 */
export function renderHookSettingsSnippet(mergedFile: string, dest: string): string {
  // The whole object, not its `hooks` key. What arrives here is always this
  // installer's own bindings merged against an empty file, so there is nothing
  // else in it to strip — and reaching for `.hooks` would print `null` for the
  // one format whose bindings live under a top-level key of their own.
  return [
    `Add this to ${dest} to activate the av hooks:`,
    JSON.stringify(JSON.parse(mergedFile), null, 2),
  ].join("\n");
}

/**
 * Merge a `statusLine` command into settings.json.
 *
 * A statusline is one slot, not a list — so unlike hook bindings, installing one
 * means *replacing* whatever is there. Silently taking over a statusline the
 * user chose is the sort of change that gets noticed as "my terminal looks wrong
 * now" with no clue why, so an existing entry that is not ours is left alone and
 * reported instead. Ours is recognisable by the path: it lives in the directory
 * this installer owns.
 */
export interface StatusLineMerge {
  json: string;
  applied: boolean;
  /** Why it was not applied, when it was not. */
  reason?: string;
}

export function mergeStatusLine(existing: string, command: string, ownedDir: string): StatusLineMerge {
  const settings: SettingsJson = existing.trim().length ? (JSON.parse(existing) as SettingsJson) : {};
  const current = (settings as { statusLine?: { command?: string } }).statusLine;
  const currentCommand = typeof current?.command === "string" ? current.command : null;

  if (currentCommand !== null && !commandOwnedBy(currentCommand, ownedDir) && currentCommand !== command) {
    return {
      json: existing,
      applied: false,
      reason: `settings.json already has a statusLine (${currentCommand.slice(0, 60)}) — left as it is`,
    };
  }

  (settings as { statusLine?: unknown }).statusLine = { type: "command", command, padding: 0 };
  return { json: `${JSON.stringify(settings, null, 2)}\n`, applied: true };
}

/** Remove our statusLine, leaving one the user set themselves untouched. */
export function unmergeStatusLine(existing: string, ownedDir: string): string {
  const settings: SettingsJson = existing.trim().length ? (JSON.parse(existing) as SettingsJson) : {};
  const current = (settings as { statusLine?: { command?: string } }).statusLine;
  if (typeof current?.command === "string" && commandOwnedBy(current.command, ownedDir)) {
    delete (settings as { statusLine?: unknown }).statusLine;
  }
  return `${JSON.stringify(settings, null, 2)}\n`;
}
