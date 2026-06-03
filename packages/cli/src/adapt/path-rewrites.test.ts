import { describe, it, expect } from "vitest";
import { rewritePaths } from "./path-rewrites.js";

const SAMPLE = [
  "skills at .claude/skills/foo",
  "scripts at .claude/scripts/x.ts",
  "rules at .claude/rules/y.md",
  "agents at .claude/agents/a.md",
  "commands at .claude/commands/c.md",
  "home skills ~/.claude/skills/z",
  "home root ~/.claude/settings",
  "bare .claude/other",
].join("\n");

describe("rewritePaths", () => {
  it("claude-code is identity", () => {
    expect(rewritePaths(SAMPLE, "claude-code")).toBe(SAMPLE);
  });

  it("codex rewrites to $HOME/.agents and .codex targets", () => {
    const out = rewritePaths(SAMPLE, "codex");
    expect(out).toContain("$HOME/.agents/skills/foo");
    expect(out).toContain("$HOME/.agents/vcskill/scripts/x.ts");
    expect(out).toContain("$HOME/.agents/vcskill/rules/y.md");
    expect(out).toContain("$HOME/.codex/agents/a.md");
    expect(out).toContain("$HOME/.codex/commands/c.md");
    expect(out).toContain("$HOME/.agents/skills/z"); // ~/.claude/skills/
    expect(out).toContain("$HOME/.agents/vcskill/settings");
    expect(out).not.toContain(".claude/");
  });

  it("codex ports reduced-scope prefixes (hooks/agent-memory/.ck.json)", () => {
    const out = rewritePaths(".claude/hooks/h .claude/agent-memory/m .claude/.ck.json", "codex");
    expect(out).toContain("$HOME/.agents/vcskill/hooks/h");
    expect(out).toContain(".codex/agent-memory/m");
    expect(out).toContain("$HOME/.agents/vcskill/.ck.json");
    expect(out).not.toContain(".claude/");
  });

  it("longest-prefix-first: ~/.claude/skills/ not clobbered by .claude/skills/", () => {
    const out = rewritePaths("~/.claude/skills/z", "codex");
    expect(out).toBe("$HOME/.agents/skills/z");
    expect(out).not.toContain("~/$HOME");
  });

  it("opencode rewrites .claude/ → .opencode/ and ~/.claude/ → user config", () => {
    const out = rewritePaths("a .claude/skills/x and ~/.claude/y", "opencode");
    expect(out).toContain(".opencode/skills/x");
    expect(out).toContain("~/.config/opencode/y");
  });

  it("cursor/antigravity/generic use neutral .agents", () => {
    for (const p of ["cursor", "antigravity", "generic"] as const) {
      const out = rewritePaths(".claude/skills/x and .claude/other", p);
      expect(out).toContain(".agents/skills/x");
      expect(out).toContain(".agents/other");
    }
  });
});
