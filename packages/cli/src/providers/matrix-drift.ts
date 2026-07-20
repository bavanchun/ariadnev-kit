// Drift gate for the README provider matrix. The generated table lives between
// HTML-comment markers; `vcskill validate --check` compares the committed block
// to a freshly-built one so a hand-edit can never leave the docs lying.

import { matrixToMarkdown } from "./provider-matrix.js";

export const MATRIX_BEGIN = "<!-- BEGIN provider-matrix (generated) -->";
export const MATRIX_END = "<!-- END provider-matrix (generated) -->";

/** The full marker-wrapped block to embed in README (what the generator writes). */
export function renderMatrixBlock(): string {
  return `${MATRIX_BEGIN}\n${matrixToMarkdown()}\n${MATRIX_END}`;
}

/** Extract the current table (without markers) from README text, or null. */
export function extractMatrixBlock(readme: string): string | null {
  const start = readme.indexOf(MATRIX_BEGIN);
  const end = readme.indexOf(MATRIX_END);
  if (start === -1 || end === -1 || end < start) return null;
  return readme.slice(start + MATRIX_BEGIN.length, end).trim();
}

export interface DriftResult {
  ok: boolean;
  message: string;
}

/** True when README's marked matrix matches the generated one. */
export function checkMatrixDrift(readme: string): DriftResult {
  const current = extractMatrixBlock(readme);
  if (current === null) {
    return { ok: false, message: `provider-matrix markers not found in README (expected ${MATRIX_BEGIN} … ${MATRIX_END})` };
  }
  const expected = matrixToMarkdown().trim();
  if (current !== expected) {
    return { ok: false, message: "provider matrix in README is stale — run `pnpm --filter vcskill generate:matrix`" };
  }
  return { ok: true, message: "provider matrix in sync" };
}
