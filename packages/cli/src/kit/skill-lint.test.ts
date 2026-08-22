import { describe, it, expect } from "vitest";
import {
  lintSkill,
  DESCRIPTION_MIN,
  DESCRIPTION_MAX,
  SKILL_MAX_LINES,
  SKILL_MAX_LINES_CEILING,
  REFERENCE_MAX_LINES,
  REQUIRED_SECTIONS,
} from "./skill-lint.js";
import type { Artifact } from "./kit-types.js";

const REQUIRED_BODY = `# Demo

Short body.

## Output format

Output.

## Quality gates

- Check.

## Workflow position

Related: none.
`;

function makeSkill(overrides: Partial<Artifact> & { frontmatter?: Record<string, unknown> } = {}): Artifact {
  const overrideMetadata = overrides.frontmatter?.metadata;
  const frontmatter = {
    name: "av:demo",
    description: "Demo skill for linting. Use when exercising the skill lint rules in tests.",
    ...overrides.frontmatter,
    metadata: {
      author: "ariadnev",
      ...(typeof overrideMetadata === "object" && overrideMetadata !== null ? overrideMetadata : {}),
    },
  };
  return {
    type: "skill",
    name: "demo",
    frontmatter,
    body: overrides.body ?? REQUIRED_BODY,
    raw: overrides.raw ?? "---\nname: av:demo\n---\n# Demo\n\nShort body.\n",
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
      makeSkill({ frontmatter: { widgets: ["a"], flavour: "dev" } }),
      [],
    );
    expect(res.errors.some((e) => e.includes("widgets"))).toBe(true);
    expect(res.errors.some((e) => e.includes("flavour"))).toBe(true);
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
  // Taxonomy is accepted in both positions. `metadata.category` was the only
  // spelling while skills were re-authored here; the authored corpus the kit now
  // carries verbatim puts `category` and `keywords` at the top level, and
  // rejecting that would fail every ported skill.
  it("accepts category nested under metadata or at the top level", () => {
    expect(lintSkill(makeSkill({ frontmatter: { metadata: { category: "core-loop" } } }), []).errors).toEqual([]);
    expect(lintSkill(makeSkill({ frontmatter: { category: "core-loop" } }), []).errors).toEqual([]);
  });
});

describe("lintSkill: required sections", () => {
  for (const section of REQUIRED_SECTIONS) {
    it(`rejects a skill missing ${section}`, () => {
      const body = REQUIRED_BODY.replace(`${section}\n\n`, "");
      const res = lintSkill(makeSkill({ body }), []);
      expect(res.errors).toContain(
        `/kit/skills/demo/SKILL.md: skill "demo" missing required section "${section}"`,
      );
    });
  }

  it("matches required section names case-sensitively", () => {
    const body = REQUIRED_BODY.replace("## Output format", "## Output Format");
    const res = lintSkill(makeSkill({ body }), []);
    expect(res.errors.some((e) => e.includes('"## Output format"'))).toBe(true);
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
      makeSkill({ body: `${REQUIRED_BODY}\n## Commit Standards\n\ntext\n` }),
      [{ name: "commits.md", content: "## Commit Standards\n\nmore text\n" }],
    );
    expect(res.errors).toEqual([]);
    expect(res.warnings.some((w) => w.includes("Commit Standards"))).toBe(true);
  });

  it("does not warn on distinct headings", () => {
    const res = lintSkill(
      makeSkill({ body: REQUIRED_BODY }),
      [{ name: "ref.md", content: "## Details\n" }],
    );
    expect(res.warnings).toEqual([]);
  });
});

describe("frontmatter vocabulary matches the real skill corpus", () => {
  // These six fields appear across the authored skill corpus. Rejecting them
  // would make every ported skill fail lint; accepting anything would let a
  // typo through. The set is exactly what the corpus uses, nothing wider.
  const CORPUS_FIELDS = ["when_to_use", "keywords", "category", "related", "maturity", "languages"];

  for (const field of CORPUS_FIELDS) {
    it(`accepts ${field}`, () => {
      const res = lintSkill(makeSkill({ frontmatter: { [field]: "value" } }), []);
      expect(res.errors).toEqual([]);
    });
  }

  it("still rejects a field outside the vocabulary", () => {
    const res = lintSkill(makeSkill({ frontmatter: { keywrods: "typo" } }), []);
    expect(res.errors.join("\n")).toMatch(/keywrods/);
  });
});

describe("lintSkill: Workflow position names something", () => {
  /** REQUIRED_BODY with a different Workflow position section. */
  const withPosition = (text: string): string =>
    REQUIRED_BODY.replace("Related: none.\n", `${text}\n`);

  it("rejects a Workflow position that names neither a skill nor none", () => {
    const res = lintSkill(makeSkill({ body: withPosition("Fits into the wider workflow.") }), []);
    expect(res.errors.some((e) => e.includes("Workflow position"))).toBe(true);
  });

  it("accepts a Workflow position naming an av slug", () => {
    const res = lintSkill(makeSkill({ body: withPosition("Follows av:plan, hands off to av:ship.") }), []);
    expect(res.errors).toEqual([]);
  });

  it("accepts the explicit none escape", () => {
    const res = lintSkill(makeSkill({ body: withPosition("**Typically precedes:** none") }), []);
    expect(res.errors).toEqual([]);
  });

  // The escape has to be the whole answer, not a word in a sentence. Each of
  // these slipped past an earlier attempt that only anchored to a line start or
  // to a colon, and a test covering the mid-sentence case alone certified a hole
  // it did not close.
  const PROSE = [
    "Runs standalone; none of the other skills depend on it.",
    "None of the other skills depend on this one.",
    "Caveat: none of this applies to CI runs.",
    "This skill has none.",
  ];
  for (const prose of PROSE) {
    it(`does not accept ${JSON.stringify(prose.slice(0, 34))}…`, () => {
      const res = lintSkill(makeSkill({ body: withPosition(prose) }), []);
      expect(res.errors.some((e) => e.includes("Workflow position"))).toBe(true);
    });
  }

  // The label shapes the corpus and the scaffold actually write.
  for (const declaration of ["Related: none.", "**Typically precedes:** none", "None.", "- Related: none"]) {
    it(`accepts ${JSON.stringify(declaration)}`, () => {
      expect(lintSkill(makeSkill({ body: withPosition(declaration) }), []).errors).toEqual([]);
    });
  }

  // Two spaces after `##` is still the same heading to `REQUIRED_SECTIONS`. If
  // the body lookup disagrees, the section is "present" and its content is never
  // read — the gate turns itself off and says nothing.
  for (const heading of ["##  Workflow position", "##\tWorkflow position"]) {
    it(`still fires when the heading is written ${JSON.stringify(heading)}`, () => {
      const body = REQUIRED_BODY.replace("## Workflow position\n\nRelated: none.\n", `${heading}\n\nFits into the wider workflow.\n`);
      const res = lintSkill(makeSkill({ body }), []);
      expect(res.errors.some((e) => e.includes("Workflow position"))).toBe(true);
    });
  }

  // The rule is a house check, so a name on the exemption list escapes it —
  // that, and not `metadata.origin`, is what decides severity since ADR 0013.
  // The finding still has to be produced, or the backlog cannot be counted.
  it("holds the finding for a listed skill instead of skipping the check", () => {
    const body = withPosition("Fits into the wider workflow.");
    const listed = lintSkill(makeSkill({ body }), [], new Set(["demo"]));
    expect(listed.errors).toEqual([]);
    expect(listed.held.some((h) => h.includes("Workflow position"))).toBe(true);

    const unlisted = lintSkill(makeSkill({ body }), [], new Set(["other"]));
    expect(unlisted.errors.some((e) => e.includes("Workflow position"))).toBe(true);
    expect(unlisted.held).toEqual([]);
  });
});

describe("lintSkill: held findings are separated from warnings", () => {
  // The exemption backlog has to be countable on its own. Mixing it with
  // findings that hold for every skill produced a number that overstated the
  // backlog and could never reach zero, even with the list empty.
  it("routes suppressed house findings to held, not warnings", () => {
    const longRef = { name: "references/big.md", content: "x\n".repeat(REFERENCE_MAX_LINES + 10) };
    const res = lintSkill(makeSkill(), [longRef], new Set(["demo"]));
    expect(res.errors).toEqual([]);
    expect(res.held.some((h) => h.includes("references/big.md"))).toBe(true);
    expect(res.warnings).toEqual([]);
  });

  it("keeps the duplicate-heading warning out of held for a listed skill", () => {
    const dupe = { name: "references/dupe.md", content: "## Output format\n" };
    const res = lintSkill(makeSkill(), [dupe], new Set(["demo"]));
    expect(res.warnings.some((w) => w.includes("Output format"))).toBe(true);
    expect(res.held).toEqual([]);
  });

  // Missing required sections were skipped outright for listed skills. 301
  // findings existed across the corpus and no command could see one of them.
  it("reports a listed skill's missing sections as held", () => {
    const res = lintSkill(makeSkill({ body: "# Demo\n\nNothing else.\n" }), [], new Set(["demo"]));
    expect(res.errors).toEqual([]);
    expect(res.held.filter((h) => h.includes("missing required section"))).toHaveLength(3);
  });
});
