// What the install tells a Codex user once its hooks are on disk.
//
// Two things are true after the merge and neither is visible from the file
// list: the hooks do nothing until the user trusts them in Codex's own TUI, and
// a stale wrapper left in the same shared `hooks.json` turns a deny into `Hook
// failed`. Both are reported here, from files the install reads and never runs.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderCodexHookNotices } from "./install-command.js";
import type { ProviderInstallResult } from "../install/install-types.js";

let home: string;
let cwd: string;

const OWNED = "/home/u/.codex/hooks/av";

function codexResult(overrides: Partial<ProviderInstallResult> = {}): ProviderInstallResult {
  return {
    provider: "codex",
    written: 3,
    backedUp: 0,
    skipped: [],
    ops: [
      {
        action: "hook-settings",
        kind: "hook",
        name: "hooks",
        dest: join(home, ".codex", "hooks.json"),
        bindings: [],
        format: "codex-hooks-json",
        ownedDir: OWNED,
      },
    ],
    ...overrides,
  };
}

function writeHooks(dir: string, contents: unknown): void {
  mkdirSync(join(dir, ".codex"), { recursive: true });
  writeFileSync(join(dir, ".codex", "hooks.json"), JSON.stringify(contents));
}

beforeEach(() => {
  const root = mkdtempSync(join(tmpdir(), "ariadnev-codexnotice-"));
  home = join(root, "home");
  cwd = join(root, "repo");
  mkdirSync(home, { recursive: true });
  mkdirSync(cwd, { recursive: true });
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
  rmSync(cwd, { recursive: true, force: true });
});

describe("codex hook notices", () => {
  it("says nothing when the run installed no codex hooks", () => {
    const claude: ProviderInstallResult = { provider: "claude-code", written: 9, backedUp: 0, skipped: [], ops: [] };
    expect(renderCodexHookNotices([claude], home, cwd)).toBe("");
  });

  it("names the TUI as the only way to trust what was just written", () => {
    const notice = renderCodexHookNotices([codexResult()], home, cwd);
    expect(notice).toContain("/hooks");
    expect(notice).toContain(join(home, ".codex", "hooks.json"));
    // The flag exists but is the user's to pass per session; presenting it as a
    // remedy the install could have applied would be a lie about our own reach.
    expect(notice).toContain("--dangerously-bypass-hook-trust");
  });

  it("reports a legacy wrapper sharing the file, from both locations", () => {
    writeHooks(home, {
      hooks: { Stop: [{ hooks: [{ type: "command", command: "~/.claudekit/hooks/codex-wrapper.sh" }] }] }, // brand-drift-allow: names the third-party tool whose wrapper is being detected, not this project
    });
    writeHooks(cwd, {
      hooks: { PreToolUse: [{ hooks: [{ type: "command", command: "./scripts/lint-guard.sh" }] }] },
    });
    const notice = renderCodexHookNotices([codexResult()], home, cwd);
    expect(notice).toContain("codex-wrapper.sh");
    expect(notice).toContain("Hook failed");
    expect(notice).toContain("lint-guard.sh");
  });

  it("leaves our own entries out of the report", () => {
    writeHooks(home, {
      hooks: { Stop: [{ hooks: [{ type: "command", command: `node "${OWNED}/session-init.cjs"` }] }] },
    });
    const notice = renderCodexHookNotices([codexResult()], home, cwd);
    expect(notice).not.toContain("session-init.cjs");
  });

  it("survives a hooks.json that is not JSON at all", () => {
    mkdirSync(join(home, ".codex"), { recursive: true });
    writeFileSync(join(home, ".codex", "hooks.json"), "{ this is not json");
    expect(() => renderCodexHookNotices([codexResult()], home, cwd)).not.toThrow();
    expect(renderCodexHookNotices([codexResult()], home, cwd)).toContain("/hooks");
  });
});
