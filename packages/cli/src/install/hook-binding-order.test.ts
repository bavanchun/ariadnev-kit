// A hook's event bindings are an ordered contract, not a set.
//
// The source manifest this kit ports from binds several hooks to the same event
// in a specific sequence — a guardrail that must run before the gate that acts
// on its result — and binds one hook to two events with a *different* matcher on
// each. Discovery order (readdir, alphabetical) preserves neither. These tests
// pin both, because an install that silently reorders or drops a binding still
// reports success.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadKit } from "../kit/load-kit.js";
import { planInstall } from "./install-plan.js";
import { makeResolver } from "../providers/resolver.js";
import type { HookBinding } from "./hook-settings-merge.js";
import type { InstallOp } from "./install-types.js";

let root: string;

function hook(name: string, manifest: object): void {
  const dir = join(root, "hooks", name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "hook.cjs"), "process.exit(0);\n");
  writeFileSync(join(dir, "hook.json"), JSON.stringify(manifest));
}

function bindingsFor(): HookBinding[] {
  const kit = loadKit(root);
  const ops: InstallOp[] = planInstall(kit, makeResolver("claude-code"), {
    home: "/home/u",
    cwd: "/repo",
    scope: "project",
  });
  const settings = ops.find((op) => op.action === "hook-settings");
  if (!settings || settings.action !== "hook-settings") throw new Error("no hook-settings op");
  return settings.bindings;
}

function commandsFor(event: string): string[] {
  return bindingsFor()
    .filter((b) => b.event === event)
    .map((b) => b.command.replace(/^.*hooks\/av\//, "").replace(/"$/, ""));
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "ariadnev-hookorder-"));
  mkdirSync(join(root, "skills"), { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("hook binding order", () => {
  it("binds in declared order, not the order the directory happens to list", () => {
    // Alphabetically: a-gate, m-guard, z-refresh. The declared order is the
    // reverse, which is the point — a guardrail runs before the gate.
    hook("a-gate", { bindings: [{ event: "UserPromptSubmit", order: 20 }], description: "gate" });
    hook("m-guard", { bindings: [{ event: "UserPromptSubmit", order: 10 }], description: "guard" });
    hook("z-refresh", { bindings: [{ event: "UserPromptSubmit", order: 30 }], description: "refresh" });
    expect(commandsFor("UserPromptSubmit")).toEqual(["m-guard.cjs", "a-gate.cjs", "z-refresh.cjs"]);
  });

  it("gives one hook a different matcher per event", () => {
    hook("dev-rules", {
      bindings: [
        { event: "PostToolUse", matcher: "Write|Edit", order: 10 },
        { event: "UserPromptSubmit", order: 10 },
      ],
      description: "remind about dev rules",
    });
    const all = bindingsFor();
    expect(all.find((b) => b.event === "PostToolUse")?.matcher).toBe("Write|Edit");
    expect(all.find((b) => b.event === "UserPromptSubmit")?.matcher).toBeUndefined();
  });

  it("still supports the simple manifests already in the kit", () => {
    hook("session-init", { event: "SessionStart", description: "detect the project" });
    hook("session-state", { events: ["Stop", "SubagentStop"], description: "persist state" });
    hook("privacy-block", { event: "PreToolUse", matcher: "Read|Bash", description: "block secrets" });
    const all = bindingsFor();
    expect(all.filter((b) => b.event === "Stop")).toHaveLength(1);
    expect(all.filter((b) => b.event === "SubagentStop")).toHaveLength(1);
    expect(all.find((b) => b.event === "PreToolUse")?.matcher).toBe("Read|Bash");
  });

  it("orders an unordered binding after every ordered one, deterministically", () => {
    // Mixing the two forms is a manifest smell, but it must not produce a
    // different plan on a different filesystem.
    hook("b-plain", { event: "Stop", description: "no order declared" });
    hook("a-plain", { event: "Stop", description: "no order declared either" });
    hook("c-first", { bindings: [{ event: "Stop", order: 5 }], description: "declared" });
    expect(commandsFor("Stop")).toEqual(["c-first.cjs", "a-plain.cjs", "b-plain.cjs"]);
  });

  it("rejects an unknown event inside bindings[] the same as a bare event", () => {
    hook("typo", { bindings: [{ event: "SessionStarted" }], description: "typo in the event name" });
    expect(() => loadKit(root)).toThrow(/SessionStarted/);
  });

  it("rejects a bindings[] entry with no event", () => {
    hook("empty", { bindings: [{ matcher: "Write" }], description: "matcher but no event" });
    expect(() => loadKit(root)).toThrow(/event/);
  });

  it("appends declared args after the hook path so a binding can be parameterized", () => {
    hook("notify", { bindings: [{ event: "Stop", args: ["--channel", "build"] }], description: "notify" });
    const command = bindingsFor().find((b) => b.event === "Stop")?.command ?? "";
    expect(command).toMatch(/notify\.cjs" --channel build$/);
  });
});
