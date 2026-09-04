// Writes the checked-in JSON Schema from the TypeScript definition. Run via
// `pnpm --filter @ariadnev/cli generate:config-schema`; a test fails if the
// checked-in file and the definition drift apart.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildJsonSchema, SCHEMA_FILE_RELATIVE } from "../src/config/json-schema.js";
import {
  buildHookConfigTable,
  HOOK_TABLE_FILE_RELATIVE,
  SKILL_TABLE_FILE_RELATIVE,
} from "../src/config/hook-config-table.js";

const repoRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..");
writeFileSync(join(repoRoot, SCHEMA_FILE_RELATIVE), `${JSON.stringify(buildJsonSchema(), null, 2)}\n`);
console.log(`wrote ${SCHEMA_FILE_RELATIVE}`);

// The hook processes cannot import the TypeScript definition, so they get a
// generated copy of the field table rather than a hand-kept second list.
const table = buildHookConfigTable();
for (const relative of [HOOK_TABLE_FILE_RELATIVE, SKILL_TABLE_FILE_RELATIVE]) {
  writeFileSync(join(repoRoot, relative), table);
  console.log(`wrote ${relative}`);
}
