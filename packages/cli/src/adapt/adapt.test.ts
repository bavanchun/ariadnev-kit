import { describe, it, expect } from "vitest";
import { adaptArtifact } from "./adapt.js";
import { loadKit, resolveKitRoot } from "../kit/load-kit.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const kit = loadKit(resolveKitRoot(join(here, "..", "..", "..", "..", "kit")));
const echo = kit.skills.find((s) => s.name === "echo-tool")!;

describe("adaptArtifact orchestration", () => {
  it("claude-code is identity-ish (frontmatter + body preserved)", () => {
    const out = adaptArtifact(echo, "claude-code");
    expect(out).toMatch(/name: ['"]?vc:echo-tool['"]?/);
    expect(out).toContain("Task tool");
    expect(out).not.toContain("Compatibility");
  });

  it("codex: paths + tools rewritten in body, frontmatter tools adapted, footer added", () => {
    const out = adaptArtifact(echo, "codex");
    expect(out).toContain("$HOME/.agents/skills/echo-tool/scripts/echo.ts");
    expect(out).toContain("spawn_agent(explorer)");
    expect(out).toContain("request_user_input");
    expect(out).toContain("## Codex Compatibility");
    // frontmatter allowed-tools adapted
    expect(out).toMatch(/allowed-tools:[\s\S]*spawn_agent/);
  });

  it("cursor gets Cursor footer, never Codex footer", () => {
    const out = adaptArtifact(echo, "cursor");
    expect(out).toContain("## Cursor Compatibility");
    expect(out).not.toContain("Codex Compatibility");
  });

  it("composition order: footer appended after body rewrites", () => {
    const out = adaptArtifact(echo, "codex");
    const bodyStart = out.indexOf("# Echo Tool");
    const footer = out.indexOf("## Codex Compatibility");
    expect(footer).toBeGreaterThan(bodyStart);
  });
});
