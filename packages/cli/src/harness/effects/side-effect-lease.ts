import { createHash } from "node:crypto";
import { isAbsolute, normalize } from "node:path";
import { categoricalToken, sha256Digest } from "../../eval/categorical-token.js";
import type { AuthorityCapability } from "../../graph/graph-types.js";
import type { JsonValueV1 } from "../executors/executor.js";

export type SideEffectLeaseStatusV1 = "planned" | "attempted" | "confirmed" | "uncertain" | "not-applied";

export type SideEffectLeaseV1 = Readonly<{
  schemaVersion: 1;
  runId: string;
  graphDigest: string;
  nodeId: string;
  attempt: number;
  declaredKey: string;
  idempotencyKey: string;
  actionDigest: string;
  scopeDigest: string;
  status: SideEffectLeaseStatusV1;
  evidenceRefs: readonly string[];
}>;

export type SideEffectFailureCodeV1 = "cancelled" | "timeout" | "conflict" | "failed" | "internal";

export type SideEffectRequestV1 = Readonly<{
  schemaVersion: 1;
  lease: SideEffectLeaseV1;
  effect: "workspace" | "external";
  node: Readonly<{ id: string; ref: string }>;
  workspaceRoot: string;
  workspaceScope: readonly string[];
  externalScope: readonly string[];
  instruction: string;
  state: Readonly<Record<string, JsonValueV1>>;
  allowedStateWrites: readonly string[];
  requiredCapabilities: readonly AuthorityCapability[];
  timeoutMs: number;
}>;

export type SideEffectResultV1 = Readonly<{
  schemaVersion: 1;
  status: "completed" | "failed" | "cancelled" | "timed-out";
  elapsedMs: number;
  evidenceRefs: readonly string[];
  transientStateWrites: Readonly<Record<string, JsonValueV1>>;
  failure?: Readonly<{ code: SideEffectFailureCodeV1; message: string; transient: boolean }>;
}>;

export interface SideEffectExecutorV1 {
  readonly effects: ReadonlyArray<"workspace" | "external">;
  execute(request: SideEffectRequestV1, signal: AbortSignal): Promise<SideEffectResultV1>;
}

const GRAPH_DIGEST = /^[a-f0-9]{64}$/;

function transition(
  lease: SideEffectLeaseV1,
  status: SideEffectLeaseStatusV1,
  evidenceRefs: readonly string[] = lease.evidenceRefs,
): SideEffectLeaseV1 {
  return Object.freeze({ ...lease, status, evidenceRefs: Object.freeze([...evidenceRefs]) });
}

function evidence(values: readonly string[]): readonly string[] {
  if (values.some((value) => typeof value !== "string" || value.length === 0)) throw new Error("side-effect evidence refs must be non-empty");
  if (new Set(values).size !== values.length) throw new Error("side-effect evidence refs must be unique");
  return values;
}

function jsonRecord(value: Readonly<Record<string, JsonValueV1>>): Readonly<Record<string, JsonValueV1>> {
  const encoded = JSON.stringify(value);
  if (encoded === undefined || Buffer.byteLength(encoded, "utf8") > 256 * 1024) throw new Error("side-effect state is invalid or too large");
  return Object.freeze(JSON.parse(encoded) as Record<string, JsonValueV1>);
}

export function createSideEffectLease(input: {
  runId: string;
  graphDigest: string;
  nodeId: string;
  attempt: number;
  declaredKey: string;
  actionDigest: string;
  scopeDigest: string;
}): SideEffectLeaseV1 {
  const runId = categoricalToken(input.runId, "side-effect run ID");
  const nodeId = categoricalToken(input.nodeId, "side-effect node ID");
  const declaredKey = categoricalToken(input.declaredKey, "side-effect declared key");
  if (!GRAPH_DIGEST.test(input.graphDigest)) throw new Error("side-effect graph digest is invalid");
  const actionDigest = sha256Digest(input.actionDigest, "side-effect action digest");
  const scopeDigest = sha256Digest(input.scopeDigest, "side-effect scope digest");
  if (!Number.isInteger(input.attempt) || input.attempt < 1) throw new Error("side-effect attempt must be positive");
  const identity = JSON.stringify([runId, input.graphDigest, nodeId, declaredKey, actionDigest, scopeDigest]);
  const suffix = createHash("sha256").update(identity).digest("hex").slice(0, 16);
  const idempotencyKey = categoricalToken(`${declaredKey}.${suffix}`, "side-effect idempotency key");
  return Object.freeze({
    schemaVersion: 1,
    runId,
    graphDigest: input.graphDigest,
    nodeId,
    attempt: input.attempt,
    declaredKey,
    idempotencyKey,
    actionDigest,
    scopeDigest,
    status: "planned",
    evidenceRefs: Object.freeze([]),
  });
}

export function markSideEffectAttempted(lease: SideEffectLeaseV1): SideEffectLeaseV1 {
  if (lease.status === "uncertain") throw new Error("uncertain side effects require reconciliation before retry");
  if (lease.status !== "planned" && lease.status !== "not-applied") {
    throw new Error(`side effect must be planned before attempt; received ${lease.status}`);
  }
  return transition(lease, "attempted", []);
}

export function markSideEffectConfirmed(
  lease: SideEffectLeaseV1,
  input: { evidenceRefs: readonly string[] },
): SideEffectLeaseV1 {
  if (lease.status !== "attempted") throw new Error("side effect must be attempted before confirmation");
  const refs = evidence(input.evidenceRefs);
  if (refs.length === 0) throw new Error("confirmed side effects require evidence");
  return transition(lease, "confirmed", refs);
}

export function recoverSideEffectLease(lease: SideEffectLeaseV1): SideEffectLeaseV1 {
  return lease.status === "attempted" ? transition(lease, "uncertain") : lease;
}

export function reconcileSideEffectLease(
  lease: SideEffectLeaseV1,
  outcome: "confirmed" | "not-applied",
  evidenceRefs: readonly string[] = [],
): SideEffectLeaseV1 {
  if (lease.status !== "uncertain") throw new Error("only uncertain side effects may be reconciled");
  const refs = evidence(evidenceRefs);
  if (outcome === "confirmed" && refs.length === 0) throw new Error("confirmed reconciliation requires evidence");
  return transition(lease, outcome, refs);
}

export function createSideEffectRequest(input: Omit<SideEffectRequestV1, "schemaVersion">): SideEffectRequestV1 {
  if (input.lease.status !== "attempted") throw new Error("side-effect request requires an attempted lease");
  if (input.effect !== "workspace" && input.effect !== "external") throw new Error("side-effect class is unsupported");
  if (!isAbsolute(input.workspaceRoot) || normalize(input.workspaceRoot) !== input.workspaceRoot) {
    throw new Error("side-effect workspace root must be normalized and absolute");
  }
  if (typeof input.instruction !== "string" || input.instruction.trim().length === 0) throw new Error("side-effect instruction is required");
  if (!Number.isInteger(input.timeoutMs) || input.timeoutMs < 1) throw new Error("side-effect timeout must be positive");
  const writes = input.allowedStateWrites.map((field) => categoricalToken(field, "side-effect state write"));
  if (new Set(writes).size !== writes.length) throw new Error("side-effect state writes must be unique");
  return Object.freeze({
    schemaVersion: 1,
    lease: input.lease,
    effect: input.effect,
    node: Object.freeze({
      id: categoricalToken(input.node.id, "side-effect node ID"),
      ref: categoricalToken(input.node.ref, "side-effect node ref"),
    }),
    workspaceRoot: input.workspaceRoot,
    workspaceScope: Object.freeze([...input.workspaceScope]),
    externalScope: Object.freeze([...input.externalScope]),
    instruction: input.instruction,
    state: jsonRecord(input.state),
    allowedStateWrites: Object.freeze(writes),
    requiredCapabilities: Object.freeze([...input.requiredCapabilities]),
    timeoutMs: input.timeoutMs,
  });
}

export function createSideEffectResult(input: Omit<SideEffectResultV1, "schemaVersion">): SideEffectResultV1 {
  if (!Number.isFinite(input.elapsedMs) || input.elapsedMs < 0) throw new Error("side-effect elapsed time must be non-negative");
  if (input.status === "completed" && input.failure !== undefined) throw new Error("completed side effects cannot include a failure");
  if (input.status !== "completed" && input.failure === undefined) throw new Error("non-completed side effects require a failure");
  const refs = evidence(input.evidenceRefs);
  return Object.freeze({
    schemaVersion: 1,
    status: input.status,
    elapsedMs: input.elapsedMs,
    evidenceRefs: Object.freeze([...refs]),
    transientStateWrites: jsonRecord(input.transientStateWrites),
    ...(input.failure ? { failure: Object.freeze({
      code: input.failure.code,
      message: String(input.failure.message).slice(0, 512),
      transient: input.failure.transient,
    }) } : {}),
  });
}
