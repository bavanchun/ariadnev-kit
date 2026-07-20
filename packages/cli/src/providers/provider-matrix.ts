// Canonical provider×artifact capability matrix, derived from the same resolver
// + spec-verified gate the installer uses. One source feeds BOTH the README docs
// table and `vcskill contract --json`, so neither can drift from real behavior.

import type { ProviderId, ArtifactKind } from "./spec-verified.js";
import { targetTemplate } from "./resolver.js";

// Public, doc-facing order. Excludes the internal "test-provider" mock.
export const MATRIX_PROVIDERS: ProviderId[] = [
  "claude-code",
  "codex",
  "cursor",
  "antigravity",
  "opencode",
  "generic",
];

export const MATRIX_ARTIFACTS: ArtifactKind[] = [
  "skill",
  "agent",
  "command",
  "rules",
  "scripts",
  "env",
  "hook",
];

export interface MatrixCell {
  verified: boolean;
  /** Target-path template when verified, else null. */
  path: string | null;
}

export type MatrixData = Record<string, Record<string, MatrixCell>>;

/** Build the full matrix as plain data (deterministic, pure). */
export function buildProviderMatrix(): MatrixData {
  const out: MatrixData = {};
  for (const provider of MATRIX_PROVIDERS) {
    out[provider] = {};
    for (const artifact of MATRIX_ARTIFACTS) {
      const path = targetTemplate(provider, artifact);
      out[provider][artifact] = { verified: path !== null, path };
    }
  }
  return out;
}

/** Render the matrix as the GitHub-flavored Markdown table shown in README. */
export function matrixToMarkdown(data: MatrixData = buildProviderMatrix()): string {
  const header = `| artifact | ${MATRIX_PROVIDERS.join(" | ")} |`;
  const sep = `|${"---|".repeat(MATRIX_PROVIDERS.length + 1)}`;
  const rows = MATRIX_ARTIFACTS.map((artifact) => {
    const cells = MATRIX_PROVIDERS.map((p) => {
      const cell = data[p][artifact];
      return cell.verified ? `\`${cell.path}\`` : "skip";
    });
    return `| ${artifact} | ${cells.join(" | ")} |`;
  });
  return [header, sep, ...rows].join("\n");
}

/** Serialize the matrix for `contract --json` (version added by the caller). */
export function matrixToJSON(data: MatrixData = buildProviderMatrix()): MatrixData {
  return data;
}
