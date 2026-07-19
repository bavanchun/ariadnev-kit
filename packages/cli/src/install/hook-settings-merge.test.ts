import { describe, it, expect } from "vitest";
import {
  mergeHookSettings,
  renderHookSettingsSnippet,
  type HookBinding,
} from "./hook-settings-merge.js";

const bindings: HookBinding[] = [
  { event: "SessionStart", command: "node /home/u/.claude/hooks/vc/session-init.cjs" },
  {
    event: "PreToolUse",
    matcher: "Read|Grep|Glob",
    command: "node /home/u/.claude/hooks/vc/scout-block.cjs",
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

describe("renderHookSettingsSnippet", () => {
  it("prints a copy-pasteable hooks block", () => {
    const snippet = renderHookSettingsSnippet(bindings);
    expect(snippet).toContain("SessionStart");
    expect(snippet).toContain("session-init.cjs");
    expect(snippet).toContain("Read|Grep|Glob");
  });
});
