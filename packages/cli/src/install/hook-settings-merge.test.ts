import { describe, it, expect } from "vitest";
import {
  mergeHookSettings,
  unmergeHookSettings,
  renderHookSettingsSnippet,
  type HookBinding,
  mergeStatusLine,
  unmergeStatusLine,
} from "./hook-settings-merge.js";

const bindings: HookBinding[] = [
  { event: "SessionStart", command: "node /home/u/.claude/hooks/av/session-init.cjs" },
  {
    event: "PreToolUse",
    matcher: "Read|Grep|Glob",
    command: "node /home/u/.claude/hooks/av/scout-block.cjs",
  },
];

describe("mergeHookSettings (pure)", () => {
  it("creates hooks structure from empty settings", () => {
    const out = JSON.parse(mergeHookSettings("", bindings));
    expect(out.hooks.SessionStart[0].hooks[0].command).toContain("session-init.cjs");
    expect(out.hooks.PreToolUse[0].matcher).toBe("Read|Grep|Glob");
  });

  it("preserves unrelated user settings and foreign hook entries", () => {
    const existing = JSON.stringify({
      model: "opus",
      hooks: {
        SessionStart: [{ hooks: [{ type: "command", command: "echo custom" }] }],
        Stop: [{ hooks: [{ type: "command", command: "say done" }] }],
      },
    });
    const out = JSON.parse(mergeHookSettings(existing, bindings));
    expect(out.model).toBe("opus");
    expect(JSON.stringify(out.hooks.SessionStart)).toContain("echo custom");
    expect(JSON.stringify(out.hooks.Stop)).toContain("say done");
    expect(JSON.stringify(out.hooks.SessionStart)).toContain("session-init.cjs");
  });

  it("is idempotent: double apply equals single apply", () => {
    const once = mergeHookSettings("", bindings);
    const twice = mergeHookSettings(once, bindings);
    expect(JSON.parse(twice)).toEqual(JSON.parse(once));
  });

  it("dedupes by command string", () => {
    const out = JSON.parse(mergeHookSettings(mergeHookSettings("", bindings), bindings));
    const cmds = JSON.stringify(out.hooks.SessionStart).match(/session-init\.cjs/g);
    expect(cmds?.length).toBe(1);
  });

  it("throws on unparseable settings JSON instead of clobbering", () => {
    expect(() => mergeHookSettings("{not json", bindings)).toThrow();
  });
});

describe("unmergeHookSettings (pure)", () => {
  it("removes exactly our bindings, restoring pre-merge settings", () => {
    const before = JSON.stringify({ model: "opus" });
    const merged = mergeHookSettings(before, bindings);
    const back = unmergeHookSettings(merged, bindings);
    expect(JSON.parse(back)).toEqual(JSON.parse(before));
  });

  it("preserves foreign entries under the same event", () => {
    const existing = JSON.stringify({
      hooks: {
        SessionStart: [{ hooks: [{ type: "command", command: "echo custom" }] }],
      },
    });
    const merged = mergeHookSettings(existing, [bindings[0]]);
    const back = JSON.parse(unmergeHookSettings(merged, [bindings[0]]));
    expect(JSON.stringify(back.hooks.SessionStart)).toContain("echo custom");
    expect(JSON.stringify(back.hooks.SessionStart)).not.toContain("session-init.cjs");
  });

  it("deletes the event key, and the hooks object itself, once nothing is left", () => {
    const merged = mergeHookSettings("", [bindings[0]]);
    const back = JSON.parse(unmergeHookSettings(merged, [bindings[0]]));
    expect(back.hooks).toBeUndefined();
  });

  it("is idempotent: unmerging twice is the same as once", () => {
    const merged = mergeHookSettings("", bindings);
    const once = unmergeHookSettings(merged, bindings);
    const twice = unmergeHookSettings(once, bindings);
    expect(JSON.parse(twice)).toEqual(JSON.parse(once));
  });

  it("leaves settings untouched when the binding was never present", () => {
    const existing = JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: "command", command: "say done" }] }] } });
    const back = unmergeHookSettings(existing, bindings);
    expect(JSON.parse(back)).toEqual(JSON.parse(existing));
  });

  it("throws on unparseable settings JSON", () => {
    expect(() => unmergeHookSettings("{not json", bindings)).toThrow();
  });
});

describe("renderHookSettingsSnippet", () => {
  it("prints a copy-pasteable hooks block", () => {
    const snippet = renderHookSettingsSnippet(mergeHookSettings("", bindings), "/home/u/.claude/settings.json");
    expect(snippet).toContain("SessionStart");
    expect(snippet).toContain("session-init.cjs");
    expect(snippet).toContain("Read|Grep|Glob");
  });

  it("names the file the block actually goes in", () => {
    // A provider that keeps its hooks somewhere else was still told to paste
    // this into `.claude/settings.json` — a file it does not read, in a
    // directory it may not have. The destination is the op's, not a constant.
    const snippet = renderHookSettingsSnippet(mergeHookSettings("", bindings), "/home/u/.codex/hooks.json");
    expect(snippet).toContain("/home/u/.codex/hooks.json");
    expect(snippet).not.toContain(".claude/settings.json");
  });
});

describe("statusLine merge", () => {
  const OWNED = "/.claude/hooks/av/";
  const OURS = `node "/home/u/.claude/hooks/av/av-statusline.cjs"`;

  it("installs into an empty settings file", () => {
    const { json, applied } = mergeStatusLine("", OURS, OWNED);
    expect(applied).toBe(true);
    expect(JSON.parse(json).statusLine).toEqual({ type: "command", command: OURS, padding: 0 });
  });

  it("leaves a statusline the user chose exactly where it is", () => {
    // The failure this prevents: a terminal that looks different after an
    // install, with nothing saying why.
    const mine = JSON.stringify({ statusLine: { type: "command", command: 'node "$HOME/.claude/my-bar.cjs"' } });
    const { json, applied, reason } = mergeStatusLine(mine, OURS, OWNED);
    expect(applied).toBe(false);
    expect(JSON.parse(json).statusLine.command).toContain("my-bar.cjs");
    expect(reason).toContain("my-bar.cjs");
  });

  it("replaces its own entry, so reinstalling is not a conflict", () => {
    const older = JSON.stringify({ statusLine: { type: "command", command: `node "/home/u/.claude/hooks/av/av-statusline.cjs" --old` } });
    expect(mergeStatusLine(older, OURS, OWNED).applied).toBe(true);
  });

  it("removes only its own entry on uninstall", () => {
    const withOurs = JSON.stringify({ other: 1, statusLine: { type: "command", command: OURS } });
    const after = JSON.parse(unmergeStatusLine(withOurs, OWNED));
    expect(after.statusLine).toBeUndefined();
    expect(after.other).toBe(1);

    const withTheirs = JSON.stringify({ statusLine: { type: "command", command: 'node "$HOME/mine.cjs"' } });
    expect(JSON.parse(unmergeStatusLine(withTheirs, OWNED)).statusLine).toBeDefined();
  });
});
