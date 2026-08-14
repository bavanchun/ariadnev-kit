// Canonical provider×artifact capability matrix, derived from the same resolver
// + spec-verified gate the installer uses. One source feeds BOTH the README docs
// table and `ariadnev contract --json`, so neither can drift from real behavior.

import type { ProviderId, ArtifactKind } from "./spec-verified.js";
import { targetTemplate } from "./resolver.js";
import { coral, teal, faint, symbols, type StyleOpts } from "../ui/style.js";

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

// Branded terminal grid for `ariadnev contract` — mirrors the landing-page
// signature matrix (◆ canonical / ✓ verified / · skip). Cells are padded to a
// fixed width BEFORE coloring, so ANSI escapes never disturb column alignment.
const ARTIFACT_COL = 10;
const PROVIDER_COL = 13;

export function matrixToTerminal(
  data: MatrixData = buildProviderMatrix(),
  opts: StyleOpts = { color: false },
): string {
  const head =
    "artifact".padEnd(ARTIFACT_COL) +
    MATRIX_PROVIDERS.map((p) => {
      const label = p.padEnd(PROVIDER_COL);
      return p === "claude-code" ? coral(label, opts) : faint(label, opts);
    }).join("");

  const rows = MATRIX_ARTIFACTS.map((artifact) => {
    const cells = MATRIX_PROVIDERS.map((p) => {
      const cell = data[p][artifact];
      if (!cell.verified) return faint(` ${symbols.skip} skip`.padEnd(PROVIDER_COL), opts);
      if (p === "claude-code") return coral(` ${symbols.self}`.padEnd(PROVIDER_COL), opts);
      return teal(` ${symbols.ok}`.padEnd(PROVIDER_COL), opts);
    });
    return artifact.padEnd(ARTIFACT_COL) + cells.join("");
  });

  const legend = [
    `${coral(symbols.self, opts)} canonical`,
    `${teal(symbols.ok, opts)} verified`,
    `${faint(symbols.skip, opts)} skip (unverified path)`,
  ].join("   ");

  return [head, ...rows, "", legend].join("\n");
}
