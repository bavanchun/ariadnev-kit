// The hooks tree has one root, and every file in it follows that root.
//
// Five different destinations are built while planning hooks — the `.cjs`
// bodies, the shared `_lib`, the runtime marker, the output-style sidecar and
// the statusline — and each was independently composed from the same Claude
// Code constant. Fixing four of five leaves a tree split across two providers'
// directories, which is worse than the honest single-provider state, so these
// tests assert all five together.
//
// The settings file is the separate half: a provider that discovers hooks by
// directory has no binding registry to merge into, and must not have one
// invented for it out of another provider's layout.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadKit } from "../kit/load-kit.js";
import { planInstall } from "./install-plan.js";
import { makeResolver, type ProviderResolver, type ResolverCtx } from "../providers/resolver.js";
import { SPEC_VERIFIED, type ProviderId } from "../providers/spec-verified.js";
import type { InstallOp } from "./install-types.js";
import { planHeal } from "./install-heal.js";
import { planUninstall } from "../uninstall/uninstall-plan.js";
import type { Receipt } from "./install-receipt.js";

let root: string;

const CTX: ResolverCtx = { home: "/home/u", cwd: "/repo", scope: "global" };
const CODEX_HOOKS = "/home/u/.codex/hooks/av";

/**
 * A provider that exists only in this file. Real ids carry evidence, and no
 * provider's evidence changes in this phase — the point under test is that the
 * planner follows whatever hooks surface it is handed.
 */
function syntheticResolver(overrides: Partial<ProviderResolver> = {}): ProviderResolver {
  return {
    id: "test-provider",
    rulesMode: "agents-md",
    supports: {
      skill: false,
      agent: false,
      command: false,
      rules: false,
      scripts: false,
      env: false,
      statusline: true,
      hook: true,
      outputStyle: false,
    },
    targetFor: () => null,
    scriptsTarget: (ctx) => join(ctx.home, ".synthetic/scripts"),
    envTarget: (ctx) => join(ctx.home, ".synthetic/.env.example"),
    agentsMdRoot: (ctx) => ctx.cwd,
    hooksTarget: () => CODEX_HOOKS,
    hooksConfigTarget: () => null,
    hooksConfigFormat: null,
    hooksInstall: true,
    ...overrides,
  };
}

function hook(name: string, manifest: object): void {
  const dir = join(root, "hooks", name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "hook.cjs"), "process.exit(0);\n");
  writeFileSync(join(dir, "hook.json"), JSON.stringify(manifest));
}

function plan(r: ProviderResolver): InstallOp[] {
  return planInstall(loadKit(root), r, CTX);
}

function destinations(ops: InstallOp[]): string[] {
  return ops.flatMap((op) => (op.action === "skip" ? [] : [op.dest]));
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "ariadnev-hookssurface-"));
  mkdirSync(join(root, "skills"), { recursive: true });
  mkdirSync(join(root, "hooks", "_lib"), { recursive: true });
  writeFileSync(join(root, "hooks", "_lib", "shared.cjs"), "module.exports = {};\n");
  mkdirSync(join(root, "output-styles"), { recursive: true });
  writeFileSync(join(root, "output-styles", "deep.md"), "---\nname: deep\n---\nbody\n");
  mkdirSync(join(root, "statusline"), { recursive: true });
  writeFileSync(join(root, "statusline", "av-statusline.cjs"), "process.exit(0);\n");
  hook("guard", { bindings: [{ event: "PreToolUse", order: 10 }], description: "guard" });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("hooks surface", () => {
  it("puts every one of the five destination kinds under the provider's hooks root", () => {
    const ops = plan(syntheticResolver());
    const dests = destinations(ops);
    expect(dests.length).toBeGreaterThan(0);
    for (const dest of dests) {
      expect(dest.startsWith(CODEX_HOOKS + "/")).toBe(true);
    }
    // Named individually so a missing kind fails as a missing kind rather than
    // as a count that happens to differ.
    expect(dests).toContain(join(CODEX_HOOKS, "guard.cjs"));
    expect(dests).toContain(join(CODEX_HOOKS, "_lib", "shared.cjs"));
    expect(dests).toContain(join(CODEX_HOOKS, ".ariadnev-runtime.json"));
    expect(dests).toContain(join(CODEX_HOOKS, "output-styles", "deep.md"));
    expect(dests).toContain(join(CODEX_HOOKS, "av-statusline.cjs"));
  });

  it("emits no settings merge for a provider with no settings file", () => {
    const ops = plan(syntheticResolver());
    expect(ops.some((op) => op.action === "hook-settings")).toBe(false);
    expect(ops.some((op) => op.action === "statusline-settings")).toBe(false);
  });

  it("merges into the provider's own settings file when it has one", () => {
    const settings = "/home/u/.codex/settings.json";
    const ops = plan(
      syntheticResolver({
        hooksConfigTarget: () => settings,
        hooksConfigFormat: "claude-settings-json",
      }),
    );
    const hookSettings = ops.find((op) => op.action === "hook-settings");
    expect(hookSettings?.action === "hook-settings" && hookSettings.dest).toBe(settings);
    expect(hookSettings?.action === "hook-settings" && hookSettings.format).toBe("claude-settings-json");
    const statusline = ops.find((op) => op.action === "statusline-settings");
    expect(statusline?.action === "statusline-settings" && statusline.dest).toBe(settings);
    // The predicate that recognises this installer's own bar tests the command
    // against `ownedDir`; pointed at another provider's tree it would match, and
    // unmerge, a bar this install never wrote.
    expect(statusline?.action === "statusline-settings" && statusline.ownedDir).toBe(CODEX_HOOKS);
  });

  it("skips the whole tree when the provider does not install hooks", () => {
    const ops = plan(syntheticResolver({ hooksInstall: false }));
    expect(ops.every((op) => op.action === "skip")).toBe(true);
  });
});

describe("hooks install switch", () => {
  // Two switches for one concept invite one being flipped without the other.
  // The narrow direction is legal — evidence may exist before the installer is
  // ready to write — but the wide one writes into a path nobody watched load.
  it("never writes hooks for a provider whose hook cell is unverified", () => {
    for (const id of Object.keys(SPEC_VERIFIED) as ProviderId[]) {
      const r = makeResolver(id);
      if (!r.hooksInstall) continue;
      expect(SPEC_VERIFIED[id].paths.hook.verified).toBe(true);
    }
  });

  it("gives claude-code the tree it already has", () => {
    const r = makeResolver("claude-code");
    expect(r.hooksTarget(CTX)).toBe("/home/u/.claude/hooks/av");
    expect(r.hooksConfigTarget(CTX)).toBe("/home/u/.claude/settings.json");
    expect(r.hooksInstall).toBe(true);
  });
});

describe("hooks tree relocation", () => {
  // A provider whose hooks root moves between versions leaves the old tree on
  // disk unless the heal diff covers it. The diff is over receipt paths, so the
  // guarantee is only as good as the receipt recording the real destination.
  function receipt(hooksDir: string): Receipt {
    return {
      schemaVersion: 1,
      ariadnevVersion: "0.4.0",
      installs: {
        codex: {
          timestamp: "t",
          scope: "global",
          files: [
            { path: `${hooksDir}/guard.cjs`, sha256: "a" },
            { path: `${hooksDir}/_lib/shared.cjs`, sha256: "b" },
            { path: `${hooksDir}/.ariadnev-runtime.json`, sha256: "c" },
          ],
          agentsMdManaged: false,
          hookBindings: [],
          skipped: [],
        },
      },
    };
  }

  it("removes every file under the old root when the root changes", () => {
    const removals = planHeal(receipt("~/.claude/hooks/av"), receipt("~/.codex/hooks/av"), CTX.home, CTX.cwd);
    expect(removals.map((r) => r.path).sort()).toEqual([
      "~/.claude/hooks/av/.ariadnev-runtime.json",
      "~/.claude/hooks/av/_lib/shared.cjs",
      "~/.claude/hooks/av/guard.cjs",
    ]);
  });

  it("removes nothing when the root is unchanged", () => {
    expect(planHeal(receipt("~/.codex/hooks/av"), receipt("~/.codex/hooks/av"), CTX.home, CTX.cwd)).toEqual([]);
  });
});

describe("a second provider that installs hooks of its own", () => {
  // The assertion is not that codex is skipped — it installs hooks now. It is
  // that nothing it plans, installs or uninstalls names another provider's
  // config file, which is the file the old hard-wire reached for.
  it("plans nothing into another provider's tree", () => {
    const ops = plan(makeResolver("codex"));
    for (const dest of destinations(ops)) {
      expect(dest).not.toContain(".claude");
    }
  });

  it("unmerges from its own registry, with its own merger and its own tree", () => {
    const ops = planUninstall(withCodexBindings(), "codex", CTX.home, CTX.cwd, {
      fileExists: () => false,
      readFileContent: () => "",
    });
    const unmerge = ops.find((op) => op.action === "unmerge-settings");
    expect(unmerge?.action === "unmerge-settings" && unmerge.path).toBe("/home/u/.codex/hooks.json");
    expect(unmerge?.action === "unmerge-settings" && unmerge.format).toBe("codex-hooks-json");
    expect(unmerge?.action === "unmerge-settings" && unmerge.ownedDir).toBe(CODEX_HOOKS);
  });
});

describe("a provider with no hook registry at all", () => {
  // Bindings can sit on a receipt written when the provider had a surface, or
  // by a build that recorded them without applying them. Either way there is no
  // file to take them out of, and reaching for one means reaching for somebody
  // else's.
  it("unmerges from no file, even with applied bindings on record", () => {
    const receipt = withCodexBindings();
    const asCursor: Receipt = { ...receipt, installs: { cursor: receipt.installs.codex! } };
    const ops = planUninstall(asCursor, "cursor", CTX.home, CTX.cwd, {
      fileExists: () => false,
      readFileContent: () => "",
    });
    expect(ops.some((op) => op.action === "unmerge-settings")).toBe(false);
  });
});

function withCodexBindings(): Receipt {
  return {
    schemaVersion: 1,
    ariadnevVersion: "0.4.0",
    installs: {
      codex: {
        timestamp: "t",
        scope: "global",
        files: [],
        agentsMdManaged: false,
        hookBindings: [{ event: "SessionStart", command: 'node "/home/u/.codex/hooks/av/session-init.cjs"', applied: true }],
        skipped: [],
      },
    },
  };
}

describe("a registry that does not dispatch every event", () => {
  // antigravity has five events; the kit binds nine Claude Code event names.
  // The ones with no equivalent cannot be filed under an event that does exist
  // — `PreInvocation` is the tempting target and fires per model turn, so a
  // session-scoped hook put there would run on every turn of every session.
  // They are dropped instead, and each drop names the event it was for.
  function antigravity(overrides: Partial<ProviderResolver> = {}): ProviderResolver {
    return syntheticResolver({
      hooksConfigTarget: () => "/home/u/.gemini/config/hooks.json",
      hooksConfigFormat: "antigravity-hooks-json",
      ...overrides,
    });
  }

  beforeEach(() => {
    hook("session", { bindings: [{ event: "SessionStart", order: 10 }], description: "session" });
    hook("prompt", { bindings: [{ event: "UserPromptSubmit", order: 10 }], description: "prompt" });
  });

  it("binds only the events the provider dispatches", () => {
    const merge = plan(antigravity()).find((op) => op.action === "hook-settings");
    expect(merge?.action).toBe("hook-settings");
    const events =
      merge?.action === "hook-settings" ? [...new Set(merge.bindings.map((b) => b.event))] : [];
    expect(events).toEqual(["PreToolUse"]);
  });

  it("names the event of every binding it drops", () => {
    const skips = plan(antigravity()).filter((op) => op.action === "skip" && op.kind === "hook");
    expect(skips.length).toBe(2);
    const reasons = skips.map((op) => (op.action === "skip" ? op.reason : ""));
    expect(reasons.some((r) => r.includes("SessionStart"))).toBe(true);
    expect(reasons.some((r) => r.includes("UserPromptSubmit"))).toBe(true);
    // A skip that only says "unsupported" leaves the reader to guess whether
    // the hook, the provider or the event was the problem.
    for (const reason of reasons) expect(reason).toContain("test-provider");
  });

  it("still writes the bodies of the hooks it could not bind", () => {
    // Nothing is deleted over an event: the file stays owned, receipted and
    // reversible, and a later agy release that adds the event needs no cleanup.
    expect(destinations(plan(antigravity()))).toContain(join(CODEX_HOOKS, "session.cjs"));
  });

  it("drops nothing for a registry that takes every event name", () => {
    const merge = plan(
      antigravity({ hooksConfigFormat: "claude-settings-json" }),
    ).find((op) => op.action === "hook-settings");
    const events =
      merge?.action === "hook-settings" ? [...new Set(merge.bindings.map((b) => b.event))].sort() : [];
    expect(events).toEqual(["PreToolUse", "SessionStart", "UserPromptSubmit"]);
  });
});
