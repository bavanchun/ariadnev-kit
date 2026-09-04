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
    dirExists: () => false,
    listDir: () => null,
    readHooksConfig: () =>
      JSON.stringify({
        hooks: { SessionStart: [{ hooks: [{ type: "command", command: 'node "/home/u/proj/.claude/hooks/av/session-init.cjs"' }] }] } },
      ),
    hookExecutable: () => true,
    readHookRuntimeMarker: () => '{"schemaVersion":1,"runtime":"claude-code"}\n',
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
    const findings = diagnose(makeReceipt(), makeDeps({ readHooksConfig: () => JSON.stringify({ hooks: {} }) }), opt);
    const f = findings.find((x) => x.message.includes("SessionStart"));
    expect(f?.level).toBe("fail");
    expect(f?.remedy).toBe("ariadnev doctor --fix");
  });

  it("flags settings.json missing entirely as fail", () => {
    const findings = diagnose(makeReceipt(), makeDeps({ readHooksConfig: () => null }), opt);
    expect(findings.some((f) => f.level === "fail" && f.message.includes("settings.json"))).toBe(true);
  });

  it("flags a hook file that fails to execute as fail", () => {
    const findings = diagnose(makeReceipt(), makeDeps({ hookExecutable: () => false }), opt);
    expect(findings.some((f) => f.level === "fail" && f.message.includes("session-init.cjs"))).toBe(true);
  });

  it("flags a hook install whose runtime marker is missing", () => {
    // Every hook loads and exits 0 without the marker; only the session-state
    // family goes quiet. This is the one check that says so.
    const findings = diagnose(makeReceipt(), makeDeps({ readHookRuntimeMarker: () => null }), opt);
    const f = findings.find((x) => x.message.includes(".ariadnev-runtime.json"));
    expect(f?.level).toBe("fail");
    expect(f?.remedy).toBe("ariadnev install");
    expect(f?.message).toContain(".claude/hooks/av/.ariadnev-runtime.json");
  });

  it("flags a runtime marker that names a different runtime", () => {
    const findings = diagnose(
      makeReceipt(),
      makeDeps({ readHookRuntimeMarker: () => '{"schemaVersion":1,"runtime":"codex"}' }),
      opt,
    );
    expect(findings.some((f) => f.level === "fail" && f.message.includes("runtime marker"))).toBe(true);
  });

  it("reports a marker recorded in the receipt once, not also as a missing file", () => {
    const receipt = makeReceipt({
      installs: {
        "claude-code": {
          ...makeReceipt().installs["claude-code"]!,
          files: [
            ...makeReceipt().installs["claude-code"]!.files,
            { path: ".claude/hooks/av/.ariadnev-runtime.json", sha256: "m" },
          ],
        },
      },
    });
    const findings = diagnose(
      receipt,
      makeDeps({ fileExists: (p) => !p.endsWith(".ariadnev-runtime.json"), readHookRuntimeMarker: () => null }),
      opt,
    );
    expect(findings.filter((f) => f.level === "fail")).toHaveLength(1);
    expect(findings[0].message).toContain("runtime marker missing");
  });

  it("does not demand a runtime marker from an install with no hooks", () => {
    const receipt = makeReceipt({
      installs: {
        "claude-code": {
          ...makeReceipt().installs["claude-code"]!,
          files: [{ path: ".claude/skills/brainstorm/SKILL.md", sha256: "abc" }],
          hookBindings: [],
        },
      },
    });
    const findings = diagnose(receipt, makeDeps({ readHookRuntimeMarker: () => null }), opt);
    expect(findings.some((f) => f.level === "fail")).toBe(false);
  });

  it("flags a non-empty legacy skill directory claimed by the receipt", () => {
    const findings = diagnose(makeReceipt(), makeDeps({ dirExists: () => true, listDir: () => [".DS_Store"] }), {
      ...opt,
      pendingHealRemovals: [{ path: ".claude/skills/brainstorm/SKILL.md", sha256: "abc" }],
    });
    expect(findings).toContainEqual(expect.objectContaining({
      level: "fail",
      message: expect.stringContaining("legacy skill directory remains"),
      remedy: "ariadnev install",
    }));
  });

  it("does not inspect a third-party directory absent from the interrupted-heal journal", () => {
    const receipt = makeReceipt({
      installs: {
        "claude-code": {
          ...makeReceipt().installs["claude-code"]!,
          files: [{ path: ".claude/skills/av-excalidraw/SKILL.md", sha256: "abc" }],
        },
      },
    });
    const listed: string[] = [];
    const findings = diagnose(receipt, makeDeps({ listDir: (path) => { listed.push(path); return ["SKILL.md"]; } }), opt);
    expect(listed).toEqual([]);
    expect(findings.some((f) => f.message.includes("legacy skill directory"))).toBe(false);
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
    const findings = diagnose(receipt, makeDeps({ readHooksConfig: () => JSON.stringify({ hooks: {} }) }), opt);
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

// Two providers install hooks, into two different trees, registered in two
// different files. Doctor used to read claude-code's settings.json whichever
// provider it was diagnosing, so codex came back permanently degraded — and
// `--fix` then "repaired" it by writing codex's commands into Claude Code's
// config.
describe("a provider whose hook registry is not claude-code's", () => {
  const codexHooksJson = JSON.stringify({
    hooks: { SessionStart: [{ hooks: [{ type: "command", command: 'node "/home/u/.codex/hooks/av/session-init.cjs"' }] }] },
  });

  function codexReceipt(): Receipt {
    return {
      schemaVersion: 1,
      ariadnevVersion: "0.4.0",
      installs: {
        codex: {
          timestamp: "t1",
          scope: "global",
          files: [{ path: "~/.codex/hooks/av/session-init.cjs", sha256: "abc" }],
          agentsMdManaged: false,
          hookBindings: [
            { event: "SessionStart", command: 'node "/home/u/.codex/hooks/av/session-init.cjs"', applied: true },
          ],
          skipped: [],
        },
      },
    };
  }

  it("reads that provider's own config file, not another provider's", () => {
    const read: string[] = [];
    const findings = diagnose(
      codexReceipt(),
      makeDeps({
        readHooksConfig: (p) => {
          read.push(p);
          return codexHooksJson;
        },
        readHookRuntimeMarker: () => '{"schemaVersion":1,"runtime":"codex"}\n',
      }),
      opt,
    );
    expect(read).toEqual(["/home/u/.codex/hooks.json"]);
    expect(findings.every((f) => f.level !== "fail")).toBe(true);
  });

  it("names that file in the drift message rather than settings.json", () => {
    const findings = diagnose(
      codexReceipt(),
      makeDeps({ readHooksConfig: () => JSON.stringify({ hooks: {} }), readHookRuntimeMarker: () => '{"schemaVersion":1,"runtime":"codex"}\n' }),
      opt,
    );
    const f = findings.find((x) => x.message.includes("SessionStart"));
    expect(f?.level).toBe("fail");
    expect(f?.message).toContain("~/.codex/hooks.json");
    expect(f?.message).not.toContain("settings.json");
  });

  it("checks the runtime marker in that provider's own hooks tree", () => {
    const read: string[] = [];
    diagnose(
      codexReceipt(),
      makeDeps({
        readHooksConfig: () => codexHooksJson,
        readHookRuntimeMarker: (p) => {
          read.push(p);
          return '{"schemaVersion":1,"runtime":"codex"}\n';
        },
      }),
      opt,
    );
    expect(read).toEqual(["/home/u/.codex/hooks/av/.ariadnev-runtime.json"]);
  });

  it("skips a receipt entry naming a provider this build no longer has", () => {
    const receipt = makeReceipt({
      installs: { "gone-provider": { timestamp: "t", scope: "project", files: [{ path: "x", sha256: "y" }], agentsMdManaged: false, hookBindings: [], skipped: [] } },
    } as unknown as Partial<Receipt>);
    const findings = diagnose(receipt, makeDeps(), opt);
    expect(findings).toEqual([{ providerId: "gone-provider", level: "skip", message: "unknown provider in receipt — nothing to verify" }]);
  });
});

describe("a provider whose hook registry is keyed by writer, not by event", () => {
  // antigravity's hooks.json has no `hooks` object at all: each writer owns a
  // top-level key, and ariadnev's is `av`. Reading it the way claude-code's
  // settings.json is read finds nothing under every event, so a correct install
  // reports every one of its bindings as removed — a clean install that says it
  // is broken, and a `--fix` that rewrites a file that was already right.
  const command = 'node "/home/u/.gemini/config/hooks/av/plan-format-kanban.cjs"';
  const antigravityHooksJson = JSON.stringify({
    "orca-status": { Stop: [{ type: "command", command: "orca status" }] },
    av: { PostToolUse: [{ matcher: "Write", hooks: [{ type: "command", command }] }] },
  });

  function antigravityReceipt(): Receipt {
    return {
      schemaVersion: 1,
      ariadnevVersion: "0.4.0",
      installs: {
        antigravity: {
          timestamp: "t1",
          scope: "global",
          files: [{ path: "~/.gemini/config/hooks/av/plan-format-kanban.cjs", sha256: "abc" }],
          agentsMdManaged: false,
          hookBindings: [{ event: "PostToolUse", matcher: "Write", command, applied: true }],
          skipped: [],
        },
      },
    };
  }

  const marker = () => '{"schemaVersion":1,"runtime":"antigravity"}\n';

  it("finds a binding registered under this provider's own key", () => {
    const findings = diagnose(
      antigravityReceipt(),
      makeDeps({ readHooksConfig: () => antigravityHooksJson, readHookRuntimeMarker: marker }),
      opt,
    );
    expect(findings.filter((f) => f.level === "fail")).toEqual([]);
  });

  it("still reports drift when only the foreign writer's key is left", () => {
    const findings = diagnose(
      antigravityReceipt(),
      makeDeps({
        readHooksConfig: () => JSON.stringify({ "orca-status": { Stop: [{ type: "command", command: "orca status" }] } }),
        readHookRuntimeMarker: marker,
      }),
      opt,
    );
    const f = findings.find((x) => x.message.includes("PostToolUse"));
    expect(f?.level).toBe("fail");
    expect(f?.message).toContain("~/.gemini/config/hooks.json");
  });

  it("does not accept a command that happens to sit under another writer's key", () => {
    const findings = diagnose(
      antigravityReceipt(),
      makeDeps({
        readHooksConfig: () => JSON.stringify({ "orca-status": { PostToolUse: [{ hooks: [{ type: "command", command }] }] } }),
        readHookRuntimeMarker: marker,
      }),
      opt,
    );
    expect(findings.some((f) => f.level === "fail" && f.message.includes("PostToolUse"))).toBe(true);
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
