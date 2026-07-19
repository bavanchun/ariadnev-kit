import { describe, it, expect } from "vitest";
import { adaptArtifact } from "./adapt.js";
import type { Artifact } from "../kit/kit-types.js";

// Synthetic fixture: adaptation behavior must not depend on real kit content.
const body = [
  "# Sample Skill",
  "",
  "Use the `Task tool` to spawn `Task(Explore)` when input is ambiguous, ask",
  "via `AskUserQuestion`, and track steps with `TodoWrite`. The runnable",
  "helper lives at `.claude/skills/sample-skill/scripts/echo.ts`.",
  "",
].join("\n");

const sample: Artifact = {
  type: "skill",
  name: "sample-skill",
  frontmatter: {
    name: "vc:sample-skill",
    description: "Fixture skill for adapt tests. Use when verifying provider adaptation.",
    "allowed-tools": ["Task", "AskUserQuestion", "TodoWrite"],
  },
  body,
  raw: `---\nname: vc:sample-skill\n---\n\n${body}`,
  sourcePath: "/kit/skills/sample-skill/SKILL.md",
};

describe("adaptArtifact orchestration", () => {
  it("claude-code is identity-ish (frontmatter + body preserved)", () => {
    const out = adaptArtifact(sample, "claude-code");
    expect(out).toMatch(/name: ['"]?vc:sample-skill['"]?/);
    expect(out).toContain("Task tool");
    expect(out).not.toContain("Compatibility");
  });

  it("codex: paths + tools rewritten in body, frontmatter tools adapted, footer added", () => {
    const out = adaptArtifact(sample, "codex");
    expect(out).toContain("$HOME/.agents/skills/sample-skill/scripts/echo.ts");
    expect(out).toContain("spawn_agent(explorer)");
    expect(out).toContain("request_user_input");
    expect(out).toContain("## Codex Compatibility");
    // frontmatter allowed-tools adapted
    expect(out).toMatch(/allowed-tools:[\s\S]*spawn_agent/);
  });

  it("cursor gets Cursor footer, never Codex footer", () => {
    const out = adaptArtifact(sample, "cursor");
    expect(out).toContain("## Cursor Compatibility");
    expect(out).not.toContain("Codex Compatibility");
  });

  it("composition order: footer appended after body rewrites", () => {
    const out = adaptArtifact(sample, "codex");
    const bodyStart = out.indexOf("# Sample Skill");
    const footer = out.indexOf("## Codex Compatibility");
    expect(footer).toBeGreaterThan(bodyStart);
  });
});
