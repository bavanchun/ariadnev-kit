// Regenerate the provider matrix block in README from the resolver/spec-verified
// source of truth. Run with bun (imports TS directly):
//   pnpm --filter vcskill generate:matrix
// The block is delimited by MATRIX_BEGIN/MATRIX_END markers; only that region is
// rewritten. `vcskill validate --check` fails if README drifts from this output.

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { renderMatrixBlock, MATRIX_BEGIN, MATRIX_END } from "../src/providers/matrix-drift.js";

const readmePath = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "README.md");
const readme = readFileSync(readmePath, "utf8");

const start = readme.indexOf(MATRIX_BEGIN);
const end = readme.indexOf(MATRIX_END);
if (start === -1 || end === -1 || end < start) {
  console.error(`generate:matrix — markers not found in README. Add:\n${MATRIX_BEGIN}\n${MATRIX_END}`);
  process.exit(1);
}

const next = readme.slice(0, start) + renderMatrixBlock() + readme.slice(end + MATRIX_END.length);
if (next === readme) {
  console.log("provider matrix already up to date");
} else {
  writeFileSync(readmePath, next);
  console.log("README provider matrix regenerated");
}
