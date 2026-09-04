// Static, read-only inspection of a Codex `hooks.json` this installer shares.
//
// The file is not ours. `~/.codex/hooks.json` is written by whatever else the
// user runs, and a project-local `<repo>/.codex/hooks.json` arrives with any
// cloned repository — so running a command out of it to see what it emits would
// mean `av install` executing arbitrary code from that clone. That is the same
// threat install-surface.ts documents for `backups restore`, and it is the
// reason everything here works on already-parsed JSON: no filesystem, no
// process, no interpretation of what a foreign command does.
//
// What is left is weaker and honest about it. A handler is ours (by install
// prefix), a suspect (it sits where the legacy Codex wrapper installs), or
// simply foreign. A dynamically-built legacy emitter is invisible to this, so
// the notice describes the symptom the user would see rather than asserting a
// diagnosis it cannot prove.

import { commandOwnedBy } from "./owned-command.js";

/** One `hooks.json`, already parsed by the caller, with the path it came from. */
export interface CodexHooksSource {
  path: string;
  contents: unknown;
}

export interface CodexHookHandlerRef {
  path: string;
  event: string;
  command: string;
  /** The command sits in a directory the legacy wrapper is installed into. */
  suspect: boolean;
}

export interface CodexHooksReport {
  /** Foreign handlers with nothing notable about their location. */
  foreign: CodexHookHandlerRef[];
  /** Foreign handlers whose location matches the wrapper #134 reproduces. */
  suspects: CodexHookHandlerRef[];
}

/**
 * Locations the legacy wrapper is documented to install into.
 *
 * Matched against the command string alone. Location is the only signal that
 * does not require opening or running the script, which makes it the only one
 * available here.
 */
const WRAPPER_MARKERS = ["claudekit", "ck migrate"]; // brand-drift-allow: names the third-party tool whose wrapper is being detected, not this project

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function commandsIn(group: unknown): string[] {
  if (!isRecord(group) || !Array.isArray(group.hooks)) return [];
  return group.hooks
    .map((handler) => (isRecord(handler) ? handler.command : undefined))
    .filter((command): command is string => typeof command === "string" && command.length > 0);
}

/**
 * Classify every handler in the given files against the ariadnev install prefix.
 *
 * @param sources parsed `hooks.json` contents, each with its origin path
 * @param ownedDir the directory this installer writes its hooks into
 */
export function inspectCodexHooks(sources: CodexHooksSource[], ownedDir: string): CodexHooksReport {
  // Every command contains the empty string, so an empty prefix would classify
  // three other tools' hooks as ours and report none of them.
  if (ownedDir === "") throw new Error("refusing to inspect codex hooks without an owned directory");

  const report: CodexHooksReport = { foreign: [], suspects: [] };
  for (const { path, contents } of sources) {
    const hooks = isRecord(contents) ? contents.hooks : undefined;
    if (!isRecord(hooks)) continue;
    for (const [event, groups] of Object.entries(hooks)) {
      if (!Array.isArray(groups)) continue;
      for (const group of groups) {
        for (const command of commandsIn(group)) {
          if (commandOwnedBy(command, ownedDir)) continue;
          const suspect = WRAPPER_MARKERS.some((marker) => command.includes(marker));
          (suspect ? report.suspects : report.foreign).push({ path, event, command, suspect });
        }
      }
    }
  }
  return report;
}

function listOf(refs: CodexHookHandlerRef[]): string {
  return refs.map((ref) => `  ${ref.path}  ${ref.event}: ${ref.command}`).join("\n");
}

/**
 * The install-summary section for what the inspection found, or "" when there
 * is nothing worth a line.
 *
 * Suspects get the symptom and the remediation; plain foreign handlers get a
 * list and no advice, because sharing the file with another tool is a normal
 * configuration and not something this installer has an opinion about.
 */
export function renderLegacyWrapperNotice(report: CodexHooksReport): string {
  const parts: string[] = [];
  if (report.suspects.length > 0) {
    parts.push(
      [
        "Legacy Codex hook wrapper found. Codex validates hook output against strict",
        "schemas, and a wrapper emitting Claude Code's shape is rejected outright — a",
        "block surfaces as `Hook failed` rather than as a deny. Remove these entries and",
        "re-approve the remaining hooks in Codex's TUI with `/hooks`:",
        listOf(report.suspects),
      ].join("\n"),
    );
  }
  if (report.foreign.length > 0) {
    parts.push(`Other tools' hooks in the same file, left untouched:\n${listOf(report.foreign)}`);
  }
  return parts.join("\n\n");
}
