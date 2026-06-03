import { describe, it, expect } from "vitest";
import { getResolver, PROVIDER_IDS } from "./index.js";
import { CODEX_COMMANDS_DIR } from "../adapt/paths.js";
import type { Artifact } from "../kit/kit-types.js";

const ctx = { home: "/home/u", cwd: "/proj", scope: "project" as const };
const art = (type: Artifact["type"], name: string): Artifact => ({
  type, name, frontmatter: {}, body: "", raw: "", sourcePath: `/k/${name}`,
});

describe("resolver target matrix", () => {
  it("claude-code project paths", () => {
    const r = getResolver("claude-code");
    expect(r.targetFor(art("skill", "x"), ctx)).toBe("/proj/.claude/skills/x");
    expect(r.targetFor(art("agent", "a"), ctx)).toBe("/proj/.claude/agents/a.md");
    expect(r.targetFor(art("command", "c"), ctx)).toBe("/proj/.claude/commands/c.md");
  });

  it("codex is home-rooted; command dir uses shared constant", () => {
    const r = getResolver("codex");
    expect(r.targetFor(art("skill", "x"), ctx)).toBe("/home/u/.agents/skills/x");
    expect(r.targetFor(art("agent", "a"), ctx)).toBe("/home/u/.codex/agents/a.toml");
    expect(r.targetFor(art("command", "c"), ctx)).toBe(`/home/u/.codex/${CODEX_COMMANDS_DIR}/c.md`);
  });

  it("opencode uses plural dirs", () => {
    const r = getResolver("opencode");
    expect(r.targetFor(art("skill", "x"), ctx)).toBe("/proj/.opencode/skills/x");
    expect(r.targetFor(art("agent", "a"), ctx)).toBe("/proj/.opencode/agents/a.md");
    expect(r.targetFor(art("command", "c"), ctx)).toBe("/proj/.opencode/commands/c.md");
  });

  it("antigravity + generic skip agents/commands (unverified)", () => {
    for (const id of ["antigravity", "generic"] as const) {
      const r = getResolver(id);
      expect(r.supports.agent).toBe(false);
      expect(r.supports.command).toBe(false);
      expect(r.targetFor(art("agent", "a"), ctx)).toBeNull();
    }
  });

  it("global scope roots at home", () => {
    const r = getResolver("claude-code");
    expect(r.targetFor(art("skill", "x"), { ...ctx, scope: "global" })).toBe("/home/u/.claude/skills/x");
  });

  it("every provider id resolves", () => {
    for (const id of PROVIDER_IDS) expect(getResolver(id).id).toBe(id);
  });
});
