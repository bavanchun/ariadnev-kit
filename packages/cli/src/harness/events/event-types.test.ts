import { describe, expect, it } from "vitest";
import {
  createRunEvent,
  parseRunEvent,
  sameRunContext,
  validateRunEventContext,
  type RunEventContextV1,
  type RunEventPayloadV1,
} from "./event-types.js";

const context: RunEventContextV1 = {
  runId: "run.event-types",
  graph: { id: "workflow", digest: "a".repeat(64) },
  versions: { graph: "1.0.0", runner: "0.11.0", nodeAttempt: "1.0.0", idempotency: "1.0.0" },
};

const payloads: RunEventPayloadV1[] = [
  { type: "run-created", entryNodeId: "start" },
  { type: "node-started", nodeId: "start", attempt: 1 },
  { type: "node-waiting", nodeId: "start", attempt: 1, reason: "input" },
  { type: "node-resumed", nodeId: "start", attempt: 1 },
  { type: "effect-prepared", nodeId: "start", attempt: 1, idempotencyKey: "effect.one" },
  { type: "effect-committed", nodeId: "start", attempt: 1, idempotencyKey: "effect.one" },
  { type: "effect-reconciled", nodeId: "start", attempt: 1, idempotencyKey: "effect.one", outcome: "not-applied" },
  { type: "node-retry-scheduled", nodeId: "start", attempt: 1, reason: "timeout" },
  { type: "node-completed", nodeId: "start", attempt: 1, nextNodeId: "finish" },
  { type: "run-completed", nodeId: "finish", attempt: 1 },
  { type: "run-failed", nodeId: "start", attempt: 1, reason: "validation" },
  { type: "run-cancelled", nodeId: "start", attempt: 1, reason: "shutdown" },
];

describe("execution event contracts", () => {
  it.each(payloads.map((payload, index) => [payload.type, payload, index + 1] as const))(
    "round-trips the strict %s payload",
    (_type, payload, sequence) => {
      const event = createRunEvent({ context, sequence, payload, recordedAt: "2026-08-08T10:00:00.000Z" });
      expect(parseRunEvent(JSON.parse(JSON.stringify(event)))).toEqual(event);
      expect(Object.isFrozen(event)).toBe(true);
    },
  );

  it("normalizes context and compares every compatibility field", () => {
    const normalized = validateRunEventContext(context);
    expect(Object.isFrozen(normalized.graph)).toBe(true);
    expect(sameRunContext(normalized, context)).toBe(true);
    expect(sameRunContext(normalized, { ...context, runId: "run.other" })).toBe(false);
    expect(sameRunContext(normalized, { ...context, graph: { ...context.graph, id: "other" } })).toBe(false);
    expect(sameRunContext(normalized, { ...context, graph: { ...context.graph, digest: "b".repeat(64) } })).toBe(false);
    expect(sameRunContext(normalized, { ...context, versions: { ...context.versions, graph: "2" } })).toBe(false);
    expect(sameRunContext(normalized, { ...context, versions: { ...context.versions, runner: "2" } })).toBe(false);
    expect(sameRunContext(normalized, { ...context, versions: { ...context.versions, nodeAttempt: "2" } })).toBe(false);
    expect(sameRunContext(normalized, { ...context, versions: { ...context.versions, idempotency: "2" } })).toBe(false);
  });

  it.each([
    [{ ...context, extra: true }, /unsupported event context field/i],
    [{ ...context, graph: { ...context.graph, digest: "not-a-digest" } }, /graph.digest/i],
    [{ ...context, graph: { ...context.graph, extra: true } }, /event graph field/i],
    [{ ...context, versions: { ...context.versions, extra: "1" } }, /event versions field/i],
  ] as const)("rejects an invalid context", (invalid, message) => {
    expect(() => validateRunEventContext(invalid)).toThrow(message);
  });

  it.each([
    [{ type: "unknown" }, /unsupported event type/i],
    [{ type: "run-created", entryNodeId: "start", prompt: "private" }, /unsupported event field/i],
    [{ type: "node-started", nodeId: "start", attempt: 0 }, /positive integer/i],
    [{ type: "node-waiting", nodeId: "start", attempt: 1, reason: "network" }, /waiting reason/i],
    [{ type: "effect-reconciled", nodeId: "start", attempt: 1, idempotencyKey: "effect", outcome: "maybe" }, /outcome/i],
    [{ type: "node-retry-scheduled", nodeId: "start", attempt: 1, reason: "forever" }, /retry reason/i],
    [{ type: "run-failed", nodeId: "start", attempt: 1, reason: "secret" }, /failure reason/i],
    [{ type: "run-cancelled", nodeId: "start", attempt: 1, reason: "secret" }, /cancellation reason/i],
  ] as const)("rejects an invalid or non-allowlisted payload", (payload, message) => {
    expect(() => createRunEvent({ context, sequence: 1, payload: payload as never })).toThrow(message);
  });

  it("rejects non-canonical envelopes and stored fields", () => {
    expect(() => createRunEvent({ context, sequence: 0, payload: payloads[0] })).toThrow(/sequence/i);
    expect(() => createRunEvent({ context, sequence: 1, payload: payloads[0], recordedAt: "yesterday" })).toThrow(/timestamp/i);
    expect(() => parseRunEvent(null)).toThrow(/object/i);
    expect(() => parseRunEvent({ schemaVersion: 2, type: "run-created" })).toThrow(/schema/i);
    const valid = createRunEvent({ context, sequence: 1, payload: payloads[0] });
    expect(() => parseRunEvent({ ...valid, rawPrompt: "private" })).toThrow(/stored event field/i);
    const { runId: _removed, ...missingRunId } = valid;
    expect(() => parseRunEvent(missingRunId)).toThrow(/runId is required/i);
  });
});
