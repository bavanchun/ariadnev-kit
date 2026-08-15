import type { ArtifactKind } from "../providers/spec-verified.js";

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
}

import type { HookBinding } from "./hook-settings-merge.js";

export interface HookSettingsOp {
  action: "hook-settings";
  kind: "hook";
  name: string;
  /** Absolute settings.json path to merge bindings into. */
  dest: string;
  bindings: HookBinding[];
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
