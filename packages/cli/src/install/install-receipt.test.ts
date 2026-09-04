import { describe, it, expect } from "vitest";
import {
  buildReceipt,
  receiptVersion,
  toPortablePath,
  fromPortablePath,
  type ProviderResultForReceipt,
} from "./install-receipt.js";
import type { ProviderInstallResult } from "./install-types.js";

const home = "/home/u";
const cwd = "/home/u/proj";

function makeResult(overrides: Partial<ProviderInstallResult> = {}): ProviderInstallResult {
  return {
    provider: "claude-code",
    written: 1,
    backedUp: 0,
    skipped: [],
    ops: [
      { action: "write", kind: "skill", name: "brainstorm", dest: "/home/u/proj/.claude/skills/brainstorm/SKILL.md", content: "# Brainstorm\n" },
    ],
    ...overrides,
  };
}

function entry(overrides: Partial<ProviderResultForReceipt> = {}): ProviderResultForReceipt {
  return {
    providerId: "claude-code",
    scope: "project",
    applyHookSettings: false,
    result: makeResult(),
    skillSelection: { mode: "all", skills: ["brainstorm"], selectedCount: 1, totalCount: 1 },
    ...overrides,
  };
}

describe("toPortablePath / fromPortablePath", () => {
  it("stores home-relative paths with a ~ prefix", () => {
    const p = toPortablePath("/home/u/.codex/agents/x.toml", home, cwd);
    expect(p).toBe("~/.codex/agents/x.toml");
    expect(fromPortablePath(p, home, cwd)).toBe("/home/u/.codex/agents/x.toml");
  });

  it("stores cwd-relative paths as plain relative", () => {
    const p = toPortablePath("/home/u/proj/.claude/skills/x/SKILL.md", home, cwd);
    expect(p).toBe(".claude/skills/x/SKILL.md");
    expect(fromPortablePath(p, home, cwd)).toBe("/home/u/proj/.claude/skills/x/SKILL.md");
  });

  it("falls back to absolute when outside both roots", () => {
    const p = toPortablePath("/var/tmp/x", home, cwd);
    expect(p).toBe("/var/tmp/x");
    expect(fromPortablePath(p, home, cwd)).toBe("/var/tmp/x");
  });
});

describe("buildReceipt (pure)", () => {
  it("creates a fresh receipt from empty prev", () => {
    const out = JSON.parse(buildReceipt("", [entry()], { ariadnevVersion: "0.4.0", timestamp: "t1", home, cwd }));
    expect(out.schemaVersion).toBe(2);
    expect(out.ariadnevVersion).toBe("0.4.0");
    expect(out.installs["claude-code"].files).toHaveLength(1);
    expect(out.installs["claude-code"].files[0].path).toBe(".claude/skills/brainstorm/SKILL.md");
    expect(out.installs["claude-code"].files[0].sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(out.installs["claude-code"].scope).toBe("project");
  });

  it("records which skills were installed, not just how many files landed", () => {
    // An update has to compare against what the user chose at install time.
    // "all" is not self-describing once the kit grows, so the names are kept.
    const out = JSON.parse(
      buildReceipt(
        "",
        [entry({ skillSelection: { mode: "selected", skills: ["cook", "plan"], selectedCount: 2, totalCount: 103 } })],
        { ariadnevVersion: "0.4.0", timestamp: "t1", home, cwd },
      ),
    );
    expect(out.installs["claude-code"].skillSelection).toEqual({
      mode: "selected",
      skills: ["cook", "plan"],
      selectedCount: 2,
      totalCount: 103,
    });
  });

  it("merges a second provider without dropping the first", () => {
    const first = buildReceipt("", [entry()], { ariadnevVersion: "0.4.0", timestamp: "t1", home, cwd });
    const second = buildReceipt(
      first,
      [
        entry({
          providerId: "codex",
          result: makeResult({
            provider: "codex",
            ops: [{ action: "write", kind: "skill", name: "brainstorm", dest: "/home/u/.agents/skills/brainstorm/SKILL.md", content: "x" }],
          }),
        }),
      ],
      { ariadnevVersion: "0.4.0", timestamp: "t2", home, cwd },
    );
    const out = JSON.parse(second);
    expect(Object.keys(out.installs).sort()).toEqual(["claude-code", "codex"]);
    expect(out.installs["claude-code"].files).toHaveLength(1);
    expect(out.installs["codex"].files).toHaveLength(1);
  });

  it("re-install of the same provider replaces its record (idempotent, no growth)", () => {
    const first = buildReceipt("", [entry()], { ariadnevVersion: "0.4.0", timestamp: "t1", home, cwd });
    const second = buildReceipt(first, [entry()], { ariadnevVersion: "0.4.0", timestamp: "t2", home, cwd });
    const out = JSON.parse(second);
    expect(out.installs["claude-code"].files).toHaveLength(1);
    expect(out.installs["claude-code"].timestamp).toBe("t2");
  });

  it("dedupes files by path within one provider's op list", () => {
    const dup = entry({
      result: makeResult({
        ops: [
          { action: "write", kind: "skill", name: "a", dest: "/home/u/proj/.claude/skills/a/SKILL.md", content: "1" },
          { action: "write", kind: "skill", name: "a", dest: "/home/u/proj/.claude/skills/a/SKILL.md", content: "2" },
        ],
      }),
    });
    const out = JSON.parse(buildReceipt("", [dup], { ariadnevVersion: "0.4.0", timestamp: "t1", home, cwd }));
    expect(out.installs["claude-code"].files).toHaveLength(1);
    // last write wins for the hash
    expect(out.installs["claude-code"].files[0].sha256).toBe(
      require("node:crypto").createHash("sha256").update("2").digest("hex"),
    );
  });

  it("records hook bindings with applied:true when the merge was confirmed", () => {
    const withHooks = entry({
      applyHookSettings: true,
      result: makeResult({
        ops: [
          {
            action: "hook-settings",
            format: "claude-settings-json" as const,
            kind: "hook",
            name: "settings.json",
            dest: "/home/u/proj/.claude/settings.json",
            bindings: [{ event: "SessionStart", command: "node x.cjs" }],
          },
        ],
      }),
    });
    const out = JSON.parse(buildReceipt("", [withHooks], { ariadnevVersion: "0.4.0", timestamp: "t1", home, cwd }));
    expect(out.installs["claude-code"].hookBindings).toEqual([
      { event: "SessionStart", command: "node x.cjs", applied: true },
    ]);
  });

  it("records hook bindings with applied:false when the merge was declined", () => {
    const declined = entry({
      applyHookSettings: false,
      result: makeResult({
        ops: [
          {
            action: "hook-settings",
            format: "claude-settings-json" as const,
            kind: "hook",
            name: "settings.json",
            dest: "/home/u/proj/.claude/settings.json",
            bindings: [{ event: "SessionStart", command: "node x.cjs" }],
          },
        ],
      }),
    });
    const out = JSON.parse(buildReceipt("", [declined], { ariadnevVersion: "0.4.0", timestamp: "t1", home, cwd }));
    expect(out.installs["claude-code"].hookBindings).toEqual([
      { event: "SessionStart", command: "node x.cjs", applied: false },
    ]);
  });

  it("records agentsMdManaged when an agents-md op is present", () => {
    const withAgentsMd = entry({
      result: makeResult({
        ops: [{ action: "agents-md", kind: "rules", name: "AGENTS.md", dest: "/home/u/proj/AGENTS.md", block: "rules" }],
      }),
    });
    const out = JSON.parse(buildReceipt("", [withAgentsMd], { ariadnevVersion: "0.4.0", timestamp: "t1", home, cwd }));
    expect(out.installs["claude-code"].agentsMdManaged).toBe(true);
  });

  it("records skipped artifacts", () => {
    const withSkip = entry({
      result: makeResult({
        skipped: [{ action: "skip", kind: "agent", name: "av-explore", reason: "unverified" }],
      }),
    });
    const out = JSON.parse(buildReceipt("", [withSkip], { ariadnevVersion: "0.4.0", timestamp: "t1", home, cwd }));
    expect(out.installs["claude-code"].skipped).toEqual([
      { kind: "agent", name: "av-explore", reason: "unverified" },
    ]);
  });

  it("throws on unparseable prev receipt instead of silently discarding it", () => {
    expect(() => buildReceipt("{not json", [entry()], { ariadnevVersion: "0.4.0", timestamp: "t1", home, cwd })).toThrow();
  });
});

describe("pre-rename receipt", () => {
  // A receipt written before the rename records the CLI version under the old
  // key and schema 1. Readers must still get a version out of it — a receipt
  // that reads as "no version" silently suppresses the update nudge.
  it("reads the version from either key", () => {
    expect(receiptVersion({ ariadnevVersion: "1.0.0" })).toBe("1.0.0");
    expect(receiptVersion({ vcskillVersion: "0.12.0" })).toBe("0.12.0"); // brand-drift-allow: key written by pre-rename installs
  });

  it("returns null when neither key is present", () => {
    expect(receiptVersion({})).toBeNull();
  });
});
