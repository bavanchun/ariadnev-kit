import { describe, it, expect } from "vitest";
import {
  parseFrontmatter,
  serializeFrontmatter,
  adaptFrontmatterTools,
} from "./frontmatter.js";

describe("frontmatter round-trip", () => {
  it("preserves block scalar + quoted values (no data loss)", () => {
    const raw = `---\nname: vc:x\ndescription: >-\n  a folded\n  description\nallowed-tools:\n  - Task\n  - AskUserQuestion\n---\n\n# Body\n`;
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
