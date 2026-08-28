// The Bun half of the storage conformance suite. Run it with `bun`, never node:
// it exists to exercise `bun:sqlite`, which is the driver the shipped binary
// carries and the one vitest can never reach.
//
//   bun packages/cli/scripts/run-storage-conformance.ts
//
// Same case array as `src/storage/conformance.test.ts`. If this file starts
// asserting something of its own, the two runtimes have stopped being compared.

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { storageConformanceCases } from "../src/storage/conformance-cases.js";
import { removeStorageTree } from "../src/storage/operational-paths.js";
import { selectDriver } from "../src/storage/select-driver.js";

const driver = selectDriver();
if (driver.name !== "bun") {
  console.error(`run-storage-conformance: selected the ${driver.name} driver — run this with bun, not node`);
  process.exit(1);
}

const root = mkdtempSync(join(tmpdir(), "ariadnev-storage-bun-"));
const context = {
  open: (path: string) => driver.open(path),
  tempFile: (name: string) => join(root, name),
};

const failures: string[] = [];
try {
  for (const conformanceCase of storageConformanceCases) {
    try {
      conformanceCase.run(context);
      console.log(`  ok  ${conformanceCase.name}`);
    } catch (error) {
      failures.push(`${conformanceCase.name}: ${error instanceof Error ? error.message : String(error)}`);
      console.log(`FAIL  ${conformanceCase.name}`);
    }
  }
} finally {
  removeStorageTree(root);
}

if (failures.length > 0) {
  console.error(`\nstorage conformance FAILED under bun:sqlite (${failures.length} of ${storageConformanceCases.length}):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`\nstorage conformance OK under bun:sqlite — ${storageConformanceCases.length} cases`);
