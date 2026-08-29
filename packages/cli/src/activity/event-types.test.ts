import { describe, expect, it } from "vitest";
import {
  ACTIVITY_KINDS,
  MAX_EVENT_BYTES,
  nextEventId,
  serializeEvent,
  toActivityEvent,
} from "./event-types.js";

describe("toActivityEvent — allowlist scrub", () => {
  it("keeps only the enumerated categorical fields and drops everything else", () => {
    // Same discipline as the history log's scrub, and for the same reason:
    // command arguments and environment values are exactly where credentials
    // live, so "just serialize the options object" is how a token reaches disk.
    const event = toActivityEvent("workflow.completed", {
      runtime: "claude-code",
      kit: "engineer",
      skill: "scout",
      workflow: "read-only-delivery",
      status: "ok",
      durationMs: 1200,
      token: "ghp_notasecretbutshaped",
      argv: ["--password", "hunter2"],
    } as never);

    expect(Object.keys(event).sort()).toEqual(
      ["durationMs", "id", "kind", "kit", "runtime", "skill", "status", "ts", "v", "workflow"].sort(),
    );
    const serialized = JSON.stringify(event);
    expect(serialized).not.toContain("ghp_");
    expect(serialized).not.toContain("hunter2");
    expect(serialized).not.toContain("argv");
  });

  it("drops a field of the wrong type rather than persisting it", () => {
    const event = toActivityEvent("install.completed", { runtime: 7, durationMs: Number.POSITIVE_INFINITY } as never);
    expect(event.runtime).toBeUndefined();
    expect(event.durationMs).toBeUndefined();
  });

  it("truncates an over-long categorical value instead of writing an unbounded line", () => {
    // `kit` and `skill` come from user-authored content, so their length is not
    // this module's to trust. An unbounded field is how a single event grows
    // past the size the append is atomic for.
    const event = toActivityEvent("workflow.started", { kit: "k".repeat(500) } as never);
    expect(event.kit?.length).toBeLessThanOrEqual(128);
  });

  it("carries a schema version and a timestamp", () => {
    const event = toActivityEvent("install.completed", {}, new Date("2026-08-28T05:00:00.000Z"));
    expect(event.v).toBe(1);
    expect(event.ts).toBe("2026-08-28T05:00:00.000Z");
  });
});

describe("nextEventId — the cursor `--since` reads", () => {
  it("sorts lexicographically in emission order", () => {
    // The whole point. `list --since <id>` is a string comparison, so byte
    // order has to equal time order or the cursor silently skips events.
    const ids = Array.from({ length: 200 }, () => nextEventId());
    expect([...ids].sort()).toEqual(ids);
  });

  it("never repeats, even within the same millisecond", () => {
    const ids = Array.from({ length: 500 }, () => nextEventId());
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps increasing when the clock jumps backwards", () => {
    // Wall clock is not monotonic: NTP correction and a manual clock change
    // both move it back. A cursor built on raw time would then hand out an ID
    // below one it already issued, and `--since` would replay or skip.
    let now = 1_800_000_000_000;
    const before = nextEventId(() => now);
    now -= 60_000;
    const after = nextEventId(() => now);
    expect(after > before).toBe(true);
  });

  it("is fixed width, so string comparison never disagrees with time order", () => {
    // A shorter ID sorts before a longer one regardless of value, which is how
    // a variable-width scheme quietly breaks at a digit boundary.
    const widths = new Set([nextEventId(), nextEventId(() => 1), nextEventId(() => 1_800_000_000_000)].map((id) => id.length));
    expect(widths.size).toBe(1);
  });
});

describe("serializeEvent", () => {
  it("returns one line with no embedded newline", () => {
    const line = serializeEvent(toActivityEvent("workflow.completed", { status: "ok" }));
    expect(line).not.toContain("\n");
    expect(JSON.parse(line)).toMatchObject({ v: 1, kind: "workflow.completed", status: "ok" });
  });

  it("refuses an event that would exceed the atomic-append size", () => {
    // `O_APPEND` advances the offset atomically; it does not make an arbitrarily
    // large write atomic. Past that size two concurrent appends can interleave
    // and tear a line, so the cap is what makes the no-torn-lines claim true
    // rather than hopeful.
    const oversized = { ...toActivityEvent("workflow.started", {}), status: "s".repeat(MAX_EVENT_BYTES) };
    expect(() => serializeEvent(oversized)).toThrow(/too large|bytes/i);
  });
});

describe("the event vocabulary", () => {
  it("is closed, so `stats` can group without guessing", () => {
    // A free-string `kind` makes a typo a new category that nobody notices
    // until an aggregate is quietly wrong. A union makes it a type error.
    expect([...ACTIVITY_KINDS]).toEqual([
      "install.completed",
      "update.completed",
      "uninstall.completed",
      "project.initialized",
      "project.registered",
      "project.deregistered",
      "workflow.started",
      "workflow.completed",
      "workflow.failed",
      "backup.created",
      "backup.restored",
      "dispatch.started",
      "dispatch.completed",
      "api.started",
      "api.stopped",
    ]);
  });
});
