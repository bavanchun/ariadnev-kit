import { describe, it, expect } from "vitest";
import { scoreDescriptions, tokenize, jaccard } from "./description-collision.js";
import { loadKit, resolveKitRoot } from "./load-kit.js";

describe("tokenize", () => {
  it("drops stopwords, trigger verbs, and single chars", () => {
    const t = tokenize("Use this skill to run a database migration");
    expect(t.has("use")).toBe(false);
    expect(t.has("run")).toBe(false);
    expect(t.has("skill")).toBe(false);
    expect(t.has("database")).toBe(true);
    expect(t.has("migration")).toBe(true);
  });
});

describe("scoreDescriptions", () => {
  it("flags a near-duplicate pair as error", () => {
    const pairs = scoreDescriptions([
      { name: "a", description: "migrate database schema changes safely rollback" },
      { name: "b", description: "migrate database schema changes safely rollback support" },
    ]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].level).toBe("error");
  });

  it("flags a partially-similar pair as warn, not error", () => {
    const pairs = scoreDescriptions([
      { name: "a", description: "generate provider matrix documentation table" },
      { name: "b", description: "generate provider matrix json output" },
    ]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].level).toBe("warn");
  });

  it("returns nothing for distinct descriptions", () => {
    const pairs = scoreDescriptions([
      { name: "a", description: "deploy containers to a kubernetes cluster" },
      { name: "b", description: "write landing page headline copy" },
    ]);
    expect(pairs).toHaveLength(0);
  });

  it("calibration: the real kit has zero error-level collisions", () => {
    const kit = loadKit(resolveKitRoot(process.cwd()));
    const skills = kit.skills.map((s) => ({
      name: s.name,
      description: String(s.frontmatter.description ?? ""),
    }));
    const errors = scoreDescriptions(skills).filter((p) => p.level === "error");
    expect(errors).toEqual([]);
  });
});

describe("scoreDescriptions allowlist", () => {
  const nearDup = [
    { name: "vc:x", description: "migrate database schema changes safely rollback" },
    { name: "vc:y", description: "migrate database schema changes safely rollback support" },
  ];

  it("suppresses an allowlisted pair regardless of entry order", () => {
    expect(scoreDescriptions(nearDup)).toHaveLength(1); // error without allowlist
    const allow = [{ a: "vc:y", b: "vc:x", reason: "adjacent by design" }];
    expect(scoreDescriptions(nearDup, allow)).toHaveLength(0);
  });

  it("does not suppress pairs that are not allowlisted", () => {
    const allow = [{ a: "vc:p", b: "vc:q", reason: "unrelated pair" }];
    expect(scoreDescriptions(nearDup, allow)).toHaveLength(1);
  });

  it("treats an empty allowlist the same as no allowlist", () => {
    expect(scoreDescriptions(nearDup, [])).toEqual(scoreDescriptions(nearDup));
  });
});

describe("jaccard", () => {
  it("is 1 for identical sets and 0 for disjoint", () => {
    expect(jaccard(new Set(["x", "y"]), new Set(["x", "y"]))).toBe(1);
    expect(jaccard(new Set(["x"]), new Set(["y"]))).toBe(0);
  });
});
