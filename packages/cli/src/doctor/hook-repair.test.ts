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
    const repairs = planHookRepair(receiptWith(true), { readSettingsJson: () => "{}" }, { home: "/h", cwd: "/c" });
    expect(repairs).toHaveLength(1);
    expect(repairs[0].added).toHaveLength(1);
    expect(repairs[0].settingsPath).toBe("/c/.claude/settings.json");
    expect(repairs[0].nextContent).toContain("session-init.cjs");
  });

  it("plans nothing when the binding is already present", () => {
    const present = JSON.stringify({ hooks: { SessionStart: [{ hooks: [{ type: "command", command: "node /x/session-init.cjs" }] }] } });
    const repairs = planHookRepair(receiptWith(true), { readSettingsJson: () => present }, { home: "/h", cwd: "/c" });
    expect(repairs).toEqual([]);
  });

  it("ignores bindings that were never applied", () => {
    const repairs = planHookRepair(receiptWith(false), { readSettingsJson: () => "{}" }, { home: "/h", cwd: "/c" });
    expect(repairs).toEqual([]);
  });

  it("treats a missing settings.json as empty and re-adds everything", () => {
    const repairs = planHookRepair(receiptWith(true), { readSettingsJson: () => null }, { home: "/h", cwd: "/c" });
    expect(repairs).toHaveLength(1);
    expect(repairs[0].nextContent).toContain("session-init.cjs");
  });

  it("uses the home root for global-scope installs", () => {
    const repairs = planHookRepair(receiptWith(true, "global"), { readSettingsJson: () => "{}" }, { home: "/h", cwd: "/c" });
    expect(repairs[0].settingsPath).toBe("/h/.claude/settings.json");
  });
});
