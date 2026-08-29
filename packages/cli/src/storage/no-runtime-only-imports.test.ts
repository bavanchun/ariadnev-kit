import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// No module that only one runtime has may be resolvable at build time.
//
// This merges two guards that were hunting the same class from opposite ends.
// The earlier one (added by a red team, previously `history/no-bun-sqlite.test.ts`)
// forbade any `bun:*` import under src/, because a Bun-only module dragged into
// the Node/vitest graph fails unrelated suites — history is deliberately JSONL
// for that reason. The storage adapter then needed the same rule pointing the
// other way, at `node:sqlite`. Two overlapping greps with different exemptions
// drift apart; one does not.
//
// The failures on each side are different and both are silent:
//
//   `import { DatabaseSync } from "node:sqlite"` compiles cleanly under
//   `bun build --compile` and then kills the shipped binary at module load —
//   on every command, not just the storage ones.
//
//   `import { Database } from "bun:sqlite"` resolves nowhere under Node, so it
//   takes out whatever suite happens to import the file transitively.
//
// Nothing in either build says no, which is why a test does. `load-sqlite.ts` is
// the one sanctioned door, and it takes the specifier as a parameter.

const SRC = join(fileURLToPath(new URL(".", import.meta.url)), "..");

// Import positions only. `const NODE_SQLITE = "node:sqlite"` is how the drivers
// name the module they will ask for, and is exactly the shape this allows.
const FORBIDDEN = [
  { id: "static import", rx: /\bfrom\s+["'](?:bun:[\w/]+|node:sqlite)["']/ },
  { id: "bare side-effect import", rx: /^\s*import\s+["'](?:bun:[\w/]+|node:sqlite)["']/m },
  { id: "literal dynamic import", rx: /\bimport\s*\(\s*["'](?:bun:[\w/]+|node:sqlite)["']/ },
  { id: "literal require", rx: /\brequire\s*\(\s*["'](?:bun:[\w/]+|node:sqlite)["']/ },
];

// This file states the forbidden forms as regexes, and `load-sqlite.ts` quotes
// them in prose to explain what each one does. Both are documentation of the
// rule rather than breaches of it.
const SANCTIONED = ["storage/no-runtime-only-imports.test.ts"];

/**
 * Comments out, so an explanation of the rule is not read as a violation of it.
 *
 * Deliberately crude — it only ever removes text, so the worst it can do to a
 * pattern that spans a stripped region is stop reporting something that was
 * never an import in the first place.
 */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

function typescriptFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      found.push(...typescriptFiles(path));
    } else if (entry.endsWith(".ts")) {
      found.push(path);
    }
  }
  return found;
}

describe("no runtime-only imports", () => {
  it("finds a source tree to check", () => {
    // A walk that silently returns nothing would make every assertion below pass.
    expect(typescriptFiles(SRC).length).toBeGreaterThan(100);
  });

  it("resolves no Bun-only module and no node:sqlite at build time, anywhere under src", () => {
    const hits: string[] = [];
    for (const path of typescriptFiles(SRC)) {
      const relative = path.slice(SRC.length + 1).split("\\").join("/");
      if (SANCTIONED.includes(relative)) continue;
      const source = code(readFileSync(path, "utf8"));
      for (const { id, rx } of FORBIDDEN) {
        if (rx.test(source)) hits.push(`${relative}: ${id}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it("would catch each forbidden form, and allows the one shape the drivers use", () => {
    // Without this the assertion above passes just as happily against regexes
    // that match nothing at all.
    const offenders = [
      'import { DatabaseSync } from "node:sqlite";',
      'import { Database } from "bun:sqlite";',
      'import { file } from "bun:jsc";',
      'import "bun:sqlite";',
      'const m = await import("node:sqlite");',
      'const m = require("bun:sqlite");',
    ];
    for (const source of offenders) {
      expect(FORBIDDEN.some(({ rx }) => rx.test(code(source))), source).toBe(true);
    }
    const sanctioned = 'const NODE_SQLITE = "node:sqlite";\nloadSqlite(NODE_SQLITE);';
    expect(FORBIDDEN.some(({ rx }) => rx.test(code(sanctioned)))).toBe(false);
  });

  it("leaves ordinary node: builtins alone", () => {
    // Only `node:sqlite` is runtime-conditional. Forbidding `node:fs` would be
    // absurd, and a regex that did would be found the hard way.
    const ordinary = 'import { readFileSync } from "node:fs";\nimport { join } from "node:path";';
    expect(FORBIDDEN.some(({ rx }) => rx.test(code(ordinary)))).toBe(false);
  });
});
