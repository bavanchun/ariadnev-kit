import { categoricalToken } from "../../eval/categorical-token.js";

type ProvenanceSource = "harness" | "runtime";
type CommonPayload = { source: ProvenanceSource; adapter?: string; elapsedMs?: number };

export type ShadowEventPayloadV1 = CommonPayload & (
  | { kind: "node-entered"; nodeId: string }
  | { kind: "node-completed"; nodeId: string; outcome: "success" | "failure" | "cancelled" | "retry" }
  | { kind: "edge-selected"; edgeId: string }
  | { kind: "approval-recorded"; nodeId: string; decision: "approved" | "declined" }
  | { kind: "effect-observed"; nodeId: string; effect: "workspace" | "external" }
  | { kind: "proof-recorded"; nodeId: string; proofId: string }
  | { kind: "terminal-reached"; nodeId: string }
  | { kind: "unknown"; eventType: string }
);

type SpecificPayload<T> = T extends unknown ? Omit<T, keyof CommonPayload> : never;

export type ShadowEventV1 = Readonly<{
  schemaVersion: 1;
  graphId: string;
  runId: string;
  sequence: number;
  provenance: Readonly<{ source: ProvenanceSource; adapter?: string }>;
  elapsedMs?: number;
} & SpecificPayload<ShadowEventPayloadV1>>;

const COMMON_FIELDS = ["graphId", "runId", "sequence", "kind", "source", "adapter", "elapsedMs"];
const STORED_COMMON_FIELDS = ["schemaVersion", "graphId", "runId", "sequence", "provenance", "elapsedMs", "kind"];
const KIND_FIELDS: Record<ShadowEventPayloadV1["kind"], string[]> = {
  "node-entered": ["nodeId"],
  "node-completed": ["nodeId", "outcome"],
  "edge-selected": ["edgeId"],
  "approval-recorded": ["nodeId", "decision"],
  "effect-observed": ["nodeId", "effect"],
  "proof-recorded": ["nodeId", "proofId"],
  "terminal-reached": ["nodeId"],
  unknown: ["eventType"],
};

export function createShadowEvent(input: {
  graphId: string;
  runId: string;
  sequence: number;
} & ShadowEventPayloadV1): ShadowEventV1 {
  if (!Object.prototype.hasOwnProperty.call(KIND_FIELDS, input.kind)) throw new Error(`unsupported shadow event kind: ${String(input.kind)}`);
  const allowed = new Set([...COMMON_FIELDS, ...KIND_FIELDS[input.kind]]);
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) throw new Error(`unsupported shadow event field: ${key}`);
  }
  if (!Number.isInteger(input.sequence) || input.sequence < 1) throw new Error("shadow event sequence must be positive");
  if (input.source !== "harness" && input.source !== "runtime") throw new Error("shadow event source is unsupported");
  if (input.elapsedMs !== undefined && (!Number.isFinite(input.elapsedMs) || input.elapsedMs < 0)) {
    throw new Error("shadow elapsedMs must be non-negative");
  }
  const common = {
    schemaVersion: 1 as const,
    graphId: categoricalToken(input.graphId, "shadow.graphId"),
    runId: categoricalToken(input.runId, "shadow.runId"),
    sequence: input.sequence,
    provenance: Object.freeze({
      source: input.source,
      ...(input.adapter !== undefined ? { adapter: categoricalToken(input.adapter, "shadow.adapter") } : {}),
    }),
    ...(input.elapsedMs !== undefined ? { elapsedMs: input.elapsedMs } : {}),
  };
  return Object.freeze({ ...common, ...eventFields(input) }) as ShadowEventV1;
}

function eventFields(input: ShadowEventPayloadV1): object {
  switch (input.kind) {
    case "node-entered":
    case "terminal-reached":
      return { kind: input.kind, nodeId: categoricalToken(input.nodeId, `shadow.${input.kind}.nodeId`) };
    case "node-completed":
      if (!["success", "failure", "cancelled", "retry"].includes(input.outcome)) throw new Error("shadow node outcome is unsupported");
      return { kind: input.kind, nodeId: categoricalToken(input.nodeId, "shadow.node-completed.nodeId"), outcome: input.outcome };
    case "edge-selected":
      return { kind: input.kind, edgeId: categoricalToken(input.edgeId, "shadow.edgeId") };
    case "approval-recorded":
      if (input.decision !== "approved" && input.decision !== "declined") throw new Error("shadow approval decision is unsupported");
      return { kind: input.kind, nodeId: categoricalToken(input.nodeId, "shadow.approval.nodeId"), decision: input.decision };
    case "effect-observed":
      if (input.effect !== "workspace" && input.effect !== "external") throw new Error("shadow effect is unsupported");
      return { kind: input.kind, nodeId: categoricalToken(input.nodeId, "shadow.effect.nodeId"), effect: input.effect };
    case "proof-recorded":
      return {
        kind: input.kind,
        nodeId: categoricalToken(input.nodeId, "shadow.proof.nodeId"),
        proofId: categoricalToken(input.proofId, "shadow.proof.id"),
      };
    case "unknown":
      return { kind: input.kind, eventType: categoricalToken(input.eventType, "shadow.eventType") };
  }
}

export function parseShadowEvent(value: unknown): ShadowEventV1 {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("shadow event must be an object");
  const event = value as Record<string, unknown>;
  if (event.schemaVersion !== 1 || typeof event.kind !== "string" || !Object.prototype.hasOwnProperty.call(KIND_FIELDS, event.kind)) {
    throw new Error("shadow event schema or kind is unsupported");
  }
  const kind = event.kind as ShadowEventPayloadV1["kind"];
  const allowed = new Set([...STORED_COMMON_FIELDS, ...KIND_FIELDS[kind]]);
  for (const key of Object.keys(event)) if (!allowed.has(key)) throw new Error(`unsupported stored shadow event field: ${key}`);
  if (typeof event.provenance !== "object" || event.provenance === null || Array.isArray(event.provenance)) {
    throw new Error("shadow event provenance must be an object");
  }
  const provenance = event.provenance as Record<string, unknown>;
  for (const key of Object.keys(provenance)) if (key !== "source" && key !== "adapter") throw new Error(`unsupported shadow provenance field: ${key}`);
  const common = {
    graphId: event.graphId as string,
    runId: event.runId as string,
    sequence: event.sequence as number,
    source: provenance.source as ProvenanceSource,
    ...(provenance.adapter !== undefined ? { adapter: provenance.adapter as string } : {}),
    ...(event.elapsedMs !== undefined ? { elapsedMs: event.elapsedMs as number } : {}),
  };
  switch (kind) {
    case "node-entered":
    case "terminal-reached":
      return createShadowEvent({ ...common, kind, nodeId: event.nodeId as string });
    case "node-completed":
      return createShadowEvent({ ...common, kind, nodeId: event.nodeId as string, outcome: event.outcome as "success" });
    case "edge-selected":
      return createShadowEvent({ ...common, kind, edgeId: event.edgeId as string });
    case "approval-recorded":
      return createShadowEvent({ ...common, kind, nodeId: event.nodeId as string, decision: event.decision as "approved" });
    case "effect-observed":
      return createShadowEvent({ ...common, kind, nodeId: event.nodeId as string, effect: event.effect as "workspace" });
    case "proof-recorded":
      return createShadowEvent({ ...common, kind, nodeId: event.nodeId as string, proofId: event.proofId as string });
    case "unknown":
      return createShadowEvent({ ...common, kind, eventType: event.eventType as string });
  }
}
