import { describe, it, expect } from "vitest";
import { planUninstall, UninstallPlanError, type PlanUninstallDeps } from "./uninstall-plan.js";
import type { Receipt } from "../install/install-receipt.js";
import { createHash } from "node:crypto";

const home = "/home/u";
const cwd = "/home/u/proj";

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

function makeReceipt(overrides: Partial<Receipt> = {}): Receipt {
  return {
    schemaVersion: 1,
    ariadnevVersion: "0.4.0",
    installs: {
      "claude-code": {
        timestamp: "t1",
        scope: "project",
        files: [
          { path: ".claude/skills/brainstorm/SKILL.md", sha256: sha256("original") },
        ],
        agentsMdManaged: false,
        hookBindings: [
          { event: "SessionStart", command: 'node "/home/u/proj/.claude/hooks/av/session-init.cjs"', applied: true },
        ],
        skipped: [],
      },
    },
    ...overrides,
  };
}

function makeDeps(fileContents: Record<string, string>): PlanUninstallDeps {
  return {
    fileExists: (p) => p in fileContents,
    readFileContent: (p) => fileContents[p],
  };
}

describe("planUninstall (pure-ish, injected fs)", () => {
  it("plans to remove a file whose content still matches the receipt hash", () => {
    const ops = planUninstall(makeReceipt(), "claude-code", home, cwd, makeDeps({
      "/home/u/proj/.claude/skills/brainstorm/SKILL.md": "original",
    }));
    expect(ops).toContainEqual({
      action: "remove-file",
      path: "/home/u/proj/.claude/skills/brainstorm/SKILL.md",
    });
  });

  it("preserves (does not plan to remove) a file the user has modified since install", () => {
    const ops = planUninstall(makeReceipt(), "claude-code", home, cwd, makeDeps({
      "/home/u/proj/.claude/skills/brainstorm/SKILL.md": "user edited this",
    }));
    expect(ops.find((o) => o.action === "remove-file")).toBeUndefined();
    expect(ops).toContainEqual({
      action: "preserve-file",
      path: "/home/u/proj/.claude/skills/brainstorm/SKILL.md",
      reason: expect.stringContaining("modified"),
    });
  });

  it("skips a file that's already gone — nothing to plan", () => {
    const ops = planUninstall(makeReceipt(), "claude-code", home, cwd, makeDeps({}));
    expect(ops.find((o) => o.action === "remove-file" || o.action === "preserve-file")).toBeUndefined();
  });

  it("plans an unmerge-settings op only for applied hook bindings", () => {
    const ops = planUninstall(makeReceipt(), "claude-code", home, cwd, makeDeps({
      "/home/u/proj/.claude/skills/brainstorm/SKILL.md": "original",
    }));
    const unmerge = ops.find((o) => o.action === "unmerge-settings");
    expect(unmerge).toMatchObject({
      action: "unmerge-settings",
      path: "/home/u/proj/.claude/settings.json",
      bindings: [{ event: "SessionStart", command: expect.stringContaining("session-init.cjs") }],
    });
  });

  it("omits unmerge-settings when no binding was applied", () => {
    const receipt = makeReceipt({
      installs: {
        "claude-code": {
          ...makeReceipt().installs["claude-code"]!,
          hookBindings: [{ event: "SessionStart", command: "x", applied: false }],
        },
      },
    });
    const ops = planUninstall(receipt, "claude-code", home, cwd, makeDeps({
      "/home/u/proj/.claude/skills/brainstorm/SKILL.md": "original",
    }));
    expect(ops.find((o) => o.action === "unmerge-settings")).toBeUndefined();
  });

  it("plans a remove-agents-block op when agentsMdManaged is true", () => {
    const receipt = makeReceipt({
      installs: {
        "claude-code": { ...makeReceipt().installs["claude-code"]!, agentsMdManaged: true, hookBindings: [] },
      },
    });
    const ops = planUninstall(receipt, "claude-code", home, cwd, makeDeps({
      "/home/u/proj/.claude/skills/brainstorm/SKILL.md": "original",
    }));
    expect(ops).toContainEqual({ action: "remove-agents-block", path: "/home/u/proj/AGENTS.md" });
  });

  it("resolves the settings/AGENTS.md path against home for a global-scope install", () => {
    const receipt = makeReceipt({
      installs: {
        "claude-code": { ...makeReceipt().installs["claude-code"]!, scope: "global", agentsMdManaged: true, files: [] },
      },
    });
    const ops = planUninstall(receipt, "claude-code", home, cwd, makeDeps({}));
    expect(ops).toContainEqual({ action: "remove-agents-block", path: "/home/u/AGENTS.md" });
  });

  it("returns an empty plan when the provider has no receipt record", () => {
    expect(planUninstall(makeReceipt(), "codex", home, cwd, makeDeps({}))).toEqual([]);
  });

  it("refuses an unsupported receipt schema version", () => {
    const receipt = makeReceipt({ schemaVersion: 999 });
    expect(() => planUninstall(receipt, "claude-code", home, cwd, makeDeps({}))).toThrow(UninstallPlanError);
  });
});

describe("binary files", () => {
  it("removes an unmodified binary instead of mistaking it for user work", () => {
    // The bug this pins: hashing was done over a utf8 read, so a font's digest
    // never matched the receipt, every binary looked edited, and uninstall
    // preserved it. A full uninstall left 55 files behind.
    const bytes = Buffer.from([0x00, 0x01, 0xff, 0xfe, 0x80, 0x7f]);
    const digest = createHash("sha256").update(bytes).digest("hex");
    const receipt: Receipt = {
      schemaVersion: 2,
      ariadnevVersion: "1.0.0",
      installs: {
        "claude-code": {
          timestamp: "20260815-000000",
          scope: "project",
          files: [{ path: "~/.claude/skills/ui/canvas-fonts/A.ttf", sha256: digest }],
          agentsMdManaged: false,
          hookBindings: [],
          skipped: [],
        },
      },
    };
    const ops = planUninstall(receipt, "claude-code", "/home/u", "/repo", {
      fileExists: () => true,
      readFileContent: () => bytes,
    });
    const removals = ops.filter((op) => op.action === "remove-file");
    expect(removals).toHaveLength(1);
    expect(ops.some((op) => op.action === "preserve-file")).toBe(false);
  });

  it("still preserves a binary the user actually replaced", () => {
    const receipt: Receipt = {
      schemaVersion: 2,
      ariadnevVersion: "1.0.0",
      installs: {
        "claude-code": {
          timestamp: "20260815-000000",
          scope: "project",
          files: [{ path: "~/.claude/skills/ui/canvas-fonts/A.ttf", sha256: "0".repeat(64) }],
          agentsMdManaged: false,
          hookBindings: [],
          skipped: [],
        },
      },
    };
    const ops = planUninstall(receipt, "claude-code", "/home/u", "/repo", {
      fileExists: () => true,
      readFileContent: () => Buffer.from([0x01, 0x02]),
    });
    expect(ops.some((op) => op.action === "preserve-file")).toBe(true);
  });
});
