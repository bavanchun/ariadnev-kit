import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { HOOK_EVENTS, isKnownHookEvent, assertKnownHookEvents, UnknownHookEventError } from "./hook-events.js";
import { loadKit } from "./load-kit.js";

const repoRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..", "..");
const kitRoot = join(repoRoot, "kit");

describe("hook event vocabulary", () => {
  it("accepts every event the shipped hooks bind — including the undocumented one", () => {
    // The acceptance direction, written first: a whitelist drafted from the
    // documented vocabulary alone rejects kit/hooks/subagent-init, which binds
    // SubagentStart. Loading the real kit is the only check that proves the
    // list was built from what ships, not from what a doc page lists.
    const hooksDir = join(kitRoot, "hooks");
    const bound = new Set<string>();
    for (const entry of readdirSync(hooksDir)) {
      const manifestPath = join(hooksDir, entry, "hook.json");
      if (!existsSync(manifestPath)) continue;
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { event?: string; events?: string[] };
      for (const e of manifest.event ? [manifest.event] : (manifest.events ?? [])) bound.add(e);
    }

    expect(bound.size).toBeGreaterThan(0);
    expect(bound.has("SubagentStart")).toBe(true);
    for (const event of bound) {
      expect(isKnownHookEvent(event), `${event} is bound by a shipped hook but not whitelisted`).toBe(true);
    }
  });

  it("loads the real kit without a validation error", () => {
    expect(() => loadKit(kitRoot)).not.toThrow();
  });

  it("rejects an event nothing raises, naming the hook and the known set", () => {
    // Source hooks bind names like Elicitation and PermissionDenied that this
    // kit has never installed or validated.
    expect(() => assertKnownHookEvents("some-hook", ["Elicitation"])).toThrow(UnknownHookEventError);
    try {
      assertKnownHookEvents("some-hook", ["PermissionDenied"]);
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toContain("some-hook");
      expect(message).toContain("PermissionDenied");
      expect(message).toContain("PreToolUse");
      // The consequence, not just the rule — this is why it matters.
      expect(message).toContain("never fires");
    }
  });

  it("checks every event in a multi-event hook, not just the first", () => {
    expect(() => assertKnownHookEvents("h", ["Stop", "TeammateIdle"])).toThrow(/TeammateIdle/);
  });

  it("marks each undocumented name with the reason it is kept", () => {
    // An entry that exists only because a shipped hook uses it is a weaker
    // claim than a documented one, and has to say so.
    for (const [name, spec] of Object.entries(HOOK_EVENTS)) {
      if (spec.origin !== "in-use") continue;
      expect(spec.note, `${name} is in-use but carries no justification`).toBeTruthy();
      expect(spec.note!.length).toBeGreaterThan(40);
    }
    expect(HOOK_EVENTS.SubagentStart.origin).toBe("in-use");
  });

  it("is case-sensitive — event names are exact", () => {
    expect(isKnownHookEvent("pretooluse")).toBe(false);
    expect(isKnownHookEvent("PreToolUse")).toBe(true);
  });
});
