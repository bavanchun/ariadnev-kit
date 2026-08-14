import { describe, it, expect } from "vitest";
import { diagnose, deriveStatus, type DiagnoseDeps } from "./diagnose.js";
import type { Receipt } from "../install/install-receipt.js";

const home = "/home/u";
const cwd = "/home/u/proj";

function makeReceipt(overrides: Partial<Receipt> = {}): Receipt {
  return {
    schemaVersion: 1,
    ariadnevVersion: "0.4.0",
    installs: {
      "claude-code": {
        timestamp: "t1",
        scope: "project",
        files: [
          { path: ".claude/skills/brainstorm/SKILL.md", sha256: "abc" },
          { path: ".claude/hooks/av/session-init.cjs", sha256: "def" },
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

function makeDeps(overrides: Partial<DiagnoseDeps> = {}): DiagnoseDeps {
  return {
    fileExists: () => true,
    readSettingsJson: () =>
      JSON.stringify({
        hooks: { SessionStart: [{ hooks: [{ type: "command", command: 'node "/home/u/proj/.claude/hooks/av/session-init.cjs"' }] }] } },
      ),
    hookExecutable: () => true,
    ...overrides,
  };
}

const opt = { home, cwd, currentVersion: "0.4.0" };

describe("diagnose (pure, tri-state)", () => {
  it("emits a single pass row when everything checks out — no fail/warning", () => {
    const findings = diagnose(makeReceipt(), makeDeps(), opt);
    expect(findings).toHaveLength(1);
    expect(findings[0].level).toBe("pass");
    expect(findings.some((f) => f.level === "fail")).toBe(false);
  });

  it("flags a missing file as fail + a `ariadnev install` remedy", () => {
    const findings = diagnose(makeReceipt(), makeDeps({ fileExists: () => false }), opt);
    const f = findings.find((x) => x.message.includes("brainstorm/SKILL.md"));
    expect(f?.level).toBe("fail");
    expect(f?.remedy).toBe("ariadnev install");
    expect(f?.weight).toBeGreaterThan(0);
  });

  it("flags a drifted hook binding as fail + a `ariadnev doctor --fix` remedy", () => {
    const findings = diagnose(makeReceipt(), makeDeps({ readSettingsJson: () => JSON.stringify({ hooks: {} }) }), opt);
    const f = findings.find((x) => x.message.includes("SessionStart"));
    expect(f?.level).toBe("fail");
    expect(f?.remedy).toBe("ariadnev doctor --fix");
  });

  it("flags settings.json missing entirely as fail", () => {
    const findings = diagnose(makeReceipt(), makeDeps({ readSettingsJson: () => null }), opt);
    expect(findings.some((f) => f.level === "fail" && f.message.includes("settings.json"))).toBe(true);
  });

  it("flags a hook file that fails to execute as fail", () => {
    const findings = diagnose(makeReceipt(), makeDeps({ hookExecutable: () => false }), opt);
    expect(findings.some((f) => f.level === "fail" && f.message.includes("session-init.cjs"))).toBe(true);
  });

  it("passes (not fails) when bindings were never applied and files are present", () => {
    const receipt = makeReceipt({
      installs: {
        "claude-code": {
          ...makeReceipt().installs["claude-code"]!,
          hookBindings: [{ event: "Stop", command: "node x.cjs", applied: false }],
        },
      },
    });
    const findings = diagnose(receipt, makeDeps({ readSettingsJson: () => JSON.stringify({ hooks: {} }) }), opt);
    expect(findings.every((f) => f.level !== "fail")).toBe(true);
    expect(findings.some((f) => f.level === "pass")).toBe(true);
  });

  it("emits a skip row when nothing was recorded to verify", () => {
    const receipt = makeReceipt({
      installs: {
        codex: { timestamp: "t", scope: "project", files: [], agentsMdManaged: false, hookBindings: [], skipped: [] },
      },
    });
    const findings = diagnose(receipt, makeDeps(), opt);
    expect(findings).toHaveLength(1);
    expect(findings[0].level).toBe("skip");
  });

  it("flags a version mismatch as a non-blocking warning + `ariadnev update` remedy", () => {
    const findings = diagnose(makeReceipt(), makeDeps(), { home, cwd, currentVersion: "0.5.0" });
    const w = findings.find((f) => f.level === "warning");
    expect(w?.remedy).toBe("ariadnev update");
    expect(w?.message).toContain("0.4.0");
    expect(findings.some((f) => f.level === "fail")).toBe(false);
  });

  it("returns no findings for a null receipt", () => {
    expect(diagnose(null, makeDeps(), opt)).toEqual([]);
  });
});

describe("deriveStatus — exit contract (keys on fail only)", () => {
  it("is not-installed when receipt is null or empty", () => {
    expect(deriveStatus(null, [])).toBe("not-installed");
    expect(deriveStatus({ schemaVersion: 1, ariadnevVersion: "x", installs: {} }, [])).toBe("not-installed");
  });

  it("is healthy for pass/skip/warning findings (no fail)", () => {
    expect(deriveStatus(makeReceipt(), [{ providerId: "claude-code", level: "pass", message: "ok" }])).toBe("healthy");
    expect(deriveStatus(makeReceipt(), [{ providerId: "x", level: "warning", message: "m" }])).toBe("healthy");
    expect(deriveStatus(makeReceipt(), [{ providerId: "x", level: "skip", message: "m" }])).toBe("healthy");
  });

  it("is degraded when any fail finding exists (→ exit 1, never masked)", () => {
    expect(deriveStatus(makeReceipt(), [{ providerId: "x", level: "fail", message: "m", weight: 10 }])).toBe("degraded");
  });
});
