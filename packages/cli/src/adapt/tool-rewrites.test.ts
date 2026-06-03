import { describe, it, expect } from "vitest";
import { rewriteTools } from "./tool-rewrites.js";
import { appendFooter, footerHeading } from "./compatibility-footer.js";

const BODY =
  "Use AskUserQuestion, TodoWrite, TaskCreate, TaskUpdate, TaskGet, TaskList, " +
  "the Task tool, Task(Explore), Task(researcher), and SendMessage.";

describe("rewriteTools (codex, verified table)", () => {
  it("byte-matches the claudekit replacements", () => {
    const out = rewriteTools(BODY, "codex");
    expect(out).toBe(
      "Use request_user_input, update_plan, Codex task tracking via update_plan, " +
        "Codex task updates via update_plan, Codex local plan/report reads, " +
        "Codex local plan/task review, the Codex spawn_agent tool, " +
        "spawn_agent(explorer), spawn_agent(researcher), and send_input or final report.",
    );
  });

  it("claude-code/opencode/antigravity are identity", () => {
    for (const p of ["claude-code", "opencode", "antigravity"] as const) {
      expect(rewriteTools(BODY, p)).toBe(BODY);
    }
  });

  it("cursor rewrites Task variants + SendMessage, keeps AskUserQuestion", () => {
    const out = rewriteTools(BODY, "cursor");
    expect(out).toContain("spawn_agent(explorer)");
    expect(out).toContain("send_message");
    expect(out).toContain("AskUserQuestion");
    expect(out).not.toContain("spawn_agentCreate"); // no bare-Task clobber
  });
});

describe("appendFooter (per-provider, marker-gated)", () => {
  it("appends Codex footer when markers present", () => {
    const out = appendFooter("body", "codex", BODY);
    expect(out).toContain("## Codex Compatibility");
  });

  it("does not append when no markers in source", () => {
    expect(appendFooter("body", "codex", "no markers here")).toBe("body");
  });

  it("is idempotent (no double footer)", () => {
    const once = appendFooter("body", "codex", BODY);
    expect(appendFooter(once, "codex", BODY)).toBe(once);
  });

  it("never attaches a Codex footer to a Cursor skill", () => {
    const out = appendFooter("body", "cursor", BODY);
    expect(out).toContain("## Cursor Compatibility");
    expect(out).not.toContain("Codex Compatibility");
  });

  it("claude-code/generic get no footer", () => {
    expect(footerHeading("claude-code")).toBeNull();
    expect(appendFooter("body", "generic", BODY)).toBe("body");
  });
});
