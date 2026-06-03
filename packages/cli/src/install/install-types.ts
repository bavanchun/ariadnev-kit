import type { ArtifactKind } from "../providers/spec-verified.js";

export interface WriteOp {
  action: "write";
  kind: ArtifactKind;
  name: string;
  dest: string;
  content: string;
}

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

export type InstallOp = WriteOp | AgentsMdOp | SkipOp;

export interface ProviderInstallResult {
  provider: string;
  written: number;
  backedUp: number;
  skipped: SkipOp[];
  ops: InstallOp[];
}

// claudekit parity guards — never copy these into a provider tree.
export const IGNORE_FILES = new Set([".env", ".DS_Store"]);
export const IGNORE_DIRS = new Set([
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
