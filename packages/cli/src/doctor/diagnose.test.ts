import { describe, it, expect } from "vitest";
import { diagnose, deriveStatus, type DiagnoseDeps } from "./diagnose.js";
import type { Receipt } from "../install/install-receipt.js";

const home = "/home/u";
const cwd = "/home/u/proj";

function makeReceipt(overrides: Partial<Receipt> = {}): Receipt {
  return {
    schemaVersion: 1,
    vcskillVersion: "0.4.0",
    installs: {
      "claude-code": {
        timestamp: "t1",
        scope: "project",
        files: [
          { path: ".claude/skills/brainstorm/SKILL.md", sha256: "abc" },
          { path: ".claude/hooks/vc/session-init.cjs", sha256: "def" },
        ],
        agentsMdManaged: false,
        hookBindings: [
          { event: "SessionStart", command: 'node "/home/u/proj/.claude/hooks/vc/session-init.cjs"', applied: true },
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
        hooks: { SessionStart: [{ hooks: [{ type: "command", command: 'node "/home/u/proj/.claude/hooks/vc/session-init.cjs"' }] }] } },
      ),
    hookExecutable: () => true,
    ...overrides,
  };
}

describe("diagnose (pure)", () => {
  it("returns no findings when everything checks out", () => {
    const findings = diagnose(makeReceipt(), makeDeps(), { home, cwd, currentVersion: "0.4.0" });
    expect(findings).toEqual([]);
  });

  it("flags a missing file as an error finding", () => {
    const findings = diagnose(makeReceipt(), makeDeps({ fileExists: () => false }), {
      home,
      cwd,
      currentVersion: "0.4.0",
    });
    expect(findings.some((f) => f.level === "error" && f.message.includes("brainstorm/SKILL.md"))).toBe(true);
  });

  it("flags a hook binding missing from settings.json as an error", () => {
    const findings = diagnose(
      makeReceipt(),
      makeDeps({ readSettingsJson: () => JSON.stringify({ hooks: {} }) }),
      { home, cwd, currentVersion: "0.4.0" },
    );
    expect(findings.some((f) => f.level === "error" && f.message.includes("SessionStart"))).toBe(true);
  });

  it("flags settings.json missing entirely when applied bindings exist", () => {
    const findings = diagnose(makeReceipt(), makeDeps({ readSettingsJson: () => null }), {
      home,
      cwd,
      currentVersion: "0.4.0",
    });
    expect(findings.some((f) => f.level === "error" && f.message.includes("settings.json"))).toBe(true);
  });

  it("does not check bindings that were never applied", () => {
    const receipt = makeReceipt({
      installs: {
        "claude-code": {
          ...makeReceipt().installs["claude-code"]!,
          hookBindings: [{ event: "Stop", command: "node x.cjs", applied: false }],
        },
      },
    });
    const findings = diagnose(receipt, makeDeps({ readSettingsJson: () => JSON.stringify({ hooks: {} }) }), {
      home,
      cwd,
      currentVersion: "0.4.0",
    });
    expect(findings).toEqual([]);
  });

  it("flags a hook file that fails to execute", () => {
    const findings = diagnose(makeReceipt(), makeDeps({ hookExecutable: () => false }), {
      home,
      cwd,
      currentVersion: "0.4.0",
    });
    expect(findings.some((f) => f.level === "error" && f.message.includes("session-init.cjs"))).toBe(true);
  });

  it("does not treat _lib helper files as executable hooks", () => {
    const receipt = makeReceipt({
      installs: {
        "claude-code": {
          ...makeReceipt().installs["claude-code"]!,
          hookBindings: [],
          files: [{ path: ".claude/hooks/vc/_lib/fail-open.cjs", sha256: "x" }],
        },
      },
    });
    const findings = diagnose(receipt, makeDeps({ hookExecutable: () => false }), {
      home,
      cwd,
      currentVersion: "0.4.0",
    });
    expect(findings).toEqual([]);
  });

  it("flags a version mismatch as a non-blocking warning", () => {
    const findings = diagnose(makeReceipt(), makeDeps(), { home, cwd, currentVersion: "0.5.0" });
    expect(findings).toEqual([
      { providerId: "claude-code", level: "warning", message: expect.stringContaining("0.4.0") },
    ]);
  });

  it("returns no findings for a null receipt", () => {
    expect(diagnose(null, makeDeps(), { home, cwd, currentVersion: "0.4.0" })).toEqual([]);
  });
});

describe("deriveStatus", () => {
  it("is not-installed when receipt is null or empty", () => {
    expect(deriveStatus(null, [])).toBe("not-installed");
    expect(deriveStatus({ schemaVersion: 1, vcskillVersion: "x", installs: {} }, [])).toBe("not-installed");
  });

  it("is healthy when installed with no error findings", () => {
    expect(deriveStatus(makeReceipt(), [])).toBe("healthy");
    expect(
      deriveStatus(makeReceipt(), [{ providerId: "claude-code", level: "warning", message: "m" }]),
    ).toBe("healthy");
  });

  it("is degraded when any error finding exists", () => {
    expect(
      deriveStatus(makeReceipt(), [{ providerId: "claude-code", level: "error", message: "m" }]),
    ).toBe("degraded");
  });
});
