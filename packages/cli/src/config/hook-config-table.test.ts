import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildHookConfigTable,
  HOOK_TABLE_FILE_RELATIVE,
  SKILL_TABLE_FILE_RELATIVE,
} from "./hook-config-table.js";

const repoRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..", "..");

describe("the generated config-field table", () => {
  // The dependency-free consumers cannot import the TypeScript definition, so
  // their copies are generated. Nothing else stops a hand edit to a copy, or a
  // schema change landing without the regeneration.
  for (const relative of [HOOK_TABLE_FILE_RELATIVE, SKILL_TABLE_FILE_RELATIVE]) {
    it(`matches the generator at ${relative}`, () => {
      const checkedIn = readFileSync(join(repoRoot, relative), "utf8");
      expect(checkedIn, "run `pnpm --filter ariadnev generate:config-schema`").toBe(buildHookConfigTable());
    });
  }

  it("ships the same bytes to every consumer", () => {
    // Two copies of one rule only stay one rule while they are identical.
    const [hooks, skill] = [HOOK_TABLE_FILE_RELATIVE, SKILL_TABLE_FILE_RELATIVE].map((r) =>
      readFileSync(join(repoRoot, r), "utf8"),
    );
    expect(skill).toBe(hooks);
  });
});
