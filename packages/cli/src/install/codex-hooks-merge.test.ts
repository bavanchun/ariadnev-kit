// The file this merges into is one three other tools already write to, and
// Codex keys its per-hook trust on `<source>:<event>:<group index>:<hook
// index>`. So the merge is judged on two things the Claude Code settings merge
// never had to care about: a foreign group must come back byte-for-byte, and a
// foreign group's *position* must not move, or its trust hash is orphaned and
// the user is asked to re-trust a hook they never touched.

import { describe, expect, it } from "vitest";
import { mergeCodexHooks, unmergeCodexHooks } from "./codex-hooks-merge.js";
import type { HookBinding } from "./hook-settings-merge.js";

const OWNED = "/home/u/.codex/hooks/av";

/**
 * Shaped from a real `~/.codex/hooks.json`: two independent third-party writers
 * on SessionStart, one of them also on PreToolUse, and a group carrying the
 * `timeout` field Codex's own files use.
 */
const FOREIGN = {
  hooks: {
    SessionStart: [
      { hooks: [{ command: "bash '/home/u/.codex/herdr-agent-state.sh' session", timeout: 10, type: "command" }] },
      { hooks: [{ type: "command", command: "/bin/sh '/home/u/.orca/agent-hooks/codex-hook.sh'", timeout: 10 }] },
    ],
    PreToolUse: [
      { matcher: "Bash", hooks: [{ type: "command", command: "/bin/sh '/home/u/.orca/agent-hooks/codex-hook.sh'", timeout: 10 }] },
    ],
  },
};

const BINDINGS: HookBinding[] = [
  { event: "SessionStart", command: `node "${OWNED}/session-init.cjs"` },
  { event: "PreToolUse", matcher: "Bash", command: `node "${OWNED}/scout-block.cjs"` },
];

const existing = (): string => `${JSON.stringify(FOREIGN, null, 2)}\n`;
const parse = (json: string): typeof FOREIGN => JSON.parse(json) as typeof FOREIGN;

describe("merging into a hooks.json other tools already own", () => {
  it("returns every foreign group unchanged", () => {
    const after = parse(mergeCodexHooks(existing(), BINDINGS, OWNED));
    expect(after.hooks.SessionStart.slice(0, 2)).toEqual(FOREIGN.hooks.SessionStart);
    expect(after.hooks.PreToolUse.slice(0, 1)).toEqual(FOREIGN.hooks.PreToolUse);
  });

  it("appends our group last so no foreign group's trust index moves", () => {
    const after = parse(mergeCodexHooks(existing(), BINDINGS, OWNED));
    expect(after.hooks.SessionStart).toHaveLength(3);
    expect(after.hooks.SessionStart[2]?.hooks[0]?.command).toBe(`node "${OWNED}/session-init.cjs"`);
  });

  it("carries the matcher onto our group and leaves it off when there is none", () => {
    const after = parse(mergeCodexHooks(existing(), BINDINGS, OWNED)) as unknown as {
      hooks: Record<string, { matcher?: string }[]>;
    };
    expect(after.hooks.PreToolUse?.[1]?.matcher).toBe("Bash");
    expect(after.hooks.SessionStart?.[2]).not.toHaveProperty("matcher");
  });

  it("puts all of one event's bindings in a single owned group", () => {
    const two: HookBinding[] = [
      { event: "Stop", command: `node "${OWNED}/a.cjs"` },
      { event: "Stop", command: `node "${OWNED}/b.cjs"` },
    ];
    const after = parse(mergeCodexHooks(existing(), two, OWNED)) as unknown as {
      hooks: Record<string, { hooks: { command: string }[] }[]>;
    };
    expect(after.hooks.Stop).toHaveLength(1);
    expect(after.hooks.Stop?.[0]?.hooks.map((h) => h.command)).toEqual([`node "${OWNED}/a.cjs"`, `node "${OWNED}/b.cjs"`]);
  });

  it("is a no-op the second time", () => {
    const once = mergeCodexHooks(existing(), BINDINGS, OWNED);
    expect(mergeCodexHooks(once, BINDINGS, OWNED)).toBe(once);
  });

  it("replaces our own stale group rather than adding a second one", () => {
    const stale = mergeCodexHooks(existing(), [{ event: "SessionStart", command: `node "${OWNED}/gone.cjs"` }], OWNED);
    const after = parse(mergeCodexHooks(stale, BINDINGS, OWNED)) as unknown as {
      hooks: Record<string, { hooks: { command: string }[] }[]>;
    };
    const owned = (after.hooks.SessionStart ?? []).filter((g) => g.hooks.some((h) => h.command.includes(OWNED)));
    expect(owned).toHaveLength(1);
    expect(owned[0]?.hooks.map((h) => h.command)).toEqual([`node "${OWNED}/session-init.cjs"`]);
  });

  it("starts from nothing when the file does not exist yet", () => {
    const after = parse(mergeCodexHooks("", BINDINGS, OWNED)) as unknown as {
      hooks: Record<string, unknown[]>;
    };
    expect(Object.keys(after.hooks).sort()).toEqual(["PreToolUse", "SessionStart"]);
  });

  it("throws rather than clobbering a file it cannot parse", () => {
    expect(() => mergeCodexHooks("{ not json", BINDINGS, OWNED)).toThrow();
  });
});

describe("removing our groups again", () => {
  it("deletes only groups whose commands live in our install dir", () => {
    const after = parse(unmergeCodexHooks(mergeCodexHooks(existing(), BINDINGS, OWNED), OWNED));
    expect(after).toEqual(FOREIGN);
  });

  it("drops an event whose only group was ours", () => {
    const merged = mergeCodexHooks(existing(), [{ event: "Stop", command: `node "${OWNED}/a.cjs"` }], OWNED);
    const after = parse(unmergeCodexHooks(merged, OWNED)) as unknown as { hooks: Record<string, unknown> };
    expect(after.hooks).not.toHaveProperty("Stop");
  });

  it("leaves a file that was never ours completely alone", () => {
    expect(parse(unmergeCodexHooks(existing(), OWNED))).toEqual(FOREIGN);
  });

  it("is idempotent", () => {
    const once = unmergeCodexHooks(mergeCodexHooks(existing(), BINDINGS, OWNED), OWNED);
    expect(unmergeCodexHooks(once, OWNED)).toBe(once);
  });
});
