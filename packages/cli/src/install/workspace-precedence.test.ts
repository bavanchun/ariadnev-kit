// What an agy session actually reads when another provider was installed into
// the same repository.
//
// antigravity's discovery order puts the workspace customization root
// (CWD→repo root) above the global `~/.gemini/config/` tree this installer
// writes to. `.agents/skills` is a workspace root for cursor, omp, dsh and
// generic under project scope — so installing for any of them, in a repo the
// user later runs `agy` in, puts a *different provider's adaptation* in front
// of antigravity's own install. The two files are not in conflict in the
// `shared-destinations.ts` sense: they are different paths, both correct, and
// the loser is decided by the runtime rather than by write order, which is why
// nothing in the receipt or the conflict summary can see it.
//
// These tests pin the shape of that interaction so it stays a known, testable
// fact rather than a footnote — and so pointing antigravity at `.agents/` (the
// layout it used to inherit) fails here instead of silently collapsing the two
// installs into one path.

import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { adaptArtifact } from "../adapt/adapt.js";
import { makeResolver, type ResolverCtx } from "../providers/resolver.js";
import type { Artifact } from "../kit/kit-types.js";
import type { ProviderId } from "../providers/spec-verified.js";

const PROJECT: ResolverCtx = { home: "/home/u", cwd: "/repo", scope: "project" };

/**
 * Providers whose skills land in the workspace tree agy prefers.
 *
 * `dsh` shares the same layout and is absent because its skill cell is
 * unverified: it installs nothing, so it can outrank nothing.
 */
const WORKSPACE_PROVIDERS: ProviderId[] = ["cursor", "omp", "generic"];

const body = "Run the Task(Explore) tool, then read `.claude/rules/`.\n";
const SKILL: Artifact = {
  type: "skill",
  name: "scout",
  frontmatter: { name: "scout", description: "scout the repo" },
  body,
  raw: `---\nname: scout\ndescription: scout the repo\n---\n${body}`,
  sourcePath: "/kit/skills/scout/SKILL.md",
};

function skillTarget(id: ProviderId, ctx: ResolverCtx = PROJECT): string | null {
  return makeResolver(id).targetFor(SKILL, ctx);
}

describe("an agy session in a repo another provider installed into", () => {
  it("finds another provider's skills in the workspace root it reads first", () => {
    for (const id of WORKSPACE_PROVIDERS) {
      expect(skillTarget(id)).toBe(join("/repo", ".agents", "skills", "av-scout"));
    }
  });

  it("keeps antigravity's own install in the global root, at either scope", () => {
    const global = join("/home/u", ".gemini", "config", "skills", "av-scout");
    expect(skillTarget("antigravity")).toBe(global);
    expect(skillTarget("antigravity", { ...PROJECT, scope: "global" })).toBe(global);
  });

  it("puts codex's copy under home, where it does not outrank anything", () => {
    // Codex is home-anchored at both scopes, so its `.agents/skills` is the
    // global declared layer rather than the workspace one — it shares a
    // directory name with the workspace writers and not their priority.
    expect(skillTarget("codex")).toBe(join("/home/u", ".agents", "skills", "av-scout"));
  });

  it("means the file agy reads first is adapted for a different tool", () => {
    // If these ever match, the precedence stops mattering — and if they match
    // by accident, the reason to care about it here has quietly gone away.
    const preferred = adaptArtifact(SKILL, "cursor");
    expect(preferred).not.toBe(adaptArtifact(SKILL, "antigravity"));
    expect(preferred).toContain("spawn_agent(explorer)");
  });
});
