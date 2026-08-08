import { isAbsolute, normalize } from "node:path";
import { categoricalToken } from "../../eval/categorical-token.js";
import type { GraphCapability } from "../../graph/compile-graph.js";
import type { GraphNodeType } from "../../graph/graph-types.js";

export const EXECUTOR_CONTRACT_VERSION = "1.0.0";
const MAX_INSTRUCTION_BYTES = 256 * 1024;
const MAX_STATE_BYTES = 256 * 1024;

export type ExecutorCapabilityV1 = GraphCapability | "execution:cancel" | "execution:structured-output";
export type ExecutorStatusV1 = "completed" | "failed" | "cancelled" | "timed-out" | "unsupported" | "output-limit";
export type ExecutorProbeStatusV1 = "supported" | "unsupported";
export type ExecutorProbeReasonV1 =
  | "runtime-unavailable"
  | "runtime-version-drift"
  | "runtime-contract-drift"
  | "capability-missing";
export type ExecutorFailureCodeV1 =
  | "cancelled"
  | "timeout"
  | "output-limit"
  | "provider-exit"
  | "provider-spawn"
  | "malformed-output"
  | "policy-unsupported"
  | "internal";

export type JsonValueV1 = null | boolean | number | string | JsonValueV1[] | { [key: string]: JsonValueV1 };

export type ExecutorProbeV1 = Readonly<{
  schemaVersion: 1;
  provider: string;
  adapterVersion: string;
  runtimeVersion: string | null;
  model: string | null;
  status: ExecutorProbeStatusV1;
  available: readonly ExecutorCapabilityV1[];
  missing: readonly ExecutorCapabilityV1[];
  reason?: ExecutorProbeReasonV1;
}>;

export type ExecutorUsageV1 = Readonly<{
  inputTokens: number | null;
  cachedInputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
}>;

export type ExecutorFailureV1 = Readonly<{
  code: ExecutorFailureCodeV1;
  message: string;
  transient: boolean;
}>;

export type ExecutorRequestV1 = Readonly<{
  schemaVersion: 1;
  runId: string;
  attempt: number;
  node: Readonly<{ id: string; kind: GraphNodeType; ref: string }>;
  workspaceRoot: string;
  instruction: string;
  state: Readonly<Record<string, JsonValueV1>>;
  allowedStateWrites: readonly string[];
  requiredCapabilities: readonly ExecutorCapabilityV1[];
  timeoutMs: number;
  policy: Readonly<{ mode: "read-only" }>;
}>;

export type ExecutorResultV1 = Readonly<{
  schemaVersion: 1;
  status: ExecutorStatusV1;
  probe: ExecutorProbeV1;
  elapsedMs: number;
  evidenceRefs: readonly string[];
  usage: ExecutorUsageV1;
  transientStateWrites: Readonly<Record<string, JsonValueV1>>;
  failure?: ExecutorFailureV1;
}>;

export interface GraphExecutorV1 {
  readonly provider: string;
  probe(requiredCapabilities: readonly ExecutorCapabilityV1[]): ExecutorProbeV1;
  execute(request: ExecutorRequestV1, signal: AbortSignal): Promise<ExecutorResultV1>;
}

const NODE_KINDS: readonly GraphNodeType[] = ["skill", "agent", "tool", "function", "gate", "human", "terminal"];
const PROBE_REASONS: readonly ExecutorProbeReasonV1[] = [
  "runtime-unavailable", "runtime-version-drift", "runtime-contract-drift", "capability-missing",
];
const FAILURE_CODES: readonly ExecutorFailureCodeV1[] = [
  "cancelled", "timeout", "output-limit", "provider-exit", "provider-spawn", "malformed-output", "policy-unsupported", "internal",
];

function uniqueCapabilities(values: readonly ExecutorCapabilityV1[], label: string): readonly ExecutorCapabilityV1[] {
  const normalized = values.map((value) => categoricalToken(value, label) as ExecutorCapabilityV1);
  if (new Set(normalized).size !== normalized.length) throw new Error(`${label} must not contain duplicates`);
  return Object.freeze([...normalized]);
}

function nullableCount(value: number | null, label: string): number | null {
  if (value === null) return null;
  if (!Number.isInteger(value) || value < 0) throw new Error(`${label} must be a non-negative integer or null`);
  return value;
}

function jsonValue(value: unknown, label: string, depth = 0): JsonValueV1 {
  if (depth > 24) throw new Error(`${label} exceeds the nesting limit`);
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map((item, index) => jsonValue(item, `${label}[${index}]`, depth + 1));
  if (typeof value === "object" && value !== null && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => {
      if (key.length === 0 || key.length > 128 || key.includes("\0") || ["__proto__", "prototype", "constructor"].includes(key)) {
        throw new Error(`${label} contains an unsafe object key`);
      }
      return [key, jsonValue(item, `${label}.${key}`, depth + 1)];
    }));
  }
  throw new Error(`${label} must contain only finite JSON values`);
}

function stateRecord(value: Readonly<Record<string, unknown>>, label: string): Readonly<Record<string, JsonValueV1>> {
  const normalized = Object.fromEntries(Object.entries(value).map(([key, item]) => [
    categoricalToken(key, `${label} key`),
    jsonValue(item, `${label}.${key}`),
  ]));
  if (Buffer.byteLength(JSON.stringify(normalized), "utf8") > MAX_STATE_BYTES) throw new Error(`${label} exceeds the size bound`);
  return Object.freeze(normalized);
}

export function createExecutorProbe(input: Omit<ExecutorProbeV1, "schemaVersion">): ExecutorProbeV1 {
  const available = uniqueCapabilities(input.available, "executor available capability");
  const missing = uniqueCapabilities(input.missing, "executor missing capability");
  if (input.status === "supported" && (missing.length > 0 || input.reason !== undefined)) {
    throw new Error("supported executor probes cannot report missing capabilities or a reason");
  }
  if (input.status === "unsupported" && (input.reason === undefined || !PROBE_REASONS.includes(input.reason))) {
    throw new Error("unsupported executor probes require a supported reason");
  }
  return Object.freeze({
    schemaVersion: 1,
    provider: categoricalToken(input.provider, "executor provider"),
    adapterVersion: categoricalToken(input.adapterVersion, "executor adapter version"),
    runtimeVersion: input.runtimeVersion === null ? null : categoricalToken(input.runtimeVersion, "executor runtime version"),
    model: input.model === null ? null : categoricalToken(input.model, "executor model"),
    status: input.status,
    available,
    missing,
    ...(input.reason !== undefined ? { reason: input.reason } : {}),
  });
}

export function createExecutorRequest(input: Omit<ExecutorRequestV1, "schemaVersion" | "attempt"> & { attempt?: number }): ExecutorRequestV1 {
  if (!NODE_KINDS.includes(input.node.kind)) throw new Error("executor node kind is unsupported");
  if (!isAbsolute(input.workspaceRoot) || normalize(input.workspaceRoot) !== input.workspaceRoot) {
    throw new Error("executor workspaceRoot must be a normalized absolute path");
  }
  if (typeof input.instruction !== "string" || input.instruction.trim().length === 0) throw new Error("executor instruction is required");
  if (Buffer.byteLength(input.instruction, "utf8") > MAX_INSTRUCTION_BYTES) throw new Error("executor instruction exceeds the size bound");
  const attempt = input.attempt ?? 1;
  if (!Number.isInteger(attempt) || attempt < 1) throw new Error("executor attempt must be positive");
  if (!Number.isInteger(input.timeoutMs) || input.timeoutMs < 1) throw new Error("executor timeoutMs must be positive");
  const allowedStateWrites = input.allowedStateWrites.map((field) => categoricalToken(field, "executor state write"));
  if (new Set(allowedStateWrites).size !== allowedStateWrites.length) throw new Error("executor state writes must be unique");
  if (input.policy.mode !== "read-only") throw new Error("executor policy mode is unsupported");
  return Object.freeze({
    schemaVersion: 1,
    runId: categoricalToken(input.runId, "executor run ID"),
    attempt,
    node: Object.freeze({
      id: categoricalToken(input.node.id, "executor node ID"),
      kind: input.node.kind,
      ref: categoricalToken(input.node.ref, "executor node ref"),
    }),
    workspaceRoot: input.workspaceRoot,
    instruction: input.instruction,
    state: stateRecord(input.state, "executor state"),
    allowedStateWrites: Object.freeze(allowedStateWrites),
    requiredCapabilities: uniqueCapabilities(input.requiredCapabilities, "executor required capability"),
    timeoutMs: input.timeoutMs,
    policy: Object.freeze({ mode: "read-only" as const }),
  });
}

export function createExecutorResult(input: Omit<ExecutorResultV1, "schemaVersion">): ExecutorResultV1 {
  if (!Number.isFinite(input.elapsedMs) || input.elapsedMs < 0) throw new Error("executor elapsedMs must be non-negative");
  if (input.status === "completed" && input.failure !== undefined) throw new Error("completed executor results cannot include a failure");
  if (input.status !== "completed" && input.failure === undefined) throw new Error("non-completed executor results require a failure");
  if (input.failure && !FAILURE_CODES.includes(input.failure.code)) throw new Error("executor failure code is unsupported");
  const evidenceRefs = input.evidenceRefs.map((ref) => {
    if (typeof ref !== "string" || ref.length === 0) throw new Error("executor evidence refs must be non-empty strings");
    return ref;
  });
  if (new Set(evidenceRefs).size !== evidenceRefs.length) throw new Error("executor evidence refs must be unique");
  return Object.freeze({
    schemaVersion: 1,
    status: input.status,
    probe: input.probe,
    elapsedMs: input.elapsedMs,
    evidenceRefs: Object.freeze(evidenceRefs),
    usage: Object.freeze({
      inputTokens: nullableCount(input.usage.inputTokens, "executor inputTokens"),
      cachedInputTokens: nullableCount(input.usage.cachedInputTokens, "executor cachedInputTokens"),
      outputTokens: nullableCount(input.usage.outputTokens, "executor outputTokens"),
      reasoningTokens: nullableCount(input.usage.reasoningTokens, "executor reasoningTokens"),
    }),
    transientStateWrites: stateRecord(input.transientStateWrites, "executor transient state writes"),
    ...(input.failure ? { failure: Object.freeze({
      code: input.failure.code,
      message: String(input.failure.message).slice(0, 512),
      transient: input.failure.transient,
    }) } : {}),
  });
}
