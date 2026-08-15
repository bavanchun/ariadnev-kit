// Writes the checked-in JSON Schema from the TypeScript definition. Run via
// `pnpm --filter @ariadnev/cli generate:config-schema`; a test fails if the
// checked-in file and the definition drift apart.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildJsonSchema, SCHEMA_FILE_RELATIVE } from "../src/config/json-schema.js";

const repoRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..");
const target = join(repoRoot, SCHEMA_FILE_RELATIVE);
writeFileSync(target, `${JSON.stringify(buildJsonSchema(), null, 2)}\n`);
console.log(`wrote ${SCHEMA_FILE_RELATIVE}`);
