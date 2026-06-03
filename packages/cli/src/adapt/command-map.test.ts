import { describe, it, expect } from "vitest";
import { mapCommand } from "./command-map.js";
import { CODEX_COMMANDS_DIR } from "./paths.js";
import type { Artifact } from "../kit/kit-types.js";

const cmd: Artifact = {
  type: "command",
  name: "sample-cmd",
  frontmatter: { description: "Run echo.", agent: "sample-reviewer", "argument-hint": "[text]" },
  body: "Use AskUserQuestion. Assets at .claude/skills/.",
  raw: "---\ndescription: Run echo.\n---\nbody",
  sourcePath: "/x/sample-cmd.md",
};

describe("mapCommand", () => {
  it("codex relPath uses shared CODEX_COMMANDS_DIR constant", () => {
    const m = mapCommand(cmd, "codex");
    expect(m.relPath).toBe(`${CODEX_COMMANDS_DIR}/sample-cmd.md`);
    expect(m.content).toContain("request_user_input");
  });

  it("opencode strips Claude frontmatter, plural dir, path-rewrites body", () => {
    const m = mapCommand(cmd, "opencode");
    expect(m.relPath).toBe(".opencode/commands/sample-cmd.md");
    expect(m.content).toContain("agent: sample-reviewer");
    expect(m.content).toContain(".opencode/skills/");
    expect(m.content).toContain("AskUserQuestion"); // opencode tool identity
  });

  it("cursor emits commands/<name>.md", () => {
    expect(mapCommand(cmd, "cursor").relPath).toBe("commands/sample-cmd.md");
  });

  it("claude-code is unchanged dir", () => {
    expect(mapCommand(cmd, "claude-code").relPath).toBe("commands/sample-cmd.md");
  });
});
