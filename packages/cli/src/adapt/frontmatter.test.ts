import { describe, it, expect } from "vitest";
import {
  parseFrontmatter,
  serializeFrontmatter,
  adaptFrontmatterTools,
} from "./frontmatter.js";

describe("frontmatter round-trip", () => {
  it("preserves block scalar + quoted values (no data loss)", () => {
    const raw = `---\nname: av:x\ndescription: >-\n  a folded\n  description\nallowed-tools:\n  - Task\n  - AskUserQuestion\n---\n\n# Body\n`;
    const { data, body } = parseFrontmatter(raw);
    expect(data.description).toBe("a folded description");
    expect(data["allowed-tools"]).toEqual(["Task", "AskUserQuestion"]);
    const reparsed = parseFrontmatter(serializeFrontmatter(data, body));
    expect(reparsed.data).toEqual(data);
    expect(reparsed.body.trim()).toBe("# Body");
  });

  it("empty frontmatter serializes to body only", () => {
    expect(serializeFrontmatter({}, "# x")).toBe("# x");
  });
});

describe("adaptFrontmatterTools", () => {
  const data = { "allowed-tools": ["Task", "AskUserQuestion", "TodoWrite"], "argument-hint": "[x]" };

  it("codex rewrites tool names in allowed-tools", () => {
    const out = adaptFrontmatterTools(data, "codex");
    expect(out["allowed-tools"]).toEqual(["spawn_agent", "request_user_input", "update_plan"]);
  });

  it("cursor strips AskUserQuestion (no equivalent)", () => {
    const out = adaptFrontmatterTools(data, "cursor");
    expect(out["allowed-tools"]).toEqual(["spawn_agent", "TodoWrite"]);
  });

  it("claude-code is identity", () => {
    const out = adaptFrontmatterTools(data, "claude-code");
    expect(out["allowed-tools"]).toEqual(["Task", "AskUserQuestion", "TodoWrite"]);
  });

  it("handles comma-string allowed-tools", () => {
    const out = adaptFrontmatterTools({ "allowed-tools": "Task, SendMessage" }, "codex");
    expect(out["allowed-tools"]).toEqual(["spawn_agent", "send_input"]);
  });
});

// These pin the antigravity `agent` cell's evidence grade, not just a format.
// That cell is `observed` because agy enumerated two agents this pipeline
// produced; re-emitting a scalar `tools:` or a `model:` key would make agy drop
// them again and quietly void the observation with no change to the table.
describe("the agent `tools:` key, which only antigravity is strict about", () => {
  // agy parses agent frontmatter by type: unknown keys pass through, but a
  // known key of the wrong YAML shape makes it drop the whole agent silently.
  // `tools` must be a sequence, and every kit agent carries Claude Code's
  // comma-separated string — which is why 16 files sat in agy's own discovery
  // root without one of them ever being listed.
  const agent = { name: "Explore", tools: "Glob, Grep, Read, Bash" };

  it("gives antigravity a sequence", () => {
    expect(adaptFrontmatterTools(agent, "antigravity").tools).toEqual(["Glob", "Grep", "Read", "Bash"]);
  });

  it("serializes that sequence as YAML, not as a quoted string", () => {
    const out = serializeFrontmatter(adaptFrontmatterTools(agent, "antigravity"), "# body\n");
    expect(out).toContain("tools:\n  - Glob\n");
    expect(out).not.toContain("tools: Glob, Grep");
  });

  it("keeps the entries verbatim, since no antigravity tool name is verified", () => {
    // toolNames is `none` for this provider. Renaming on a static guess would
    // put unverified identifiers in a file the user reads as authoritative.
    expect(adaptFrontmatterTools({ tools: "Task, AskUserQuestion" }, "antigravity").tools)
      .toEqual(["Task", "AskUserQuestion"]);
  });

  it("leaves every other provider's `tools` exactly as it found it", () => {
    for (const provider of ["claude-code", "codex", "cursor", "opencode", "omp", "grok", "dsh"] as const) {
      expect(adaptFrontmatterTools(agent, provider).tools, provider).toBe("Glob, Grep, Read, Bash");
    }
  });

  it("leaves a `tools` key that is already a sequence alone", () => {
    expect(adaptFrontmatterTools({ tools: ["Read"] }, "antigravity").tools).toEqual(["Read"]);
  });

  it("does not invent the key for an artifact that has none", () => {
    expect("tools" in adaptFrontmatterTools({ name: "x" }, "antigravity")).toBe(false);
  });

  it("drops `model`, which agy rejects in every spelling that was tried", () => {
    // Claude's alias, one of agy's own ids from `agy models`, and an object
    // wrapping that id were each planted on an otherwise-listing agent, and
    // each one made agy drop it. Carrying the key forward would mean shipping
    // an agent that never loads; dropping it means the agent loads on agy's
    // default model, which is the only outcome available.
    const out = adaptFrontmatterTools({ name: "kongming", model: "fable", tools: "Read" }, "antigravity");
    expect("model" in out).toBe(false);
    expect(out.tools).toEqual(["Read"]);
  });

  it("keeps `model` for every provider that has not rejected it", () => {
    for (const provider of ["claude-code", "codex", "cursor", "opencode"] as const) {
      expect(adaptFrontmatterTools({ model: "fable" }, provider).model, provider).toBe("fable");
    }
  });
});
