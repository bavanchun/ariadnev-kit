// The subcommand audit: what `parity-ratchet.test.ts` cannot see.
//
// The ratchet compares TOP-LEVEL NAMES ONLY, and it reached zero. That is
// necessary for parity and not sufficient for it — the ratchet's own closing
// comment says so, written in phase 1 precisely so this phase could not inherit
// a number and mistake it for a conclusion. `parity-manifest.json` has stored
// each captured command's subcommand list since that capture, read by nothing.
// This reads it.
//
// TWO THINGS MADE A NAIVE COMPARISON LIE, AND BOTH SHOWED UP ON THE FIRST RUN.
//
// 1. Several commands take their verb as a POSITIONAL ARGUMENT rather than as a
//    Commander subcommand: `av backups create`, `av skill verify`, `av audit
//    scripts`. Commander reports no subcommands for those, so a raw comparison
//    called all six of `backups`' verbs missing when every one of them works.
//    `positionalVerbs` below is what stops that false positive.
//
// 2. Several upstream subcommands exist here under a different top-level name:
//    upstream's `kit install` is `av install`. Reporting those as gaps would
//    be true of the spelling and false of the function.
//
// So every difference is classified, and the test asserts that none is
// unclassified. A gap whose reason is "not built" is an honest row; a gap with
// no row at all is what this exists to prevent.

import { inScope, type ParityManifest } from "./parity-manifest.js";
import type { CommandSurface } from "./av-invocation-lint.js";

/** Verbs a command accepts as a positional argument instead of a subcommand. */
export const POSITIONAL_VERBS: Record<string, readonly string[]> = {
  // `av backups <action> [timestamp]`
  backups: ["create", "list", "show", "verify", "restore", "prune"],
  // `av skill <action> [name]` — plus `run`, which upstream does not have.
  skill: ["install", "verify", "repair", "upgrade", "remove"],
  // `av audit <target>`
  audit: ["kit", "scripts"],
  // `av config prefs <action>`
  config: [],
};

export type DivergenceKind =
  /** Present, spelled as a positional verb rather than a subcommand. */
  | "positional"
  /** Present under a different top-level name. */
  | "respelled"
  /** Deliberately not built, with a decision behind it. */
  | "declined"
  /** Not built, and no decision claims it should not be. An honest gap. */
  | "unbuilt"
  /** ariadnev has it and upstream does not. */
  | "extra";

export interface Divergence {
  readonly command: string;
  readonly subcommand: string;
  readonly kind: DivergenceKind;
  readonly reason: string;
}

/**
 * Every subcommand-level difference from upstream 2.14.0, with its reason.
 *
 * Written by hand rather than derived, because a reason cannot be computed. The
 * test below fails if the code and this table disagree in either direction, so
 * it cannot quietly go stale.
 */
export const DIVERGENCES: readonly Divergence[] = [
  // ─── respelled: same function, different name ───────────────────────────
  { command: "kit", subcommand: "init", kind: "respelled", reason: "`av init` — ariadnev scaffolds a project rather than a kit" },
  { command: "kit", subcommand: "install", kind: "respelled", reason: "`av install` — ariadnev ships one embedded kit, so installing it is the top-level verb" },
  { command: "kit", subcommand: "uninstall", kind: "respelled", reason: "`av uninstall` — one embedded kit means removing it is the top-level verb" },
  { command: "kit", subcommand: "validate", kind: "respelled", reason: "`av validate` validates the embedded kit" },
  { command: "kit", subcommand: "list-kits", kind: "respelled", reason: "`av list` — one embedded kit means listing contents, not kits" },

  // ─── declined: a decision was made not to build it ──────────────────────
  {
    command: "config", subcommand: "start", kind: "declined",
    reason: "the dashboard half went to `av api` and `av gui` in phase 11; registering the name would only stop the av-invocation lint reporting kit prose that promises a plans dashboard this does not serve",
  },
  { command: "config", subcommand: "status", kind: "declined", reason: "the same phase 11 decision as `config start`; `av api status` reports the daemon" },
  { command: "config", subcommand: "stop", kind: "declined", reason: "the same phase 11 decision as `config start`; `av api stop` stops the daemon" },
  {
    command: "kit", subcommand: "repair-install-mode", kind: "declined",
    reason: "repairs mixed Claude Code native/project-plugin state, which is upstream's plugin distribution model; ariadnev installs files directly and `av doctor --fix` covers drift",
  },

  // ─── unbuilt: none. All nine were built on 2026-08-29. ────────────────
  // The `unbuilt` kind stays in the union rather than being deleted with its
  // last row: it is the classification a future gap needs, and removing it
  // would mean the next person finding one has to invent a name for it, or
  // quietly file it as `declined`.

  // ─── extra: ariadnev has it and upstream does not ───────────────────────
  { command: "audit", subcommand: "kit", kind: "extra", reason: "`av audit kit` is the default target and names what it audits; the upstream command audits files with no target word" },
];

export interface SubcommandGap {
  readonly command: string;
  readonly subcommand: string;
  readonly direction: "missing" | "extra";
}

/** Every subcommand present on one side and not the other, positional verbs included. */
export function subcommandGaps(manifest: ParityManifest, surface: CommandSurface): SubcommandGap[] {
  const gaps: SubcommandGap[] = [];
  for (const command of inScope(manifest)) {
    const node = surface.subcommands.get(command.target as string);
    if (!node) continue;
    const registered = new Set<string>([
      ...[...node.subcommands.keys()].filter((name) => name !== "help"),
      ...(POSITIONAL_VERBS[command.target as string] ?? []),
    ]);
    for (const captured of command.subcommands) {
      if (!registered.has(captured)) gaps.push({ command: command.name, subcommand: captured, direction: "missing" });
    }
    for (const name of registered) {
      if (!command.subcommands.includes(name)) gaps.push({ command: command.name, subcommand: name, direction: "extra" });
    }
  }
  return gaps;
}

/** How many gaps of each kind, for the audit's own summary line. */
export function divergenceTally(): Record<DivergenceKind, number> {
  const tally = { positional: 0, respelled: 0, declined: 0, unbuilt: 0, extra: 0 };
  for (const divergence of DIVERGENCES) tally[divergence.kind] += 1;
  return tally;
}
