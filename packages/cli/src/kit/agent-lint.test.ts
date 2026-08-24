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
  "Use this agent when scouting a codebase, needing a fast file map, or tracing how modules relate. <example>Example: user asks to find auth code; assistant delegates to av-explore.</example><commentary>Fast read-only scan avoids the main agent burning context on broad greps.</commentary>";

function makeAgent(overrides: Partial<Artifact> & { frontmatter?: Record<string, unknown> } = {}): Artifact {
  const frontmatter = {
    name: "av-demo",
    description: okDescription,
    ...overrides.frontmatter,
  };
  const body = overrides.body ?? "# Demo\n\nPersona.\n\n## Behavioral Checklist\n\n- [ ] Item\n";
  return {
    type: "agent",
    name: "av-demo",
    frontmatter,
    body,
    raw: overrides.raw ?? `---\nname: av-demo\n---\n${body}`,
    sourcePath: "/kit/agents/av-demo.md",
  };
}

describe("lintAgent: name contract", () => {
  it("holds an agent without the av- prefix to every house rule", () => {
    // No agent file carries the prefix, so a prefix-keyed exemption would
    // exempt all of them and the gate would certify nothing. Every shipped
    // agent meets the rules now; the lint must be able to say so.
    const body = "# Demo\n\nJust a persona, no checklist.\n";
    const res = lintAgent(
      makeAgent({ frontmatter: { name: "demo", description: okDescription }, body, raw: `---\nname: demo\n---\n${body}` }),
      "demo",
    );
    expect(res.errors.some((e) => e.includes("Behavioral Checklist"))).toBe(true);
  });

  it("rejects a name that differs from the file stem only by case", () => {
    // A provider addresses the agent by the declared name, so `Demo` in a
    // file called demo.md is reachable under one spelling and granted under
    // the other.
    const res = lintAgent(makeAgent({ frontmatter: { name: "Demo", description: okDescription } }), "demo");
    expect(res.errors.some((e) => e.includes("demo"))).toBe(true);
  });

  it("accepts `name: Explore` on explore.md, and nothing else", () => {
    // Claude Code ships a built-in `Explore` subagent type and ten agents grant
    // `Task(Explore)` against it; lowercasing the name would orphan those
    // grants. The exception is the one file, not a case-insensitive rule.
    expect(lintAgent(makeAgent({ frontmatter: { name: "Explore", description: okDescription } }), "explore").errors).toEqual([]);
    expect(lintAgent(makeAgent({ frontmatter: { name: "Explore", description: okDescription } }), "scout").errors.length).toBeGreaterThan(0);
    expect(lintAgent(makeAgent({ frontmatter: { name: "EXPLORE", description: okDescription } }), "explore").errors.length).toBeGreaterThan(0);
  });

  it("rejects name/file-stem mismatch", () => {
    const res = lintAgent(makeAgent(), "av-other");
    expect(res.errors.some((e) => e.includes("av-other"))).toBe(true);
  });

  it("accepts a matching av- name", () => {
    const res = lintAgent(makeAgent(), "av-demo");
    expect(res.errors).toEqual([]);
  });
});

describe("lintAgent: description contract", () => {
  it(`rejects descriptions shorter than ${DESCRIPTION_MIN} chars`, () => {
    const res = lintAgent(makeAgent({ frontmatter: { description: "Too short." } }), "av-demo");
    expect(res.errors.some((e) => e.includes("description"))).toBe(true);
  });

  it(`rejects descriptions longer than ${DESCRIPTION_MAX} chars`, () => {
    const res = lintAgent(
      makeAgent({ frontmatter: { description: `Use when x. ${"y".repeat(DESCRIPTION_MAX)}` } }),
      "av-demo",
    );
    expect(res.errors.some((e) => e.includes("description"))).toBe(true);
  });

  it("rejects a description with no <example>/<commentary> pair", () => {
    const res = lintAgent(
      makeAgent({ frontmatter: { description: "Use this agent for scouting a codebase fast and reliably." } }),
      "av-demo",
    );
    expect(res.errors.some((e) => e.includes("example"))).toBe(true);
  });
});

describe("lintAgent: tools + model contract", () => {
  it("rejects an invalid model value", () => {
    const res = lintAgent(makeAgent({ frontmatter: { model: "gpt-5" } }), "av-demo");
    expect(res.errors.some((e) => e.includes("model"))).toBe(true);
  });

  it(`accepts model values in ${VALID_MODELS.join("/")}`, () => {
    for (const model of VALID_MODELS) {
      const res = lintAgent(makeAgent({ frontmatter: { model } }), "av-demo");
      expect(res.errors).toEqual([]);
    }
  });

  it("accepts tools as a comma string or an array", () => {
    expect(lintAgent(makeAgent({ frontmatter: { tools: "Read, Grep" } }), "av-demo").errors).toEqual([]);
    expect(lintAgent(makeAgent({ frontmatter: { tools: ["Read", "Grep"] } }), "av-demo").errors).toEqual([]);
  });

  it("rejects a non-string/array tools value", () => {
    const res = lintAgent(makeAgent({ frontmatter: { tools: 42 } }), "av-demo");
    expect(res.errors.some((e) => e.includes("tools"))).toBe(true);
  });
});

describe("lintAgent: body contract", () => {
  it(`rejects a body over ${AGENT_MAX_LINES} lines`, () => {
    const body = Array.from({ length: AGENT_MAX_LINES + 1 }, (_, i) => `line ${i}`).join("\n");
    const res = lintAgent(makeAgent({ body, raw: `---\nname: av-demo\n---\n${body}` }), "av-demo");
    expect(res.errors.some((e) => e.includes(`${AGENT_MAX_LINES}`))).toBe(true);
  });

  it("rejects a body missing the Behavioral Checklist heading", () => {
    const body = "# Demo\n\nJust a persona, no checklist.\n";
    const res = lintAgent(makeAgent({ body, raw: `---\nname: av-demo\n---\n${body}` }), "av-demo");
    expect(res.errors.some((e) => e.includes("Behavioral Checklist"))).toBe(true);
  });

  it("accepts a well-formed agent", () => {
    expect(lintAgent(makeAgent(), "av-demo").errors).toEqual([]);
  });
});
