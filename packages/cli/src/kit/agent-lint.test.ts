import { describe, it, expect } from "vitest";
import {
  lintAgent,
  AGENT_MAX_LINES,
  DESCRIPTION_MIN,
  DESCRIPTION_MAX,
  VALID_MODELS,
} from "./agent-lint.js";
import type { Artifact } from "./kit-types.js";

const okDescription =
  "Use this agent when scouting a codebase, needing a fast file map, or tracing how modules relate. <example>Example: user asks to find auth code; assistant delegates to vc-explore.</example><commentary>Fast read-only scan avoids the main agent burning context on broad greps.</commentary>";

function makeAgent(overrides: Partial<Artifact> & { frontmatter?: Record<string, unknown> } = {}): Artifact {
  const frontmatter = {
    name: "vc-demo",
    description: okDescription,
    ...overrides.frontmatter,
  };
  const body = overrides.body ?? "# Demo\n\nPersona.\n\n## Behavioral Checklist\n\n- [ ] Item\n";
  return {
    type: "agent",
    name: "vc-demo",
    frontmatter,
    body,
    raw: overrides.raw ?? `---\nname: vc-demo\n---\n${body}`,
    sourcePath: "/kit/agents/vc-demo.md",
  };
}

describe("lintAgent: name contract", () => {
  it("rejects a name without vc- prefix", () => {
    const res = lintAgent(makeAgent({ frontmatter: { name: "demo", description: okDescription } }), "demo");
    expect(res.errors.some((e) => e.includes("vc-"))).toBe(true);
  });

  it("rejects name/file-stem mismatch", () => {
    const res = lintAgent(makeAgent(), "vc-other");
    expect(res.errors.some((e) => e.includes("vc-other"))).toBe(true);
  });

  it("accepts a matching vc- name", () => {
    const res = lintAgent(makeAgent(), "vc-demo");
    expect(res.errors).toEqual([]);
  });
});

describe("lintAgent: description contract", () => {
  it(`rejects descriptions shorter than ${DESCRIPTION_MIN} chars`, () => {
    const res = lintAgent(makeAgent({ frontmatter: { description: "Too short." } }), "vc-demo");
    expect(res.errors.some((e) => e.includes("description"))).toBe(true);
  });

  it(`rejects descriptions longer than ${DESCRIPTION_MAX} chars`, () => {
    const res = lintAgent(
      makeAgent({ frontmatter: { description: `Use when x. ${"y".repeat(DESCRIPTION_MAX)}` } }),
      "vc-demo",
    );
    expect(res.errors.some((e) => e.includes("description"))).toBe(true);
  });

  it("rejects a description with no <example>/<commentary> pair", () => {
    const res = lintAgent(
      makeAgent({ frontmatter: { description: "Use this agent for scouting a codebase fast and reliably." } }),
      "vc-demo",
    );
    expect(res.errors.some((e) => e.includes("example"))).toBe(true);
  });
});

describe("lintAgent: tools + model contract", () => {
  it("rejects an invalid model value", () => {
    const res = lintAgent(makeAgent({ frontmatter: { model: "gpt-5" } }), "vc-demo");
    expect(res.errors.some((e) => e.includes("model"))).toBe(true);
  });

  it(`accepts model values in ${VALID_MODELS.join("/")}`, () => {
    for (const model of VALID_MODELS) {
      const res = lintAgent(makeAgent({ frontmatter: { model } }), "vc-demo");
      expect(res.errors).toEqual([]);
    }
  });

  it("accepts tools as a comma string or an array", () => {
    expect(lintAgent(makeAgent({ frontmatter: { tools: "Read, Grep" } }), "vc-demo").errors).toEqual([]);
    expect(lintAgent(makeAgent({ frontmatter: { tools: ["Read", "Grep"] } }), "vc-demo").errors).toEqual([]);
  });

  it("rejects a non-string/array tools value", () => {
    const res = lintAgent(makeAgent({ frontmatter: { tools: 42 } }), "vc-demo");
    expect(res.errors.some((e) => e.includes("tools"))).toBe(true);
  });
});

describe("lintAgent: body contract", () => {
  it(`rejects a body over ${AGENT_MAX_LINES} lines`, () => {
    const body = Array.from({ length: AGENT_MAX_LINES + 1 }, (_, i) => `line ${i}`).join("\n");
    const res = lintAgent(makeAgent({ body, raw: `---\nname: vc-demo\n---\n${body}` }), "vc-demo");
    expect(res.errors.some((e) => e.includes(`${AGENT_MAX_LINES}`))).toBe(true);
  });

  it("rejects a body missing the Behavioral Checklist heading", () => {
    const body = "# Demo\n\nJust a persona, no checklist.\n";
    const res = lintAgent(makeAgent({ body, raw: `---\nname: vc-demo\n---\n${body}` }), "vc-demo");
    expect(res.errors.some((e) => e.includes("Behavioral Checklist"))).toBe(true);
  });

  it("accepts a well-formed agent", () => {
    expect(lintAgent(makeAgent(), "vc-demo").errors).toEqual([]);
  });
});
