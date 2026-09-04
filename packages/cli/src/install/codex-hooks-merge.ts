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

function parseFile(existing: string): HooksJson {
  return existing.trim().length ? (JSON.parse(existing) as HooksJson) : {};
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
  const hooks = (file.hooks ??= {});
  const events = [...new Set(bindings.map((b) => b.event))];
  for (const event of [...new Set([...Object.keys(hooks), ...events])]) {
    const foreign = (hooks[event] ?? []).filter((group) => !isOurs(group, ownedDir));
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
  const hooks = file.hooks;
  if (hooks) {
    for (const event of Object.keys(hooks)) {
      const remaining = hooks[event].filter((group) => !isOurs(group, ownedDir));
      if (remaining.length > 0) hooks[event] = remaining;
      else delete hooks[event];
    }
    if (Object.keys(hooks).length === 0) delete file.hooks;
  }
  return render(file);
}
