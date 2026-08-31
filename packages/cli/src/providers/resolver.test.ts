import { describe, it, expect } from "vitest";
import { getResolver, PROVIDER_IDS } from "./index.js";
import { CODEX_COMMANDS_DIR } from "../adapt/paths.js";
import type { Artifact } from "../kit/kit-types.js";
import { loadKit, resolveKitRoot } from "../kit/load-kit.js";

const ctx = { home: "/home/u", cwd: "/proj", scope: "project" as const };
const art = (type: Artifact["type"], name: string): Artifact => ({
  type, name, frontmatter: {}, body: "", raw: "", sourcePath: `/k/${name}`,
});

describe("resolver target matrix", () => {
  it("claude-code project paths", () => {
    const r = getResolver("claude-code");
    expect(r.targetFor(art("skill", "x"), ctx)).toBe("/proj/.claude/skills/av-x");
    expect(r.targetFor(art("agent", "a"), ctx)).toBe("/proj/.claude/agents/a.md");
    expect(r.targetFor(art("command", "c"), ctx)).toBe("/proj/.claude/commands/c.md");
  });

  it("codex is home-rooted for the kinds it was observed to load", () => {
    const r = getResolver("codex");
    // Both paths were confirmed by running `codex debug prompt-input` and
    // seeing the installed artifacts in the prompt codex builds.
    expect(r.targetFor(art("skill", "x"), ctx)).toBe("/home/u/.agents/skills/av-x");
    expect(r.targetFor(art("agent", "a"), ctx)).toBe("/home/u/.codex/agents/a.toml");
  });

  it("codex commands resolve to null — written but never observed being read", () => {
    // The file lands at `.codex/commands/<name>.md` and codex never surfaces
    // it. Rather than keep an unevidenced claim, the cell is unverified, so
    // the installer skips and logs instead of writing something inert.
    expect(getResolver("codex").targetFor(art("command", "c"), ctx)).toBeNull();
    expect(CODEX_COMMANDS_DIR).toBe("commands");
  });

  it("omp targets .agents/skills, not the ~/.omp/agent/skills the upstream CLI writes", () => {
    // Pinned because the wrong path looks right from a directory listing. Both
    // `~/.omp/agent/skills` and `~/.agents/skills` exist and are populated on
    // the observation machine; omp's own runtime docs call `~/.omp/agent` the
    // session-storage directory and name `.agent[s]/skills` canonical, with the
    // only skills path beneath `agent/` being the auto-learn `managed-skills`
    // bucket that defers to authored skills. Restoring the upstream path would
    // install into a directory omp treats as scratch.
    const r = getResolver("omp");
    const target = r.targetFor(art("skill", "x"), ctx);
    expect(target).toBe("/proj/.agents/skills/av-x");
    expect(target).not.toContain(".omp/agent");
  });

  it("omp has no command target, because none was documented or observed", () => {
    expect(getResolver("omp").targetFor(art("command", "c"), ctx)).toBeNull();
  });

  it("grok keeps its own Claude-shaped tree", () => {
    // `~/.grok/` holds {agents,hooks,rules,skills} laid out as claude-code's
    // tree does. Sending it to the neutral `.agents` root would write somewhere
    // the observed layout says grok does not look.
    const r = getResolver("grok");
    expect(r.targetFor(art("skill", "x"), ctx)).toBe("/proj/.grok/skills/av-x");
    expect(r.targetFor(art("agent", "a"), ctx)).toBe("/proj/.grok/agents/a.md");
  });

  it("dsh resolves nothing at all, so the installer skips every kind", () => {
    // The config entry exists only because the map is total over ProviderId.
    // Every cell is unverified, so no path of it is ever reachable.
    const r = getResolver("dsh");
    for (const kind of ["skill", "agent", "command", "rules"] as const) {
      expect(r.targetFor(art(kind === "rules" ? "rule" : kind, "x"), ctx), kind).toBeNull();
    }
  });

  it("opencode uses plural dirs", () => {
    const r = getResolver("opencode");
    expect(r.targetFor(art("skill", "x"), ctx)).toBe("/proj/.opencode/skills/av-x");
    expect(r.targetFor(art("agent", "a"), ctx)).toBe("/proj/.opencode/agents/a.md");
    expect(r.targetFor(art("command", "c"), ctx)).toBe("/proj/.opencode/commands/c.md");
  });

  it("generic skips agents/commands (unverified)", () => {
    const r = getResolver("generic");
    expect(r.supports.agent).toBe(false);
    expect(r.supports.command).toBe(false);
    expect(r.targetFor(art("agent", "a"), ctx)).toBeNull();
  });

  it("antigravity targets the gemini config root, home-anchored, and installs agents", () => {
    const r = getResolver("antigravity");
    // Home even at project scope: `~/.gemini/config` is a user-level CLI tree,
    // not a workspace layout, so a per-project copy would be written where
    // nothing reads it.
    expect(r.targetFor(art("skill", "x"), ctx)).toBe("/home/u/.gemini/config/skills/av-x");
    expect(r.targetFor(art("agent", "a"), ctx)).toBe("/home/u/.gemini/config/agents/a.md");
    expect(r.supports.agent).toBe(true);
    // Commands stay unverified — nothing established a path for them.
    expect(r.supports.command).toBe(false);
    expect(r.targetFor(art("command", "c"), ctx)).toBeNull();
  });

  it("global scope roots at home", () => {
    const r = getResolver("claude-code");
    expect(r.targetFor(art("skill", "x"), { ...ctx, scope: "global" })).toBe("/home/u/.claude/skills/av-x");
  });

  /**
   * `targetPathFor` asks for the skills *root* by resolving the empty name, and
   * the README matrix, `av contract --json` and `av kit install-path` all read
   * that answer. Prefixing it unguarded renders every one of them as
   * `…/skills/av-`, which is a directory that never exists.
   */
  it("resolves the empty name to the bare skills root, not a prefixed one", () => {
    for (const id of PROVIDER_IDS) {
      const target = getResolver(id).targetFor(art("skill", ""), ctx);
      if (target === null) continue;
      expect(target.endsWith("skills")).toBe(true);
    }
  });

  it("every provider id resolves", () => {
    for (const id of PROVIDER_IDS) expect(getResolver(id).id).toBe(id);
  });

  /**
   * Cursor installs agents as skill-like dirs in the same `.agents/skills` root
   * the skills use, so both take the prefix. That is only unambiguous while no
   * agent shares a name with a skill — if one ever does, they collide on one
   * directory, and they would have collided before the prefix too.
   */
  it("prefixes cursor's agent shim, which shares the skills root", () => {
    const r = getResolver("cursor");
    expect(r.targetFor(art("agent", "advisor"), ctx)).toBe("/proj/.agents/skills/av-advisor");
    const kit = loadKit(resolveKitRoot(process.cwd()));
    const skills = new Set(kit.skills.map((s) => s.name));
    const collide = kit.agents.map((a) => a.name).filter((n) => skills.has(n));
    expect(collide, "an agent and a skill share a name — they now share a directory").toEqual([]);
  });

  it("test-provider project paths (skills, commands, rules)", () => {
    const r = getResolver("test-provider");
    expect(r.targetFor(art("skill", "x"), ctx)).toBe("/proj/.test-provider/skills/av-x");
    expect(r.targetFor(art("command", "c"), ctx)).toBe("/proj/.test-provider/commands/c.md");
    expect(r.targetFor(art("rule", "r"), ctx)).toBe("/proj/.test-provider/rules/r.md");
    expect(r.scriptsTarget(ctx)).toBe("/proj/.test-provider/scripts");
    expect(r.envTarget(ctx)).toBe("/proj/.test-provider/.env.example");
  });

  it("test-provider skips unverified agents (skip-and-log)", () => {
    const r = getResolver("test-provider");
    expect(r.supports.agent).toBe(false);
    expect(r.targetFor(art("agent", "a"), ctx)).toBeNull();
  });

  it("test-provider global scope roots at home", () => {
    const r = getResolver("test-provider");
    expect(r.targetFor(art("skill", "x"), { ...ctx, scope: "global" }))
      .toBe("/home/u/.test-provider/skills/av-x");
  });
});
