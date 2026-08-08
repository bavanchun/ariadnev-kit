import { categoricalToken } from "../../eval/categorical-token.js";

const GRAPH_DIGEST_PATTERN = /^[a-f0-9]{64}$/;

export type RunGraphIdentityV1 = Readonly<{
  id: string;
  digest: string;
}>;

export type RunContractVersionsV1 = Readonly<{
  graph: string;
  runner: string;
  nodeAttempt: string;
  idempotency: string;
}>;

export type RunEventContextV1 = Readonly<{
  runId: string;
  graph: RunGraphIdentityV1;
  versions: RunContractVersionsV1;
}>;

export type RunEventPayloadV1 =
  | { type: "run-created"; entryNodeId: string }
  | { type: "node-started"; nodeId: string; attempt: number }
  | { type: "node-waiting"; nodeId: string; attempt: number; reason: "approval" | "input" }
  | { type: "node-resumed"; nodeId: string; attempt: number }
  | { type: "effect-prepared"; nodeId: string; attempt: number; idempotencyKey: string }
  | { type: "effect-committed"; nodeId: string; attempt: number; idempotencyKey: string }
  | {
      type: "effect-reconciled";
      nodeId: string;
      attempt: number;
      idempotencyKey: string;
      outcome: "committed" | "not-applied";
    }
  | { type: "node-retry-scheduled"; nodeId: string; attempt: number; reason: "transient" | "timeout" | "conflict" }
  | { type: "node-completed"; nodeId: string; attempt: number; nextNodeId: string }
  | { type: "run-completed"; nodeId: string; attempt: number }
  | {
      type: "run-failed";
      nodeId: string;
      attempt: number;
      reason: "provider" | "policy" | "validation" | "exhausted" | "internal";
    }
  | { type: "run-cancelled"; nodeId: string; attempt: number; reason: "user" | "policy" | "shutdown" };

export type RunEventV1 = Readonly<RunEventContextV1 & {
  schemaVersion: 1;
  sequence: number;
  recordedAt: string;
} & RunEventPayloadV1>;

const COMMON_STORED_FIELDS = ["schemaVersion", "runId", "sequence", "recordedAt", "graph", "versions"];
const PAYLOAD_FIELDS: Record<RunEventPayloadV1["type"], readonly string[]> = {
  "run-created": ["entryNodeId"],
  "node-started": ["nodeId", "attempt"],
  "node-waiting": ["nodeId", "attempt", "reason"],
  "node-resumed": ["nodeId", "attempt"],
  "effect-prepared": ["nodeId", "attempt", "idempotencyKey"],
  "effect-committed": ["nodeId", "attempt", "idempotencyKey"],
  "effect-reconciled": ["nodeId", "attempt", "idempotencyKey", "outcome"],
  "node-retry-scheduled": ["nodeId", "attempt", "reason"],
  "node-completed": ["nodeId", "attempt", "nextNodeId"],
  "run-completed": ["nodeId", "attempt"],
  "run-failed": ["nodeId", "attempt", "reason"],
  "run-cancelled": ["nodeId", "attempt", "reason"],
};

function exactObject(value: unknown, label: string, fields: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`);
  const object = value as Record<string, unknown>;
  for (const key of Object.keys(object)) {
    if (!fields.includes(key)) throw new Error(`unsupported ${label} field: ${key}`);
  }
  for (const key of fields) {
    if (!Object.prototype.hasOwnProperty.call(object, key)) throw new Error(`${label}.${key} is required`);
  }
  return object;
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) < 1) throw new Error(`${label} must be a positive integer`);
  return value as number;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) throw new Error(`${label} is unsupported`);
  return value as T;
}

export function validateRunEventContext(value: unknown): RunEventContextV1 {
  const context = exactObject(value, "event context", ["runId", "graph", "versions"]);
  const graph = exactObject(context.graph, "event graph", ["id", "digest"]);
  const versions = exactObject(context.versions, "event versions", ["graph", "runner", "nodeAttempt", "idempotency"]);
  if (typeof graph.digest !== "string" || !GRAPH_DIGEST_PATTERN.test(graph.digest)) {
    throw new Error("event graph.digest must be a lowercase SHA-256 digest");
  }
  return Object.freeze({
    runId: categoricalToken(context.runId, "event.runId"),
    graph: Object.freeze({
      id: categoricalToken(graph.id, "event.graph.id"),
      digest: graph.digest,
    }),
    versions: Object.freeze({
      graph: categoricalToken(versions.graph, "event.versions.graph"),
      runner: categoricalToken(versions.runner, "event.versions.runner"),
      nodeAttempt: categoricalToken(versions.nodeAttempt, "event.versions.nodeAttempt"),
      idempotency: categoricalToken(versions.idempotency, "event.versions.idempotency"),
    }),
  });
}

function validatePayload(value: unknown): RunEventPayloadV1 {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("event payload must be an object");
  const input = value as Record<string, unknown>;
  if (typeof input.type !== "string" || !Object.prototype.hasOwnProperty.call(PAYLOAD_FIELDS, input.type)) {
    throw new Error(`unsupported event type: ${String(input.type)}`);
  }
  const type = input.type as RunEventPayloadV1["type"];
  const event = exactObject(input, "event", ["type", ...PAYLOAD_FIELDS[type]]);
  switch (type) {
    case "run-created":
      return { type, entryNodeId: categoricalToken(event.entryNodeId, "event.entryNodeId") };
    case "node-started":
    case "node-resumed":
      return {
        type,
        nodeId: categoricalToken(event.nodeId, "event.nodeId"),
        attempt: positiveInteger(event.attempt, "event.attempt"),
      };
    case "effect-prepared":
    case "effect-committed":
      return {
        type,
        nodeId: categoricalToken(event.nodeId, "event.nodeId"),
        attempt: positiveInteger(event.attempt, "event.attempt"),
        idempotencyKey: categoricalToken(event.idempotencyKey, "event.idempotencyKey"),
      };
    case "node-waiting":
      return {
        type,
        nodeId: categoricalToken(event.nodeId, "event.nodeId"),
        attempt: positiveInteger(event.attempt, "event.attempt"),
        reason: oneOf(event.reason, ["approval", "input"], "event.waiting reason"),
      };
    case "effect-reconciled":
      return {
        type,
        nodeId: categoricalToken(event.nodeId, "event.nodeId"),
        attempt: positiveInteger(event.attempt, "event.attempt"),
        idempotencyKey: categoricalToken(event.idempotencyKey, "event.idempotencyKey"),
        outcome: oneOf(event.outcome, ["committed", "not-applied"], "event.reconciliation outcome"),
      };
    case "node-retry-scheduled":
      return {
        type,
        nodeId: categoricalToken(event.nodeId, "event.nodeId"),
        attempt: positiveInteger(event.attempt, "event.attempt"),
        reason: oneOf(event.reason, ["transient", "timeout", "conflict"], "event.retry reason"),
      };
    case "node-completed":
      return {
        type,
        nodeId: categoricalToken(event.nodeId, "event.nodeId"),
        attempt: positiveInteger(event.attempt, "event.attempt"),
        nextNodeId: categoricalToken(event.nextNodeId, "event.nextNodeId"),
      };
    case "run-completed":
      return {
        type,
        nodeId: categoricalToken(event.nodeId, "event.nodeId"),
        attempt: positiveInteger(event.attempt, "event.attempt"),
      };
    case "run-failed":
      return {
        type,
        nodeId: categoricalToken(event.nodeId, "event.nodeId"),
        attempt: positiveInteger(event.attempt, "event.attempt"),
        reason: oneOf(event.reason, ["provider", "policy", "validation", "exhausted", "internal"], "event.failure reason"),
      };
    case "run-cancelled":
      return {
        type,
        nodeId: categoricalToken(event.nodeId, "event.nodeId"),
        attempt: positiveInteger(event.attempt, "event.attempt"),
        reason: oneOf(event.reason, ["user", "policy", "shutdown"], "event.cancellation reason"),
      };
  }
}

export function createRunEvent(input: {
  context: RunEventContextV1;
  sequence: number;
  payload: RunEventPayloadV1;
  recordedAt?: string;
}): RunEventV1 {
  const context = validateRunEventContext(input.context);
  const payload = validatePayload(input.payload);
  const sequence = positiveInteger(input.sequence, "event.sequence");
  const recordedAt = input.recordedAt ?? new Date().toISOString();
  if (typeof recordedAt !== "string" || Number.isNaN(Date.parse(recordedAt)) || new Date(recordedAt).toISOString() !== recordedAt) {
    throw new Error("event.recordedAt must be a canonical ISO timestamp");
  }
  return Object.freeze({ schemaVersion: 1 as const, ...context, sequence, recordedAt, ...payload }) as RunEventV1;
}

export function parseRunEvent(value: unknown): RunEventV1 {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("stored event must be an object");
  const input = value as Record<string, unknown>;
  if (input.schemaVersion !== 1 || typeof input.type !== "string" || !Object.prototype.hasOwnProperty.call(PAYLOAD_FIELDS, input.type)) {
    throw new Error("stored event schema or type is unsupported");
  }
  const type = input.type as RunEventPayloadV1["type"];
  const stored = exactObject(input, "stored event", [...COMMON_STORED_FIELDS, "type", ...PAYLOAD_FIELDS[type]]);
  return createRunEvent({
    context: { runId: stored.runId as string, graph: stored.graph as RunGraphIdentityV1, versions: stored.versions as RunContractVersionsV1 },
    sequence: stored.sequence as number,
    recordedAt: stored.recordedAt as string,
    payload: validatePayload(Object.fromEntries(["type", ...PAYLOAD_FIELDS[type]].map((key) => [key, stored[key]]))),
  });
}

export function sameRunContext(left: RunEventContextV1, right: RunEventContextV1): boolean {
  return left.runId === right.runId
    && left.graph.id === right.graph.id
    && left.graph.digest === right.graph.digest
    && left.versions.graph === right.versions.graph
    && left.versions.runner === right.versions.runner
    && left.versions.nodeAttempt === right.versions.nodeAttempt
    && left.versions.idempotency === right.versions.idempotency;
}
