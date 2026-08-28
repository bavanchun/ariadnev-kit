import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_LIMIT, ftsExpression, parseQuery, searchShard } from "./query.js";
import { closeShard, hasFts5, openShard, type OpenShard } from "./shard.js";
import { indexProject } from "./index-project.js";

const dirs: string[] = [];
const mk = () => {
  const dir = mkdtempSync(join(tmpdir(), "ariadnev-query-"));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const NOW = "2026-08-28T00:00:00.000Z";

/** A shard over a small, fixed corpus. */
function corpus(files: Record<string, string>): { shard: OpenShard; close: () => void } {
  const home = mk();
  const root = mk();
  for (const [name, body] of Object.entries(files)) {
    const path = join(root, name);
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, body);
  }
  const shard = openShard(home, root);
  indexProject(shard, root, NOW);
  return { shard, close: () => closeShard(shard) };
}

/**
 * The two engines, run against the identical shard.
 *
 * The fallback is exercised by reading an FTS5-capable shard as though it had
 * no index — which is exactly what a runtime without FTS5 does, and is why the
 * documents live in an ordinary table rather than only inside the FTS index.
 */
const ENGINES = [
  { name: "fts5", fts5: true },
  { name: "plain-scan", fts5: false },
] as const;

describe.each(ENGINES)("the $name engine", ({ name, fts5 }) => {
  if (fts5 && !hasFts5()) {
    it.skip("this runtime has no FTS5, so only the fallback is exercised", () => {});
    return;
  }

  const as = (shard: OpenShard) => ({ database: shard.database, fts5 });

  it("finds a token and reports where", () => {
    const { shard, close } = corpus({ "a.ts": "const answer = 42;\n", "b.ts": "const other = 1;\n" });
    try {
      const result = searchShard(as(shard), "answer");
      expect(result.engine).toBe(name);
      expect(result.hits).toEqual([{ path: "a.ts", line: 1, snippet: "const answer = 42;" }]);
    } finally {
      close();
    }
  });

  it("requires every token to be on one line", () => {
    // A hit the user cannot see when they open the file costs them the trip.
    const { shard, close } = corpus({ "split.ts": "alpha\nbravo\n", "together.ts": "alpha bravo\n" });
    try {
      expect(searchShard(as(shard), "alpha bravo").hits.map((hit) => hit.path)).toEqual(["together.ts"]);
    } finally {
      close();
    }
  });

  it("returns no matches rather than failing when nothing matches", () => {
    const { shard, close } = corpus({ "a.ts": "nothing here\n" });
    try {
      expect(searchShard(as(shard), "absent").hits).toEqual([]);
    } finally {
      close();
    }
  });

  it("honours --limit", () => {
    const files = Object.fromEntries(
      Array.from({ length: 10 }, (_, index) => [`f${index}.ts`, "needle\n"]),
    );
    const { shard, close } = corpus(files);
    try {
      expect(searchShard(as(shard), "needle", { limit: 3 }).hits).toHaveLength(3);
      expect(searchShard(as(shard), "needle").limit).toBe(DEFAULT_LIMIT);
    } finally {
      close();
    }
  });

  it("bounds itself in time and says when the bound bit", () => {
    // Enough work that a 1ms budget cannot survive it: 400 documents whose
    // needle sits on the last of 500 lines, so every hit costs a full scan of
    // the document. Asserting `timed_out` outright rather than "timed out or
    // found something" — the latter is true of a search that ignores the
    // deadline entirely, which is the bug this is here to catch.
    const body = `${"filler\n".repeat(500)}needle\n`;
    const files = Object.fromEntries(Array.from({ length: 400 }, (_, index) => [`f${index}.ts`, body]));
    const { shard, close } = corpus(files);
    try {
      const result = searchShard(as(shard), "needle", { timeoutMs: 1, limit: 500 });
      expect(result.timed_out).toBe(true);
      expect(result.hits.length, "it stopped short of the whole corpus").toBeLessThan(400);
    } finally {
      close();
    }
  });

  it("treats FTS operators as ordinary text rather than syntax", () => {
    // The whole reason the query is parsed: `*` and `NEAR` reaching MATCH are an
    // injection surface and a cost the caller never asked for.
    const { shard, close } = corpus({ "a.ts": "alpha\n", "b.ts": "beta\n" });
    try {
      expect(() => searchShard(as(shard), 'alpha OR "beta*"')).not.toThrow();
      expect(searchShard(as(shard), "alpha*").hits.map((hit) => hit.path)).toEqual(["a.ts"]);
    } finally {
      close();
    }
  });

  it("does not fall over on a quote", () => {
    const { shard, close } = corpus({ "a.ts": 'const s = "quoted";\n' });
    try {
      expect(searchShard(as(shard), 'quoted"').hits.map((hit) => hit.path)).toEqual(["a.ts"]);
    } finally {
      close();
    }
  });
});

describe("both engines answer the same question the same way", () => {
  it("agrees hit for hit over one corpus", () => {
    // The fallback is only safe because this holds it to the primary. A slower
    // path that returns different results is not a fallback, it is a second
    // product.
    if (!hasFts5()) return;
    const { shard, close } = corpus({
      "src/a.ts": "const marker = 1;\n",
      "src/b.ts": "no match here\n",
      "docs/c.md": "the marker again\n",
    });
    try {
      const viaFts = searchShard({ database: shard.database, fts5: true }, "marker");
      const viaScan = searchShard({ database: shard.database, fts5: false }, "marker");
      expect(viaFts.hits.length, "the corpus must actually produce hits").toBeGreaterThan(0);
      expect([...viaFts.hits].sort((a, b) => a.path.localeCompare(b.path)))
        .toEqual([...viaScan.hits].sort((a, b) => a.path.localeCompare(b.path)));
    } finally {
      close();
    }
  });
});

describe("parsing", () => {
  it("keeps paths and dotted identifiers whole", () => {
    expect(parseQuery("src/cli/app.ts")).toEqual(["src/cli/app.ts"]);
    expect(parseQuery("foo.bar_baz-qux")).toEqual(["foo.bar_baz-qux"]);
  });

  it("splits on everything else", () => {
    expect(parseQuery("alpha, beta; gamma")).toEqual(["alpha", "beta", "gamma"]);
  });

  it("refuses a query with nothing searchable in it", () => {
    expect(() => parseQuery("   ")).toThrow(/at least one searchable token/);
    expect(() => parseQuery("!!! ***")).toThrow(/at least one searchable token/);
  });

  it("caps the token count", () => {
    expect(parseQuery(Array.from({ length: 50 }, (_, i) => `t${i}`).join(" "))).toHaveLength(16);
  });

  it("doubles a quote inside a token rather than ending the literal", () => {
    expect(ftsExpression(['a"b'])).toBe('"a""b"');
  });
});

describe("bounds are validated, not silently coerced", () => {
  it("refuses a --limit that is not a positive whole number", () => {
    const { shard, close } = corpus({ "a.ts": "x\n" });
    try {
      expect(() => searchShard(shard, "x", { limit: 0 })).toThrow(/whole number/);
      expect(() => searchShard(shard, "x", { limit: 1.5 })).toThrow(/whole number/);
    } finally {
      close();
    }
  });

  it("refuses a --timeout that is not a positive whole number", () => {
    const { shard, close } = corpus({ "a.ts": "x\n" });
    try {
      expect(() => searchShard(shard, "x", { timeoutMs: -1 })).toThrow(/whole number/);
    } finally {
      close();
    }
  });
});
