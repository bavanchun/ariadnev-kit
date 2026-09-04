import { describe, it, expect } from "vitest";
import { planHookRepair } from "./hook-repair.js";
import type { Receipt } from "../install/install-receipt.js";

function receiptWith(applied: boolean, scope: "project" | "global" = "project"): Receipt {
  return {
    schemaVersion: 1,
    ariadnevVersion: "1.0.0",
    installs: {
      "claude-code": {
        timestamp: "t",
        scope,
        files: [],
        agentsMdManaged: false,
        hookBindings: [{ event: "SessionStart", command: "node /x/session-init.cjs", applied }],
        skipped: [],
      },
    },
  };
}

describe("planHookRepair", () => {
  it("plans a repair when an applied binding is missing from settings.json", () => {
    const repairs = planHookRepair(receiptWith(true), { readHooksConfig: () => "{}" }, { home: "/h", cwd: "/c" });
    expect(repairs).toHaveLength(1);
    expect(repairs[0].added).toHaveLength(1);
    expect(repairs[0].configPath).toBe("/c/.claude/settings.json");
    expect(repairs[0].nextContent).toContain("session-init.cjs");
  });

  it("plans nothing when the binding is already present", () => {
    const present = JSON.stringify({ hooks: { SessionStart: [{ hooks: [{ type: "command", command: "node /x/session-init.cjs" }] }] } });
    const repairs = planHookRepair(receiptWith(true), { readHooksConfig: () => present }, { home: "/h", cwd: "/c" });
    expect(repairs).toEqual([]);
  });

  it("ignores bindings that were never applied", () => {
    const repairs = planHookRepair(receiptWith(false), { readHooksConfig: () => "{}" }, { home: "/h", cwd: "/c" });
    expect(repairs).toEqual([]);
  });

  it("treats a missing settings.json as empty and re-adds everything", () => {
    const repairs = planHookRepair(receiptWith(true), { readHooksConfig: () => null }, { home: "/h", cwd: "/c" });
    expect(repairs).toHaveLength(1);
    expect(repairs[0].nextContent).toContain("session-init.cjs");
  });

  it("uses the home root for global-scope installs", () => {
    const repairs = planHookRepair(receiptWith(true, "global"), { readHooksConfig: () => "{}" }, { home: "/h", cwd: "/c" });
    expect(repairs[0].configPath).toBe("/h/.claude/settings.json");
  });
});

// `--fix` writes. Sending one provider's bindings to another provider's config
// does not merely mislabel a row — it edits a config file this install never
// wrote, with commands that tool cannot run.
describe("planHookRepair across providers", () => {
  function codexReceipt(): Receipt {
    return {
      schemaVersion: 1,
      ariadnevVersion: "1.0.0",
      installs: {
        codex: {
          timestamp: "t",
          scope: "global",
          files: [],
          agentsMdManaged: false,
          hookBindings: [{ event: "SessionStart", command: 'node "/h/.codex/hooks/av/session-init.cjs"', applied: true }],
          skipped: [],
        },
      },
    };
  }

  it("repairs codex in codex's own hooks.json", () => {
    const repairs = planHookRepair(codexReceipt(), { readHooksConfig: () => "{}" }, { home: "/h", cwd: "/c" });
    expect(repairs).toHaveLength(1);
    expect(repairs[0].configPath).toBe("/h/.codex/hooks.json");
  });

  it("writes it in codex's own format, appended after whatever else is there", () => {
    const foreign = JSON.stringify({
      hooks: { SessionStart: [{ hooks: [{ type: "command", command: "bash /h/.codex/other-tool.sh", timeout: 10 }] }] },
    });
    const repairs = planHookRepair(codexReceipt(), { readHooksConfig: () => foreign }, { home: "/h", cwd: "/c" });
    const groups = (JSON.parse(repairs[0].nextContent) as {
      hooks: Record<string, { hooks: { command: string }[] }[]>;
    }).hooks.SessionStart;
    expect(groups).toHaveLength(2);
    expect(groups[0].hooks[0].command).toBe("bash /h/.codex/other-tool.sh");
    expect(groups[1].hooks[0].command).toContain(".codex/hooks/av/session-init.cjs");
  });

  it("plans nothing for a provider that discovers hooks by directory alone", () => {
    const receipt = codexReceipt();
    const byDir = {
      ...receipt,
      installs: { cursor: { ...receipt.installs.codex!, scope: "project" as const } },
    };
    expect(planHookRepair(byDir, { readHooksConfig: () => "{}" }, { home: "/h", cwd: "/c" })).toEqual([]);
  });
});
