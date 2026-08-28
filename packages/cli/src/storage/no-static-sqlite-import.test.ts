import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Both SQLite modules must stay invisible to every bundler, transformer and type
// resolver that touches this tree. The failure this prevents is not subtle and
// not caught by any other gate:
//
//   `import { DatabaseSync } from "node:sqlite"` compiles cleanly under
//   `bun build --compile` and then kills the shipped binary at module load with
//   `No such built-in module` — on every command, not just the storage ones.
//
// Nothing in the build says no, which is why a test does. `load-sqlite.ts` is
// the one sanctioned door, and it takes the specifier as a parameter.

const SRC = join(fileURLToPath(new URL(".", import.meta.url)), "..");

// Import positions only. `const NODE_SQLITE = "node:sqlite"` is how the drivers
// name the module they will ask for, and is exactly the shape this allows.
const FORBIDDEN = [
  { id: "static import", rx: /\bfrom\s+["'](?:node|bun):sqlite["']/ },
  { id: "bare side-effect import", rx: /^\s*import\s+["'](?:node|bun):sqlite["']/m },
  { id: "literal dynamic import", rx: /\bimport\s*\(\s*["'](?:node|bun):sqlite["']/ },
  { id: "literal require", rx: /\brequire\s*\(\s*["'](?:node|bun):sqlite["']/ },
];

// This file states the forbidden forms as regexes, and `load-sqlite.ts` quotes
// them in prose to explain what each one does. Both are documentation of the
// rule rather than breaches of it.
const SANCTIONED = ["storage/no-static-sqlite-import.test.ts"];

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

describe("no static SQLite import", () => {
  it("finds a source tree to check", () => {
    // A walk that silently returns nothing would make every assertion below pass.
    expect(typescriptFiles(SRC).length).toBeGreaterThan(100);
  });

  it("resolves neither SQLite module at build time, anywhere under src", () => {
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
});
