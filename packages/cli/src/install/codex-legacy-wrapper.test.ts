// Detection over a `hooks.json` this installer does not own.
//
// The tempting design was to run each foreign command against a synthetic
// PreToolUse fixture and validate its stdout — which is remote code execution
// at install time, since a project-local `.codex/hooks.json` arrives with any
// cloned repository. So detection is static, the module is pure, and the first
// test here is the one that keeps it that way.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, win32 } from "node:path";
import {
  inspectCodexHooks,
  renderLegacyWrapperNotice,
  type CodexHooksSource,
} from "./codex-legacy-wrapper.js";

const OWNED = "/home/u/.codex/hooks/av";

function source(name: string, hooks: object): CodexHooksSource {
  return { path: name, contents: { hooks } };
}

describe("the module executes nothing", () => {
  it("names no process-spawning API anywhere in its source", () => {
    const src = readFileSync(join(__dirname, "codex-legacy-wrapper.ts"), "utf8");
    // Read rather than mocked: a mock proves the tested path is clean, the
    // source proves there is no other path. This is the whole safety argument
    // for shipping detection over a file arriving inside someone's clone.
    for (const forbidden of ["child_process", "execFile", "spawn", "execSync", "node:fs"]) {
      expect(src.includes(forbidden), `${forbidden} must not appear`).toBe(false);
    }
  });
});

describe("inspectCodexHooks", () => {
  it("says nothing about a file holding only our own groups", () => {
    const report = inspectCodexHooks(
      [source("~/.codex/hooks.json", {
        PreToolUse: [{ hooks: [{ type: "command", command: `node "${OWNED}/scout-block.cjs"` }] }],
      })],
      OWNED,
    );
    expect(report.foreign).toEqual([]);
    expect(report.suspects).toEqual([]);
    expect(renderLegacyWrapperNotice(report)).toBe("");
  });

  it("reports a foreign handler by its command, without interpreting it", () => {
    const report = inspectCodexHooks(
      [source("~/.codex/hooks.json", {
        PreToolUse: [
          { matcher: "Bash", hooks: [{ type: "command", command: "/opt/acme/guard --strict" }] },
          { hooks: [{ type: "command", command: `node "${OWNED}/scout-block.cjs"` }] },
        ],
      })],
      OWNED,
    );
    expect(report.foreign).toEqual([
      { path: "~/.codex/hooks.json", event: "PreToolUse", command: "/opt/acme/guard --strict", suspect: false },
    ]);
    expect(report.suspects).toEqual([]);
  });

  it("flags the documented wrapper shape as a suspect, still by path only", () => {
    // Flagged because of where the command lives, never because of what it was
    // guessed to do — the script itself is never opened, let alone run.
    const report = inspectCodexHooks(
      [source("<repo>/.codex/hooks.json", {
        PreToolUse: [{ hooks: [{ type: "command", command: "~/.claudekit/hooks/codex-wrapper.sh" }] }], // brand-drift-allow: names the third-party tool whose wrapper is being detected, not this project
        Stop: [{ hooks: [{ type: "command", command: "ck migrate --codex-hook stop" }] }],
      })],
      OWNED,
    );
    expect(report.suspects.map((f) => f.event)).toEqual(["PreToolUse", "Stop"]);
    expect(report.suspects.every((f) => f.suspect)).toBe(true);
    // A suspect is a foreign handler too; it is not counted twice.
    expect(report.foreign).toEqual([]);
  });

  it("survives a file whose shape is nothing like a hooks.json", () => {
    // Parsed by the caller from a file it does not own, so every level of it is
    // untrusted — a report of nothing beats a crash mid-install.
    for (const contents of [null, "text", 42, { hooks: "no" }, { hooks: { PreToolUse: "no" } }, {}]) {
      const report = inspectCodexHooks([{ path: "x", contents }], OWNED);
      expect(report.foreign).toEqual([]);
      expect(report.suspects).toEqual([]);
    }
    const ragged = inspectCodexHooks(
      [source("x", { PreToolUse: [{ hooks: [{ type: "command" }, null, { command: 7 }] }, null] })],
      OWNED,
    );
    expect(ragged.foreign).toEqual([]);
  });

  it("refuses an empty owned directory rather than claiming the whole file", () => {
    // `"".includes` matches every command, so an empty prefix would report every
    // foreign hook as ours and stay silent about all of them.
    expect(() => inspectCodexHooks([source("x", {})], "")).toThrow(/owned directory/);
  });
});

describe("renderLegacyWrapperNotice", () => {
  it("describes the symptom and hands over a command, without asserting a diagnosis", () => {
    const report = inspectCodexHooks(
      [source("~/.codex/hooks.json", {
        PreToolUse: [{ hooks: [{ type: "command", command: "~/.claudekit/hooks/codex-wrapper.sh" }] }], // brand-drift-allow: names the third-party tool whose wrapper is being detected, not this project
      })],
      OWNED,
    );
    const notice = renderLegacyWrapperNotice(report);
    expect(notice).toContain("~/.claudekit/hooks/codex-wrapper.sh"); // brand-drift-allow: names the third-party tool whose wrapper is being detected, not this project
    expect(notice).toContain("~/.codex/hooks.json");
    expect(notice).toMatch(/Hook failed/);
    // The remediation is the user's to run: nothing here promises to do it.
    expect(notice).toMatch(/codex\b.*\/hooks|\/hooks\b/);
  });

  it("lists foreign handlers as context, not as a problem to fix", () => {
    const report = inspectCodexHooks(
      [source("~/.codex/hooks.json", {
        Stop: [{ hooks: [{ type: "command", command: "/opt/acme/guard" }] }],
      })],
      OWNED,
    );
    const notice = renderLegacyWrapperNotice(report);
    expect(notice).toContain("/opt/acme/guard");
    expect(notice).not.toMatch(/Hook failed/);
  });
});

describe("on Windows, where our own command spells the directory differently", () => {
  it("does not report our hooks back to the user as another tool's", () => {
    // The command carries the JSON-encoded path, whose doubled separators do
    // not contain the directory as spelled. Missing that turns the install
    // summary into a warning about the hooks the same run just wrote.
    const owned = win32.join("C:\\Users\\u\\.codex\\hooks", "av");
    const report = inspectCodexHooks(
      [source("hooks.json", {
        SessionStart: [{ hooks: [{ type: "command", command: `node ${JSON.stringify(win32.join(owned, "session-init.cjs"))}` }] }],
      })],
      owned,
    );
    expect(report.foreign).toHaveLength(0);
    expect(report.suspects).toHaveLength(0);
  });
});
