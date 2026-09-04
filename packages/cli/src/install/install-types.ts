import type { ArtifactKind } from "../providers/spec-verified.js";
import type { Artifact } from "../kit/kit-types.js";

/**
 * What a written file was adapted *from*, kept beside the adapted bytes.
 *
 * Several providers legitimately resolve to one path (`.agents/skills`), and
 * when their adaptations differ the file cannot hold all of them. Re-deriving a
 * neutral body for such a path needs the canonical source, not the already
 * provider-flavoured output — a rewritten tool name cannot be un-rewritten.
 * Absent on binary assets and on merge ops, which are reconciled by other means.
 */
export type WriteSource = { artifact: Artifact } | { text: string };

export interface WriteOp {
  action: "write";
  kind: ArtifactKind;
  name: string;
  dest: string;
  /** Bytes for binary assets; a string only where the content was adapted as
   *  text. Decoding a binary asset to a string replaces every invalid sequence
   *  with U+FFFD, which is unrecoverable. */
  content: string | Buffer;
  /** POSIX permission bits to apply after writing. Only 0o644 and 0o755 are
   *  accepted — an executable bit is a deliberate declaration, never inherited
   *  from whatever the authoring machine happened to have. */
  mode?: number;
  /** Canonical source, when this file was adapted from one. */
  source?: WriteSource;
}

export const ALLOWED_FILE_MODES = new Set([0o644, 0o755]);

export interface AgentsMdOp {
  action: "agents-md";
  kind: "rules";
  name: string;
  dest: string;
  block: string;
}

export interface SkipOp {
  action: "skip";
  kind: ArtifactKind;
  name: string;
  reason: string;
  /**
   * The file this skip is about, when there is one.
   *
   * An artifact is not a file. A skill is a directory — SKILL.md, references/,
   * scripts/ — so one edited file inside it produces one skip, and reporting
   * only `kind/name` printed the same line five times for five different files
   * with no way to tell which. The identity a reader needs is the path.
   *
   * Absent when the skip is about the artifact as a whole rather than one of
   * its files: an unverified provider cell was never planned to a destination,
   * and a declined settings.json merge concerns a file the install does not own.
   */
  path?: string;
}

import type { HookBinding } from "./hook-settings-merge.js";
import type { HooksConfigFormat } from "../providers/resolver.js";

export interface HookSettingsOp {
  action: "hook-settings";
  kind: "hook";
  name: string;
  /** Absolute settings path to merge bindings into. */
  dest: string;
  bindings: HookBinding[];
  /**
   * Which merger produces the bytes. A discriminator rather than a second op
   * action, because a new action would need parallel handling in `opContent`,
   * the consent gate, the shared-write reconciler, uninstall, and the receipt —
   * and an action that reaches only some of those reaches disk unreconciled.
   */
  format: HooksConfigFormat;
}

export interface StatusLineOp {
  action: "statusline-settings";
  kind: "statusline";
  name: string;
  /** Absolute settings.json path. */
  dest: string;
  /** Command the provider should run to render the bar. */
  command: string;
  /** Directory this installer owns — how its own entry is recognised. */
  ownedDir: string;
}

export type InstallOp = WriteOp | AgentsMdOp | SkipOp | HookSettingsOp | StatusLineOp;

export interface ProviderInstallResult {
  provider: string;
  written: number;
  backedUp: number;
  skipped: SkipOp[];
  ops: InstallOp[];
}

// reference parity guards — never copy these into a provider tree.
export const IGNORE_FILES = new Set([".env", ".DS_Store"]);
export const IGNORE_DIRS = new Set([
  "__tests__",
  ".git",
  ".venv",
  "__pycache__",
  // Hooks write their runtime log beside themselves. It is one machine's
  // session history: never copied into a provider tree, and never embedded
  // into a binary that gets shipped somewhere else.
  ".logs",
  "node_modules",
  ".pytest_cache",
  ".mypy_cache",
  "dist",
  "build",
]);

const TEXT_EXT = new Set([".md", ".ts", ".js", ".cjs", ".mjs", ".json", ".yaml", ".yml", ".toml"]);

export function isTextFile(name: string): boolean {
  const dot = name.lastIndexOf(".");
  return dot !== -1 && TEXT_EXT.has(name.slice(dot));
}
