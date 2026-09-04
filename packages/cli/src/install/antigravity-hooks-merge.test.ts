import { describe, it, expect } from "vitest";
import {
  ANTIGRAVITY_HOOK_EVENTS,
  AV_HOOK_KEY,
  mergeAntigravityHooks,
  unmergeAntigravityHooks,
} from "./antigravity-hooks-merge.js";
import type { HookBinding } from "./hook-settings-merge.js";

/**
 * The live `~/.gemini/config/hooks.json` on the machine this was written
 * against, reduced to its structure. Orca registers under a top-level key of
 * its own choosing and covers all five events, which is the case that matters:
 * a merger that keys off the event names would rewrite the whole file.
 */
const ORCA = {
  "orca-status": {
    PreInvocation: [{ type: "command", command: "/bin/sh orca-hook.sh", timeout: 10 }],
    PostInvocation: [{ type: "command", command: "/bin/sh orca-hook.sh", timeout: 10 }],
    Stop: [{ type: "command", command: "/bin/sh orca-hook.sh", timeout: 10 }],
    PreToolUse: [
      { matcher: "*", hooks: [{ type: "command", command: "/bin/sh orca-hook.sh", timeout: 10 }] },
    ],
    PostToolUse: [
      { matcher: "*", hooks: [{ type: "command", command: "/bin/sh orca-hook.sh", timeout: 10 }] },
    ],
  },
};
const orcaFile = (): string => `${JSON.stringify(ORCA, null, 2)}\n`;

const bindings: HookBinding[] = [
  { event: "PreToolUse", matcher: "Bash", command: "node /h/.gemini/config/hooks/av/guard.cjs" },
  { event: "PreToolUse", command: "node /h/.gemini/config/hooks/av/route.cjs" },
  { event: "PostToolUse", matcher: "Edit", command: "node /h/.gemini/config/hooks/av/format.cjs" },
  { event: "Stop", command: "node /h/.gemini/config/hooks/av/wrap.cjs" },
];

type Json = Record<string, any>;
const parse = (s: string): Json => JSON.parse(s) as Json;

describe("merging into antigravity's shared hooks.json", () => {
  it("adds one top-level key of its own and leaves the other writer's untouched", () => {
    const out = parse(mergeAntigravityHooks(orcaFile(), bindings));
    expect(out["orca-status"]).toEqual(ORCA["orca-status"]);
    expect(Object.keys(out)).toEqual(["orca-status", AV_HOOK_KEY]);
  });

  it("writes PreToolUse and PostToolUse as matcher groups, one per matcher", () => {
    const ours = parse(mergeAntigravityHooks(orcaFile(), bindings))[AV_HOOK_KEY];
    expect(ours.PreToolUse).toEqual([
      { matcher: "Bash", hooks: [{ type: "command", command: bindings[0].command }] },
      { hooks: [{ type: "command", command: bindings[1].command }] },
    ]);
    expect(ours.PostToolUse).toEqual([
      { matcher: "Edit", hooks: [{ type: "command", command: bindings[2].command }] },
    ]);
  });

  it("writes Stop as a flat array, because that event takes no matcher", () => {
    const ours = parse(mergeAntigravityHooks(orcaFile(), bindings))[AV_HOOK_KEY];
    expect(ours.Stop).toEqual([{ type: "command", command: bindings[3].command }]);
  });

  it("carries no event the provider does not have", () => {
    const withStrays: HookBinding[] = [
      ...bindings,
      { event: "SessionStart", command: "node /h/.gemini/config/hooks/av/init.cjs" },
      { event: "UserPromptSubmit", command: "node /h/.gemini/config/hooks/av/ctx.cjs" },
    ];
    const ours = parse(mergeAntigravityHooks(orcaFile(), withStrays))[AV_HOOK_KEY];
    expect(Object.keys(ours).every((e) => ANTIGRAVITY_HOOK_EVENTS.includes(e as never))).toBe(true);
    // Not remapped onto PreInvocation either: that fires per model turn, so a
    // session hook filed there would run on every turn of every session.
    expect(ours.PreInvocation).toBeUndefined();
  });

  it("is a no-op the second time", () => {
    const once = mergeAntigravityHooks(orcaFile(), bindings);
    expect(mergeAntigravityHooks(once, bindings)).toBe(once);
  });

  it("rebuilds our key rather than appending to it, so a dropped binding leaves nothing", () => {
    const once = mergeAntigravityHooks(orcaFile(), bindings);
    const ours = parse(mergeAntigravityHooks(once, bindings.slice(0, 1)))[AV_HOOK_KEY];
    expect(Object.keys(ours)).toEqual(["PreToolUse"]);
    expect(ours.PreToolUse).toHaveLength(1);
  });

  it("removes only our key, byte-for-byte restoring the rest", () => {
    const merged = mergeAntigravityHooks(orcaFile(), bindings);
    expect(unmergeAntigravityHooks(merged)).toBe(orcaFile());
  });

  it("removes nothing when we never wrote anything", () => {
    expect(unmergeAntigravityHooks(orcaFile())).toBe(orcaFile());
  });

  it("starts from nothing when the file is absent or empty", () => {
    const out = parse(mergeAntigravityHooks("", bindings));
    expect(Object.keys(out)).toEqual([AV_HOOK_KEY]);
    // An unmerge back to empty leaves an empty object rather than an invalid
    // file: the caller writes whatever comes back.
    expect(unmergeAntigravityHooks(mergeAntigravityHooks("", bindings))).toBe("{}\n");
  });

  it("refuses to guess at bytes it could not parse", () => {
    expect(() => mergeAntigravityHooks("{not json", bindings)).toThrow();
  });
});
