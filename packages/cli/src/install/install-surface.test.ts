import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { loadKit, resolveKitRoot } from "../kit/load-kit.js";
import { planInstall } from "./install-plan.js";
import { PROVIDER_IDS, getResolver, type ResolverCtx } from "../providers/index.js";
import { INSTALL_SURFACE, isInstallSurfacePath } from "./install-surface.js";

const HOME = "/fixture-home";
const CWD = "/fixture-home/project";

/** Every destination a real install would write, across providers and scopes. */
function plannedDestinations(): string[] {
  const kit = loadKit(resolveKitRoot(process.cwd()));
  const out: string[] = [];
  for (const scope of ["project", "global"] as const) {
    for (const id of PROVIDER_IDS) {
      const ctx = { home: HOME, cwd: CWD, scope } as ResolverCtx;
      let ops;
      try {
        ops = planInstall(kit, getResolver(id), ctx);
      } catch {
        continue; // a provider that cannot plan here writes nothing here
      }
      for (const op of ops) {
        const dest = (op as { dest?: string }).dest;
        if (typeof dest === "string") out.push(dest);
      }
    }
  }
  return out;
}

describe("the install surface covers what install actually plans", () => {
  /**
   * The allowlist restore trusts is a hand-written constant. If a new provider
   * writes somewhere it does not name, restore starts refusing a legitimate
   * backup — silently, and only for the person who has that provider installed.
   * This is what turns that into a build failure instead.
   */
  it("accepts every planned destination", () => {
    const planned = plannedDestinations();
    expect(planned.length).toBeGreaterThan(0);
    const outside = [...new Set(planned.filter((dest) => !isInstallSurfacePath(dest, [HOME, CWD])))];
    expect(
      outside,
      "a provider plans a destination outside INSTALL_SURFACE — add the prefix, do not widen the check",
    ).toEqual([]);
  });

  // The other direction. An entry nothing plans is either a provider that was
  // removed or a guess, and a guess in an allowlist is how it stops meaning
  // anything. Two are known-wider and named in the module's own docstring.
  it("has no entry that nothing plans, beyond the two declared exceptions", () => {
    const planned = plannedDestinations();
    const DECLARED_WIDER = new Set([".cursor", ".config/opencode", ".ariadnev", "CLAUDE.md"]);
    const unused = INSTALL_SURFACE.filter(
      (prefix) =>
        !DECLARED_WIDER.has(prefix) &&
        !planned.some((dest) => dest.startsWith(join(HOME, prefix)) || dest.startsWith(join(CWD, prefix))),
    );
    expect(unused, "INSTALL_SURFACE names a prefix no provider plans").toEqual([]);
  });
});

describe("isInstallSurfacePath", () => {
  const roots = [HOME, CWD];

  for (const good of [
    join(CWD, ".claude", "skills", "av-cook", "SKILL.md"),
    join(CWD, "AGENTS.md"),
    join(HOME, ".agents", "skills", "av-plan", "SKILL.md"),
    join(HOME, ".claude", "settings.json"),
    join(HOME, ".config", "opencode", "config.json"),
  ]) {
    it(`accepts ${good.replace(HOME, "~")}`, () => {
      expect(isInstallSurfacePath(good, roots)).toBe(true);
    });
  }

  // Each of these is inside `[home, cwd]`, which is why the root check alone
  // was not enough. Each was reachable from a manifest a cloned repository
  // ships, and the first two are arbitrary code execution.
  for (const bad of [
    join(CWD, ".git", "hooks", "pre-commit"),
    join(HOME, ".zshrc"),
    join(HOME, ".ssh", "authorized_keys"),
    join(HOME, ".bashrc"),
    join(CWD, "package.json"),
    join(CWD, "src", "index.ts"),
    join(HOME, ".config", "systemd", "user", "evil.service"),
  ]) {
    it(`refuses ${bad.replace(HOME, "~").replace(CWD, ".")}`, () => {
      expect(isInstallSurfacePath(bad, roots)).toBe(false);
    });
  }

  // A prefix must match on a path boundary, or `.claude` would also admit a
  // sibling called `.claude-evil`.
  it("does not accept a directory that merely starts with an allowed prefix", () => {
    expect(isInstallSurfacePath(join(CWD, ".claude-evil", "x"), roots)).toBe(false);
    expect(isInstallSurfacePath(join(CWD, ".agentsX"), roots)).toBe(false);
  });

  it("refuses anything outside the roots entirely", () => {
    expect(isInstallSurfacePath("/etc/passwd", roots)).toBe(false);
    expect(isInstallSurfacePath(join(HOME, "..", "other", ".claude", "x"), roots)).toBe(false);
  });
});
