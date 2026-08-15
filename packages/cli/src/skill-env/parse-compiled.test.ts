import { describe, it, expect } from "vitest";
import { parseCompiled, ResolutionError } from "./parse-compiled.js";
import { envBudgetWarning, totalBudgetWarning, formatBytes, ENV_BUDGET_BYTES } from "./env-budget.js";

const H = (c: string): string => `sha256:${c.repeat(64)}`;

describe("parseCompiled", () => {
  it("reads a pinned package with its hashes", () => {
    const packages = parseCompiled(`anyio==4.14.2 \\\n    --hash=${H("a")} \\\n    --hash=${H("b")}\n`);
    expect(packages).toEqual([{ name: "anyio", version: "4.14.2", hashes: [H("a"), H("b")] }]);
  });

  it("keeps the marker that decides where the package applies", () => {
    // Drop this and the lock asks pip for a Windows-only distribution on macOS,
    // which fails and takes the whole environment build with it.
    const packages = parseCompiled(`pywin32==312 ; sys_platform == 'win32' \\\n    --hash=${H("c")}\n`);
    expect(packages[0].marker).toBe("sys_platform == 'win32'");
  });

  it("accepts one name twice when the markers are disjoint", () => {
    // A universal resolution does this routinely: numpy resolves to a different
    // version per interpreter range.
    const packages = parseCompiled(
      `numpy==2.2.6 ; python_full_version < '3.11' \\\n    --hash=${H("d")}\n` +
        `numpy==2.5.2 ; python_full_version >= '3.11' \\\n    --hash=${H("e")}\n`,
    );
    expect(packages.map((p) => p.version)).toEqual(["2.2.6", "2.5.2"]);
  });

  it("normalizes the distribution name", () => {
    expect(parseCompiled(`Python_Docx==1.2.0 \\\n    --hash=${H("f")}\n`)[0].name).toBe("python-docx");
  });

  it("ignores comments and blank lines", () => {
    expect(parseCompiled(`# via mcp\n\nsix==1.17.0 \\\n    --hash=${H("a")}\n    # via anyio\n`)).toHaveLength(1);
  });

  it("refuses a resolution it cannot vouch for", () => {
    // Every one of these would otherwise become a lock entry that installs
    // something nothing verified.
    expect(() => parseCompiled("six==1.17.0\n")).toThrow(/without hashes/);
    expect(() => parseCompiled(`--index-url https://example.invalid\nsix==1.17.0 \\\n --hash=${H("a")}\n`)).toThrow(
      /pip option/,
    );
    expect(() => parseCompiled(`    --hash=${H("a")}\n`)).toThrow(/no package/);
    expect(() => parseCompiled("six>=1.17.0\n")).toThrow(ResolutionError);
  });
});

describe("disk budget", () => {
  it("stays quiet for an environment the size of a real one", () => {
    // `design` — numpy, scipy, scikit-learn — measured 246 MB, and all five
    // environments together 659 MB. A budget that complains about those is a
    // budget everyone learns to ignore.
    expect(envBudgetWarning("design", 246 * 1024 * 1024)).toBeNull();
    expect(totalBudgetWarning(659 * 1024 * 1024)).toBeNull();
  });

  it("names the skill and what to look at when one is oversized", () => {
    const warning = envBudgetWarning("design", ENV_BUDGET_BYTES + 1);
    expect(warning).toContain("design");
    expect(warning).toContain("its lock");
    expect(totalBudgetWarning(4 * 1024 * 1024 * 1024)).toContain("ariadnev skill remove");
  });

  it("formats sizes at the scale a reader thinks in", () => {
    expect(formatBytes(246 * 1024 * 1024)).toBe("246 MB");
    expect(formatBytes(2 * 1024 * 1024 * 1024)).toBe("2.0 GB");
  });
});
