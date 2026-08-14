import { describe, expect, it } from "vitest";
import { createRunEvent, type RunEventContextV1, type RunEventPayloadV1 } from "./event-types.js";
import { digestRunState } from "./run-state.js";
import { reduceRunEvent, replayRunEvents } from "./state-reducer.js";

function context(runId = "run.reducer"): RunEventContextV1 {
  return {
    runId,
    graph: { id: "workflow", digest: "d".repeat(64) },
    versions: { graph: "1", runner: "1", nodeAttempt: "1", idempotency: "1" },
  };
}

function event(ctx: RunEventContextV1, sequence: number, payload: RunEventPayloadV1) {
  return createRunEvent({ context: ctx, sequence, payload, recordedAt: "2026-08-08T10:00:00.000Z" });
}

function running(ctx = context()) {
  const events = [
    event(ctx, 1, { type: "run-created", entryNodeId: "start" }),
    event(ctx, 2, { type: "node-started", nodeId: "start", attempt: 1 }),
  ];
  return { events, state: replayRunEvents(events)! };
}

describe("deterministic execution state reducer", () => {
  it("returns null for an empty replay and validates the initial event", () => {
    expect(replayRunEvents([])).toBeNull();
    const ctx = context();
    expect(() => reduceRunEvent(null, event(ctx, 2, { type: "run-created", entryNodeId: "start" }))).toThrow(/sequence/i);
    expect(() => reduceRunEvent(null, event(ctx, 1, { type: "node-started", nodeId: "start", attempt: 1 }))).toThrow(/first event/i);
  });

  it("covers pending, running, waiting, retrying, and completed transitions", () => {
    const ctx = context("run.lifecycle");
    const events = [
      event(ctx, 1, { type: "run-created", entryNodeId: "start" }),
      event(ctx, 2, { type: "node-started", nodeId: "start", attempt: 1 }),
      event(ctx, 3, { type: "node-waiting", nodeId: "start", attempt: 1, reason: "approval" }),
      event(ctx, 4, { type: "node-resumed", nodeId: "start", attempt: 1 }),
      event(ctx, 5, { type: "node-retry-scheduled", nodeId: "start", attempt: 1, reason: "conflict" }),
      event(ctx, 6, { type: "node-started", nodeId: "start", attempt: 2 }),
      event(ctx, 7, { type: "node-completed", nodeId: "start", attempt: 2, nextNodeId: "finish" }),
      event(ctx, 8, { type: "node-started", nodeId: "finish", attempt: 1 }),
      event(ctx, 9, { type: "run-completed", nodeId: "finish", attempt: 1 }),
    ];
    const state = replayRunEvents(events)!;
    expect(state).toMatchObject({ status: "completed", currentNodeId: "finish", attempt: 1, terminalReason: "success" });
    expect(state.completedNodes).toEqual(["start", "finish"]);
    expect(Object.isFrozen(state.completedNodes)).toBe(true);
    expect(() => reduceRunEvent(state, event(ctx, 10, { type: "run-completed", nodeId: "finish", attempt: 1 }))).toThrow(/terminal/i);
  });

  it("tracks committed and reconciled effects without exposing effect execution", () => {
    const ctx = context("run.effects");
    let { state } = running(ctx);
    state = reduceRunEvent(state, event(ctx, 3, { type: "effect-prepared", nodeId: "start", attempt: 1, idempotencyKey: "effect.a" }));
    expect(() => reduceRunEvent(state, event(ctx, 4, { type: "effect-prepared", nodeId: "start", attempt: 1, idempotencyKey: "effect.a" }))).toThrow(/already prepared/i);
    state = reduceRunEvent(state, event(ctx, 4, { type: "effect-committed", nodeId: "start", attempt: 1, idempotencyKey: "effect.a" }));
    expect(state.effects["effect.a"].status).toBe("committed");
    state = reduceRunEvent(state, event(ctx, 5, { type: "effect-prepared", nodeId: "start", attempt: 1, idempotencyKey: "effect.b" }));
    state = reduceRunEvent(state, event(ctx, 6, {
      type: "effect-reconciled", nodeId: "start", attempt: 1, idempotencyKey: "effect.b", outcome: "not-applied",
    }));
    state = reduceRunEvent(state, event(ctx, 7, { type: "effect-prepared", nodeId: "start", attempt: 1, idempotencyKey: "effect.b" }));
    state = reduceRunEvent(state, event(ctx, 8, {
      type: "effect-reconciled", nodeId: "start", attempt: 1, idempotencyKey: "effect.b", outcome: "committed",
    }));
    expect(state.effects["effect.b"].status).toBe("committed");
    expect(Object.isFrozen(state.effects["effect.b"])).toBe(true);
  });

  it("blocks unsafe transitions while an external effect is unresolved", () => {
    const ctx = context("run.unresolved");
    let { state } = running(ctx);
    state = reduceRunEvent(state, event(ctx, 3, { type: "effect-prepared", nodeId: "start", attempt: 1, idempotencyKey: "effect" }));
    for (const payload of [
      { type: "node-retry-scheduled", nodeId: "start", attempt: 1, reason: "transient" },
      { type: "node-completed", nodeId: "start", attempt: 1, nextNodeId: "finish" },
      { type: "run-completed", nodeId: "start", attempt: 1 },
      { type: "run-failed", nodeId: "start", attempt: 1, reason: "provider" },
      { type: "run-cancelled", nodeId: "start", attempt: 1, reason: "user" },
    ] as RunEventPayloadV1[]) {
      expect(() => reduceRunEvent(state, event(ctx, 4, payload))).toThrow(/unresolved/i);
    }
  });

  it("covers failed and cancelled terminal states", () => {
    const failedContext = context("run.failed");
    const failed = reduceRunEvent(running(failedContext).state, event(failedContext, 3, {
      type: "run-failed", nodeId: "start", attempt: 1, reason: "provider",
    }));
    expect(failed).toMatchObject({ status: "failed", terminalReason: "provider" });

    const cancelledContext = context("run.cancelled");
    let cancelled = running(cancelledContext).state;
    cancelled = reduceRunEvent(cancelled, event(cancelledContext, 3, {
      type: "node-waiting", nodeId: "start", attempt: 1, reason: "input",
    }));
    cancelled = reduceRunEvent(cancelled, event(cancelledContext, 4, {
      type: "run-cancelled", nodeId: "start", attempt: 1, reason: "user",
    }));
    expect(cancelled).toMatchObject({ status: "cancelled", terminalReason: "user" });
  });

  it.each([
    ["changed context", (ctx: RunEventContextV1) => event({ ...ctx, runId: "run.other" }, 3, { type: "run-completed", nodeId: "start", attempt: 1 }), /context changed/i],
    ["reordered sequence", (ctx: RunEventContextV1) => event(ctx, 2, { type: "run-completed", nodeId: "start", attempt: 1 }), /sequence/i],
    ["duplicate creation", (ctx: RunEventContextV1) => event(ctx, 3, { type: "run-created", entryNodeId: "start" }), /only once/i],
    ["wrong current node", (ctx: RunEventContextV1) => event(ctx, 3, { type: "run-completed", nodeId: "other", attempt: 1 }), /current node/i],
    ["wrong attempt", (ctx: RunEventContextV1) => event(ctx, 3, { type: "run-completed", nodeId: "start", attempt: 2 }), /current attempt/i],
    ["invalid start state", (ctx: RunEventContextV1) => event(ctx, 3, { type: "node-started", nodeId: "start", attempt: 2 }), /pending or retrying/i],
    ["invalid wait state", (ctx: RunEventContextV1) => event(ctx, 3, { type: "node-resumed", nodeId: "start", attempt: 1 }), /waiting/i],
    ["unprepared commit", (ctx: RunEventContextV1) => event(ctx, 3, { type: "effect-committed", nodeId: "start", attempt: 1, idempotencyKey: "missing" }), /not prepared/i],
  ] as const)("rejects %s", (_label, invalidEvent, message) => {
    const ctx = context(`run.invalid-${_label.replaceAll(" ", "-")}`);
    expect(() => reduceRunEvent(running(ctx).state, invalidEvent(ctx))).toThrow(message);
  });

  it("requires the expected node and attempt when starting", () => {
    const ctx = context("run.start-errors");
    const pending = reduceRunEvent(null, event(ctx, 1, { type: "run-created", entryNodeId: "start" }));
    expect(() => reduceRunEvent(pending, event(ctx, 2, { type: "node-started", nodeId: "other", attempt: 1 }))).toThrow(/current node/i);
    expect(() => reduceRunEvent(pending, event(ctx, 2, { type: "node-started", nodeId: "start", attempt: 2 }))).toThrow(/attempt must be 1/i);
  });

  it("produces the same digest regardless of effect insertion order", () => {
    const build = (ctx: RunEventContextV1, first: string, second: string) => {
      let state = running(ctx).state;
      state = reduceRunEvent(state, event(ctx, 3, { type: "effect-prepared", nodeId: "start", attempt: 1, idempotencyKey: first }));
      state = reduceRunEvent(state, event(ctx, 4, { type: "effect-committed", nodeId: "start", attempt: 1, idempotencyKey: first }));
      state = reduceRunEvent(state, event(ctx, 5, { type: "effect-prepared", nodeId: "start", attempt: 1, idempotencyKey: second }));
      return reduceRunEvent(state, event(ctx, 6, { type: "effect-committed", nodeId: "start", attempt: 1, idempotencyKey: second }));
    };
    const ctx = context("run.digest");
    expect(digestRunState(build(ctx, "effect.a", "effect.b"))).toBe(digestRunState(build(ctx, "effect.b", "effect.a")));
    expect(digestRunState(null)).toMatch(/^sha256:[a-f0-9]{64}$/);
  });
});
