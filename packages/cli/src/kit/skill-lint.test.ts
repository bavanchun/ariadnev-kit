import { describe, it, expect } from "vitest";
import { lintSkill, DESCRIPTION_MIN, DESCRIPTION_MAX, SKILL_MAX_LINES, SKILL_MAX_LINES_CEILING, REFERENCE_MAX_LINES } from "./skill-lint.js";
import type { Artifact } from "./kit-types.js";

function makeSkill(overrides: Partial<Artifact> & { frontmatter?: Record<string, unknown> } = {}): Artifact {
  const frontmatter = {
    name: "vc:demo",
    description: "Demo skill for linting. Use when exercising the skill lint rules in tests.",
    ...overrides.frontmatter,
  };
  return {
    type: "skill",
    name: "demo",
    frontmatter,
    body: overrides.body ?? "# Demo\n\nShort body.\n",
    raw: overrides.raw ?? "---\nname: vc:demo\n---\n# Demo\n\nShort body.\n",
    sourcePath: "/kit/skills/demo/SKILL.md",
  };
}

describe("lintSkill: description rules", () => {
  it(`rejects descriptions shorter than ${DESCRIPTION_MIN} chars`, () => {
    const res = lintSkill(makeSkill({ frontmatter: { description: "Use it." } }), []);
    expect(res.errors.some((e) => e.includes("description"))).toBe(true);
  });

  it(`rejects descriptions longer than ${DESCRIPTION_MAX} chars`, () => {
    const res = lintSkill(
      makeSkill({ frontmatter: { description: `Use when ${"x".repeat(DESCRIPTION_MAX)}` } }),
      [],
    );
    expect(res.errors.some((e) => e.includes("description"))).toBe(true);
  });

  it("rejects descriptions without a trigger verb", () => {
    const res = lintSkill(
      makeSkill({ frontmatter: { description: "A collection of git workflow conventions and pipelines." } }),
      [],
    );
    expect(res.errors.some((e) => e.includes("trigger"))).toBe(true);
  });

  it("accepts a well-formed description", () => {
    const res = lintSkill(makeSkill(), []);
    expect(res.errors).toEqual([]);
  });
});

describe("lintSkill: frontmatter field allowlist", () => {
  it("rejects unknown frontmatter fields", () => {
    const res = lintSkill(
      makeSkill({ frontmatter: { keywords: ["a"], category: "dev" } }),
      [],
    );
    expect(res.errors.some((e) => e.includes("keywords"))).toBe(true);
    expect(res.errors.some((e) => e.includes("category"))).toBe(true);
  });

  it("accepts optional known fields", () => {
    const res = lintSkill(
      makeSkill({
        frontmatter: {
          "user-invocable": true,
          "allowed-tools": ["Task"],
          "argument-hint": "[x]",
          metadata: { author: "vchun" },
          version: "1.0.0",
          license: "MIT",
        },
      }),
      [],
    );
    expect(res.errors).toEqual([]);
  });

  // Taxonomy field for the growing kit lives under metadata (nested), so it is
  // additive and needs no allowlist change; a bare top-level `category` stays rejected.
  it("accepts metadata.category (taxonomy) but still rejects top-level category", () => {
    const nested = lintSkill(makeSkill({ frontmatter: { metadata: { category: "core-loop" } } }), []);
    expect(nested.errors).toEqual([]);
    const topLevel = lintSkill(makeSkill({ frontmatter: { category: "core-loop" } }), []);
    expect(topLevel.errors.some((e) => e.includes("category"))).toBe(true);
  });
});

describe("lintSkill: size limits", () => {
  it(`rejects SKILL.md over ${SKILL_MAX_LINES} lines`, () => {
    const raw = Array.from({ length: SKILL_MAX_LINES + 1 }, (_, i) => `line ${i}`).join("\n");
    const res = lintSkill(makeSkill({ raw }), []);
    expect(res.errors.some((e) => e.includes(`${SKILL_MAX_LINES}`))).toBe(true);
  });

  it("allows metadata.maxLines override up to the ceiling", () => {
    const raw = Array.from({ length: 350 }, (_, i) => `line ${i}`).join("\n");
    const res = lintSkill(
      makeSkill({ raw, frontmatter: { metadata: { maxLines: 400 } } }),
      [],
    );
    expect(res.errors).toEqual([]);
  });

  it(`rejects metadata.maxLines above the ${SKILL_MAX_LINES_CEILING} ceiling`, () => {
    const res = lintSkill(
      makeSkill({ frontmatter: { metadata: { maxLines: 500 } } }),
      [],
    );
    expect(res.errors.some((e) => e.includes(`${SKILL_MAX_LINES_CEILING}`))).toBe(true);
  });

  it(`rejects reference files over ${REFERENCE_MAX_LINES} lines`, () => {
    const big = Array.from({ length: REFERENCE_MAX_LINES + 1 }, () => "x").join("\n");
    const res = lintSkill(makeSkill(), [{ name: "big.md", content: big }]);
    expect(res.errors.some((e) => e.includes("big.md"))).toBe(true);
  });
});

describe("lintSkill: duplicate heading heuristic (warning only)", () => {
  it("warns when SKILL.md and a reference share a heading", () => {
    const res = lintSkill(
      makeSkill({ body: "# Demo\n\n## Commit Standards\n\ntext\n" }),
      [{ name: "commits.md", content: "## Commit Standards\n\nmore text\n" }],
    );
    expect(res.errors).toEqual([]);
    expect(res.warnings.some((w) => w.includes("Commit Standards"))).toBe(true);
  });

  it("does not warn on distinct headings", () => {
    const res = lintSkill(
      makeSkill({ body: "# Demo\n\n## Workflow\n" }),
      [{ name: "ref.md", content: "## Details\n" }],
    );
    expect(res.warnings).toEqual([]);
  });
});
