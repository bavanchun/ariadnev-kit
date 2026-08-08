import type { CompiledGraphNodeV1, CompiledGraphV1 } from "../../graph/compile-graph.js";
import type { RunEventPayloadV1 } from "../events/event-types.js";
import type { RunStateV1 } from "../events/run-state.js";
import type { JsonValueV1 } from "../executors/executor.js";
import type { ApprovalGrantV1, ApprovalRequestV1, ApprovalValidationReasonV1 } from "../policy/approval-gate.js";
import { authorizeSideEffect } from "./side-effect-approval.js";
import { createEffectIntent, createEffectIntentStore } from "./effect-intent-store.js";
import {
  createSideEffectLease,
  createSideEffectRequest,
  markSideEffectAttempted,
  markSideEffectConfirmed,
  type SideEffectExecutorV1,
} from "./side-effect-lease.js";
import {
  captureWorkspaceSnapshot,
  createRollbackEvidence,
  diffWorkspaceSnapshots,
  pathsWithinWorkspaceScope,
  type RollbackEvidenceV1,
} from "./workspace-drift.js";

type CommonOutcome = Readonly<{
  approvalRequest: ApprovalRequestV1 | null;
  approvalFailure: ApprovalValidationReasonV1 | null;
  evidenceRefs: readonly string[];
  executorInvoked: boolean;
  elapsedMs: number;
  mutations: readonly string[];
  rollbackEvidence: readonly RollbackEvidenceV1[];
  violations: readonly string[];
}>;

export type SideEffectRunOutcomeV1 = CommonOutcome & (
  | { kind: "approval-required" }
  | { kind: "reconciliation-required"; reconciliation: { nodeId: string; attempt: number; idempotencyKey: string; status: "uncertain" | "confirmed" } }
  | { kind: "completed"; writes: Readonly<Record<string, JsonValueV1>> }
  | { kind: "retry"; delayMs: number }
  | { kind: "failed"; reason: "provider" | "validation" | "exhausted" }
  | { kind: "cancelled" }
  | { kind: "unsupported" }
);

const empty = (): CommonOutcome => ({
  approvalRequest: null,
  approvalFailure: null,
  evidenceRefs: [],
  executorInvoked: false,
  elapsedMs: 0,
  mutations: [],
  rollbackEvidence: [],
  violations: [],
});

function writesMatch(expected: readonly string[], writes: Readonly<Record<string, JsonValueV1>>): boolean {
  return JSON.stringify(Object.keys(writes).sort()) === JSON.stringify([...expected].sort());
}

export async function runSideEffect(input: {
  graph: CompiledGraphV1;
  node: CompiledGraphNodeV1;
  control: RunStateV1;
  runDirectory: string;
  workspaceRoot: string;
  workspaceScope: readonly string[];
  externalScope: readonly string[];
  instruction: string;
  state: Readonly<Record<string, JsonValueV1>>;
  executor?: SideEffectExecutorV1;
  approval?: ApprovalGrantV1;
  reconciliation?: Readonly<{
    idempotencyKey: string;
    outcome: "committed" | "not-applied";
    evidenceRefs: readonly string[];
    transientStateWrites: Readonly<Record<string, JsonValueV1>>;
  }>;
  signal: AbortSignal;
  persist(payload: RunEventPayloadV1): RunStateV1;
}): Promise<SideEffectRunOutcomeV1> {
  const common = empty();
  if (!input.executor) return Object.freeze({ ...common, kind: "unsupported" });
  const intentStore = createEffectIntentStore({ runDirectory: input.runDirectory });
  const approvalScope = input.node.authority.effect === "workspace" ? input.workspaceScope : input.externalScope;
  const durable = Object.entries(input.control.effects).find(([, effect]) => (
    effect.nodeId === input.node.id && effect.attempt === input.control.attempt && effect.status !== "not-applied"
  ));
  if (durable) {
    const [idempotencyKey, effect] = durable;
    const reconciliation = Object.freeze({
      nodeId: input.node.id,
      attempt: input.control.attempt,
      idempotencyKey,
      status: effect.status === "committed" ? "confirmed" as const : "uncertain" as const,
    });
    const intent = intentStore.read(idempotencyKey);
    if (!intent || intent.runId !== input.control.runId || intent.graphDigest !== input.control.graph.digest
      || intent.nodeId !== input.node.id || intent.attempt !== input.control.attempt
      || intent.effect !== input.node.authority.effect) {
      return Object.freeze({
        ...common,
        kind: "reconciliation-required",
        reconciliation,
        violations: [`reconciliation for node ${input.node.id} lacks a matching durable effect intent`],
      });
    }
    const authorization = authorizeSideEffect({
      graph: input.graph,
      node: input.node,
      runId: input.control.runId,
      graphDigest: input.control.graph.digest,
      runDirectory: input.runDirectory,
      workspaceRoot: input.workspaceRoot,
      approvalScope,
      before: intent.before,
      instruction: input.instruction,
      state: input.state,
      allowWorkspaceDrift: true,
      ...(input.approval ? { approval: input.approval } : {}),
    });
    if (!authorization.granted || intent.actionDigest !== authorization.request.actionDigest) return Object.freeze({
      ...common,
      kind: "approval-required",
      approvalRequest: authorization.request,
      approvalFailure: authorization.failure ?? "action-drift",
    });
    const expectedLease = createSideEffectLease({
      runId: input.control.runId,
      graphDigest: input.control.graph.digest,
      nodeId: input.node.id,
      attempt: input.control.attempt,
      declaredKey: input.node.authority.idempotencyKey!,
      actionDigest: authorization.request.actionDigest,
      scopeDigest: authorization.request.scopeDigest,
    });
    if (expectedLease.idempotencyKey !== idempotencyKey) return Object.freeze({
      ...common,
      kind: "reconciliation-required",
      reconciliation,
      approvalRequest: authorization.request,
      violations: [`reconciliation for node ${input.node.id} does not match its recorded effect identity`],
    });
    const current = captureWorkspaceSnapshot(input.workspaceRoot);
    const drift = diffWorkspaceSnapshots(intent.before, current);
    const rollbackEvidence = drift.drifted ? [createRollbackEvidence(intent.before, current)] : [];
    const durableCommon: CommonOutcome = {
      ...common,
      approvalRequest: authorization.request,
      mutations: drift.changedPaths,
      rollbackEvidence,
    };
    const scopeViolation = input.node.authority.effect === "workspace"
      ? !pathsWithinWorkspaceScope(drift.changedPaths, intent.workspaceScope)
      : drift.drifted;
    if (scopeViolation) return Object.freeze({
      ...durableCommon,
      kind: "reconciliation-required",
      reconciliation,
      violations: [`reconciliation for node ${input.node.id} observed workspace drift outside its approved scope`],
    });
    if (!input.reconciliation || input.reconciliation.idempotencyKey !== idempotencyKey) {
      return Object.freeze({ ...durableCommon, kind: "reconciliation-required", reconciliation });
    }
    if (input.reconciliation.evidenceRefs.length === 0) return Object.freeze({
      ...durableCommon,
      kind: "reconciliation-required",
      reconciliation,
      violations: [`reconciliation for node ${input.node.id} lacks required evidence`],
    });
    if (input.reconciliation.outcome === "committed") {
      if (!writesMatch(input.node.state.writes, input.reconciliation.transientStateWrites)) {
        return Object.freeze({
          ...durableCommon,
          kind: "reconciliation-required",
          reconciliation,
          violations: [`reconciliation for node ${input.node.id} lacks required evidence or state writes`],
        });
      }
      if (effect.status === "prepared") input.persist({
        type: "effect-reconciled", nodeId: input.node.id, attempt: input.control.attempt, idempotencyKey, outcome: "committed",
      });
      return Object.freeze({
        ...durableCommon,
        kind: "completed",
        writes: input.reconciliation.transientStateWrites,
        evidenceRefs: Object.freeze([...input.reconciliation.evidenceRefs]),
      });
    }
    if (effect.status === "committed") return Object.freeze({
      ...durableCommon,
      kind: "reconciliation-required",
      reconciliation,
      violations: [`confirmed effect ${idempotencyKey} cannot reconcile as not-applied`],
    });
    if (drift.drifted) return Object.freeze({
      ...durableCommon,
      kind: "reconciliation-required",
      reconciliation,
      violations: [`effect ${idempotencyKey} cannot reconcile as not-applied after workspace drift`],
    });
    input.persist({ type: "effect-reconciled", nodeId: input.node.id, attempt: input.control.attempt, idempotencyKey, outcome: "not-applied" });
    if (input.control.attempt < input.node.retry.maxAttempts && input.node.retry.on.includes("conflict")) {
      input.persist({ type: "node-retry-scheduled", nodeId: input.node.id, attempt: input.control.attempt, reason: "conflict" });
      return Object.freeze({ ...durableCommon, kind: "retry", delayMs: input.node.retry.backoffMs, evidenceRefs: input.reconciliation.evidenceRefs });
    }
    return Object.freeze({ ...durableCommon, kind: "failed", reason: "exhausted", evidenceRefs: input.reconciliation.evidenceRefs });
  }

  const before = captureWorkspaceSnapshot(input.workspaceRoot);
  const authorization = authorizeSideEffect({
    graph: input.graph,
    node: input.node,
    runId: input.control.runId,
    graphDigest: input.control.graph.digest,
    runDirectory: input.runDirectory,
    workspaceRoot: input.workspaceRoot,
    approvalScope,
    before,
    instruction: input.instruction,
    state: input.state,
    ...(input.approval ? { approval: input.approval } : {}),
  });
  if (!authorization.granted) return Object.freeze({
    ...common,
    kind: "approval-required",
    approvalRequest: authorization.request,
    approvalFailure: authorization.failure,
  });

  const lease = createSideEffectLease({
    runId: input.control.runId,
    graphDigest: input.control.graph.digest,
    nodeId: input.node.id,
    attempt: input.control.attempt,
    declaredKey: input.node.authority.idempotencyKey!,
    actionDigest: authorization.request.actionDigest,
    scopeDigest: authorization.request.scopeDigest,
  });
  intentStore.record(createEffectIntent({
    runId: input.control.runId,
    graphDigest: input.control.graph.digest,
    nodeId: input.node.id,
    attempt: input.control.attempt,
    idempotencyKey: lease.idempotencyKey,
    actionDigest: lease.actionDigest,
    approvalDigest: authorization.approvalDigest!,
    effect: input.node.authority.effect as "workspace" | "external",
    workspaceScope: input.workspaceScope,
    externalScope: input.externalScope,
    before,
  }));
  input.persist({ type: "effect-prepared", nodeId: input.node.id, attempt: input.control.attempt, idempotencyKey: lease.idempotencyKey });
  const attempted = markSideEffectAttempted(lease);
  const result = await input.executor.execute(createSideEffectRequest({
    lease: attempted,
    effect: input.node.authority.effect as "workspace" | "external",
    node: { id: input.node.id, ref: input.node.handler.ref },
    workspaceRoot: input.workspaceRoot,
    workspaceScope: input.workspaceScope,
    externalScope: input.externalScope,
    instruction: input.instruction,
    state: input.state,
    allowedStateWrites: input.node.state.writes,
    requiredCapabilities: input.node.authority.capabilities,
    timeoutMs: input.node.timeoutMs,
  }), input.signal);
  const after = captureWorkspaceSnapshot(input.workspaceRoot);
  const drift = diffWorkspaceSnapshots(before, after);
  const rollback = drift.drifted ? [createRollbackEvidence(before, after)] : [];
  const output = {
    ...common,
    approvalRequest: authorization.request,
    evidenceRefs: result.evidenceRefs,
    executorInvoked: true,
    elapsedMs: result.elapsedMs,
    mutations: drift.changedPaths,
    rollbackEvidence: rollback,
  };
  const scoped = input.node.authority.effect !== "workspace"
    || pathsWithinWorkspaceScope(drift.changedPaths, input.workspaceScope);
  if (result.status === "completed" && scoped && writesMatch(input.node.state.writes, result.transientStateWrites)) {
    markSideEffectConfirmed(attempted, { evidenceRefs: result.evidenceRefs });
    input.persist({ type: "effect-committed", nodeId: input.node.id, attempt: input.control.attempt, idempotencyKey: lease.idempotencyKey });
    return Object.freeze({ ...output, kind: "completed", writes: result.transientStateWrites });
  }
  if (input.node.authority.effect === "workspace" && !drift.drifted && result.status !== "completed") {
    input.persist({ type: "effect-reconciled", nodeId: input.node.id, attempt: input.control.attempt, idempotencyKey: lease.idempotencyKey, outcome: "not-applied" });
    const retry = result.status === "timed-out" ? "timeout"
      : result.failure?.code === "conflict" ? "conflict"
        : result.failure?.transient ? "transient" : null;
    if (retry && input.control.attempt < input.node.retry.maxAttempts && input.node.retry.on.includes(retry)) {
      input.persist({ type: "node-retry-scheduled", nodeId: input.node.id, attempt: input.control.attempt, reason: retry });
      return Object.freeze({ ...output, kind: "retry", delayMs: input.node.retry.backoffMs });
    }
    if (result.status === "cancelled") return Object.freeze({ ...output, kind: "cancelled" });
    return Object.freeze({ ...output, kind: "failed", reason: result.failure?.transient ? "exhausted" : "provider" });
  }
  const violations = !scoped
    ? [`node ${input.node.id} changed paths outside its approved workspace scope`]
    : [`node ${input.node.id} returned invalid effect state writes or evidence`];
  return Object.freeze({
    ...output,
    kind: "reconciliation-required",
    reconciliation: { nodeId: input.node.id, attempt: input.control.attempt, idempotencyKey: lease.idempotencyKey, status: "uncertain" as const },
    violations,
  });
}
