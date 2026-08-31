import { describe, it, expect } from "vitest";
import {
  buildProviderMatrix,
  matrixToMarkdown,
  matrixToTerminal,
  MATRIX_PROVIDERS,
  MATRIX_ARTIFACTS,
} from "./provider-matrix.js";

describe("buildProviderMatrix", () => {
  it("is deterministic", () => {
    expect(buildProviderMatrix()).toEqual(buildProviderMatrix());
  });

  it("covers every public provider × artifact", () => {
    const m = buildProviderMatrix();
    for (const p of MATRIX_PROVIDERS) {
      for (const a of MATRIX_ARTIFACTS) {
        expect(m[p][a]).toHaveProperty("verified");
        expect(m[p][a]).toHaveProperty("path");
      }
    }
  });

  it("marks verified cells with a path and skips unverified ones", () => {
    const m = buildProviderMatrix();
    // claude-code is canonical — every artifact verified, hooks land in .claude/hooks.
    expect(m["claude-code"].skill).toEqual({ verified: true, path: ".claude/skills/" });
    expect(m["claude-code"].hook.verified).toBe(true);
    // codex installs to home; hooks are unverified there.
    expect(m.codex.skill.path).toBe("~/.agents/skills/");
    expect(m.codex.hook).toEqual({ verified: false, path: null });
    // antigravity agents are now carried by the `~/.gemini/config/agents/`
    // evidence; its commands stay unverified, as do generic's.
    expect(m.antigravity.agent.verified).toBe(true);
    expect(m.antigravity.command.verified).toBe(false);
    expect(m.generic.command.verified).toBe(false);
    // rules under AGENTS.md mode render as AGENTS.md.
    expect(m.codex.rules.path).toBe("AGENTS.md");
    expect(m["claude-code"].rules.path).toBe(".claude/rules/*.md");
  });
});

describe("matrixToMarkdown", () => {
  it("renders a header + one row per artifact with skip for unverified", () => {
    const md = matrixToMarkdown();
    const lines = md.split("\n");
    expect(lines[0]).toBe("| artifact | claude-code | codex | cursor | antigravity | opencode | omp | grok | dsh | generic |");
    expect(lines).toHaveLength(2 + MATRIX_ARTIFACTS.length);
    expect(md).toContain("| skill | `.claude/skills/`");
    expect(md).toContain("skip"); // antigravity agent etc.
  });
});

describe("matrixToTerminal (branded signature grid)", () => {
  it("plain form: header, one row per artifact, glyphs + legend, no ANSI", () => {
    const grid = matrixToTerminal();
    expect(grid).not.toContain("\x1b["); // color:false default
    expect(grid).toContain("artifact");
    for (const a of MATRIX_ARTIFACTS) expect(grid).toContain(a);
    expect(grid).toContain("◆"); // claude-code canonical
    expect(grid).toContain("✓"); // verified elsewhere
    expect(grid).toContain("· skip"); // unverified
    expect(grid).toContain("canonical"); // legend
  });

  it("colored form emits ANSI", () => {
    expect(matrixToTerminal(undefined, { color: true })).toContain("\x1b[");
  });
});
