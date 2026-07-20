import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// Guard (red-team): a static `bun:sqlite` import anywhere under src/ would drag a
// Bun-only module into the Node/vitest graph and fail unrelated suites. History
// is deliberately JSONL. This test fails if that invariant is ever broken.
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".ts")) out.push(p);
  }
  return out;
}

describe("no Bun-only imports in src/", () => {
  it("nothing under packages/cli/src statically imports bun:sqlite or bun:*", () => {
    const srcRoot = join(process.cwd(), "packages", "cli", "src");
    const offenders = walk(srcRoot).filter((f) => {
      const text = readFileSync(f, "utf8");
      return /from\s+["']bun:/.test(text) || /import\s+["']bun:/.test(text);
    });
    expect(offenders).toEqual([]);
  });
});
