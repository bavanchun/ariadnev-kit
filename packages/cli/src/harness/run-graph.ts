import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync, readlinkSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import { performance } from "node:perf_hooks";
import { scoreTrajectoryConformance, type TrajectoryConformanceReportV1 } from "../eval/trajectory-conformance.js";
import type { CompiledGraphNodeV1, CompiledGraphV1 } from "../graph/compile-graph.js";
import type { GraphEdgeV1 } from "../graph/graph-types.js";
import { resumeRun, type CheckpointStore } from "./events/checkpoint-store.js";
import { type EventStore } from "./events/event-store.js";
import { sameRunContext, validateRunEventContext, type RunEventContextV1, type RunEventPayloadV1 } from "./events/event-types.js";
import type { RunStateV1 } from "./events/run-state.js";
import {
  createExecutorRequest,
  type ExecutorCapabilityV1,
  type ExecutorFailureV1,
  type ExecutorProbeV1,
  type ExecutorResultV1,
  type GraphExecutorV1,
  type JsonValueV1,
} from "./executors/executor.js";
import { createShadowRun } from "./shadow/shadow-run.js";
import type { ShadowEventV1 } from "./shadow/shadow-events.js";

export const GRAPH_RUNNER_VERSION = "1.0.0";
const NODE_ATTEMPT_VERSION = "1.0.0";
const IDEMPOTENCY_VERSION = "1.0.0";
const FORBIDDEN_READ_ONLY_CAPABILITIES = new Set(["workspace:write", "external:mutate", "publish", "delete"]);

export type GraphRunStatusV1 = "completed" | "failed" | "cancelled" | "policy-denied" | "unsupported";

export type GraphRunMetricsV1 = Readonly<{
  nodesExecuted: number;
  retries: number;
  inputTokens: number | null;
  cachedInputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  elapsedMs: number;
  providerElapsedMs: number;
  orchestrationOverheadMs: number;
}>;

export type GraphRunResultV1 = Readonly<{
  schemaVersion: 1;
  status: GraphRunStatusV1;
  state: Readonly<Record<string, JsonValueV1>>;
  durableState: RunStateV1 | null;
  evidenceRefs: readonly string[];
  metrics: GraphRunMetricsV1;
  events: readonly ShadowEventV1[];
  trajectory: TrajectoryConformanceReportV1;
  workspaceMutations: readonly string[];
  policyViolations: readonly string[];
  executor: ExecutorProbeV1 | null;
  executorFailure: ExecutorFailureV1 | null;
  resume: Readonly<{
    resumed: boolean;
    startingNodeId: string;
    recoveredRunningAttempt: boolean;
  }>;
}>;

export interface RunGraphInputV1 {
  graph: CompiledGraphV1;
  executor: GraphExecutorV1;
  eventStore: EventStore;
  checkpointStore: CheckpointStore;
  workspaceRoot: string;
  instruction: string;
  initialState?: Readonly<Record<string, JsonValueV1>>;
  signal?: AbortSignal;
}

type TokenAccumulator = {
  input: number;
  cached: number;
  output: number;
  reasoning: number;
  inputComplete: boolean;
  cachedComplete: boolean;
  outputComplete: boolean;
  reasoningComplete: boolean;
};

export function createGraphRunContext(input: {
  graph: CompiledGraphV1;
  runId: string;
  runnerVersion?: string;
}): RunEventContextV1 {
  const digest = createHash("sha256").update(JSON.stringify(input.graph)).digest("hex");
  return validateRunEventContext({
    runId: input.runId,
    graph: { id: input.graph.id, digest },
    versions: {
      graph: input.graph.versions.graph,
      runner: input.runnerVersion ?? GRAPH_RUNNER_VERSION,
      nodeAttempt: NODE_ATTEMPT_VERSION,
      idempotency: IDEMPOTENCY_VERSION,
    },
  });
}

function policyViolations(graph: CompiledGraphV1): string[] {
  const violations: string[] = [];
  for (const node of graph.nodes) {
    for (const capability of node.authority.capabilities) {
      if (FORBIDDEN_READ_ONLY_CAPABILITIES.has(capability)) violations.push(`node ${node.id} requires ${capability}`);
    }
    if (node.authority.effect !== "none") violations.push(`node ${node.id} declares ${node.authority.effect} effects`);
  }
  return [...new Set(violations)].sort();
}

function requiredCapabilities(graph: CompiledGraphV1): ExecutorCapabilityV1[] {
  const required = new Set<ExecutorCapabilityV1>(["execution:cancel", "execution:structured-output"]);
  for (const node of graph.nodes) {
    for (const capability of node.authority.capabilities) required.add(capability);
    if (node.authority.approval === "required") required.add("graph:approval");
    if (node.retry.maxAttempts > 1) required.add("graph:retry");
    if (node.routing) required.add("graph:routing");
  }
  if (graph.edges.some((edge) => edge.type === "retry")) required.add("graph:retry");
  if (graph.edges.some((edge) => edge.type === "cancel")) required.add("graph:interrupt");
  return [...required].sort();
}

function requestCapabilities(node: CompiledGraphNodeV1): ExecutorCapabilityV1[] {
  const capabilities = new Set<ExecutorCapabilityV1>([
    ...node.authority.capabilities,
    "execution:cancel",
    "execution:structured-output",
  ]);
  if (node.retry.maxAttempts > 1) capabilities.add("graph:retry");
  if (node.routing) capabilities.add("graph:routing");
  return [...capabilities].sort();
}

function workspaceSnapshot(root: string): Map<string, string> {
  if (!isAbsolute(root)) throw new Error("workspace root must be absolute");
  const snapshot = new Map<string, string>();
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const absolute = join(directory, entry.name);
      const path = relative(root, absolute).split("\\").join("/");
      const stat = lstatSync(absolute);
      if (stat.isDirectory() && !stat.isSymbolicLink()) {
        snapshot.set(`${path}/`, `directory:${stat.mode & 0o777}`);
        visit(absolute);
      } else if (stat.isFile()) {
        const digest = createHash("sha256").update(readFileSync(absolute)).digest("hex");
        snapshot.set(path, `file:${stat.mode & 0o777}:${stat.size}:${digest}`);
      } else if (stat.isSymbolicLink()) {
        snapshot.set(path, `symlink:${readlinkSync(absolute)}`);
      } else {
        snapshot.set(path, `special:${stat.mode}`);
      }
    }
  };
  visit(root);
  return snapshot;
}

function snapshotDifference(before: Map<string, string>, after: Map<string, string>): string[] {
  const paths = new Set([...before.keys(), ...after.keys()]);
  return [...paths].filter((path) => before.get(path) !== after.get(path)).sort();
}

function normalEdge(graph: CompiledGraphV1, node: CompiledGraphNodeV1, state: Readonly<Record<string, JsonValueV1>>): GraphEdgeV1 | undefined {
  const edges = graph.edges.filter((edge) => edge.from === node.id);
  const conditional = edges.find((edge) => edge.type === "conditional" && conditionMatches(edge, state));
  return conditional ?? edges.find((edge) => ["success", "handoff", "approval"].includes(edge.type));
}

function conditionMatches(edge: GraphEdgeV1, state: Readonly<Record<string, JsonValueV1>>): boolean {
  if (!edge.condition) return false;
  const equal = state[edge.condition.field] === edge.condition.value;
  return edge.condition.operator === "equals" ? equal : !equal;
}

function outcomeEdge(graph: CompiledGraphV1, nodeId: string, type: "failure" | "cancel" | "retry"): GraphEdgeV1 | undefined {
  return graph.edges.find((edge) => edge.from === nodeId && edge.type === type);
}

function terminalForStatus(graph: CompiledGraphV1, status: GraphRunStatusV1): string {
  const ref = status === "completed" ? "success" : status === "cancelled" ? "cancelled" : "failure";
  return graph.nodes.find((node) => node.type === "terminal" && node.handler.ref === ref)?.handler.ref ?? ref;
}

function retryReason(result: ExecutorResultV1): "timeout" | "transient" | null {
  if (result.status === "timed-out") return "timeout";
  return result.failure?.transient ? "transient" : null;
}

function eventFailureReason(result: ExecutorResultV1): "provider" | "validation" | "exhausted" {
  if (result.failure?.code === "malformed-output" || result.failure?.code === "output-limit") return "validation";
  if (result.failure?.transient) return "exhausted";
  return "provider";
}

function addUsage(tokens: TokenAccumulator, result: ExecutorResultV1): void {
  const fields = [
    ["input", "inputComplete", result.usage.inputTokens],
    ["cached", "cachedComplete", result.usage.cachedInputTokens],
    ["output", "outputComplete", result.usage.outputTokens],
    ["reasoning", "reasoningComplete", result.usage.reasoningTokens],
  ] as const;
  for (const [total, complete, value] of fields) {
    if (value === null) tokens[complete] = false;
    else tokens[total] += value;
  }
}

function abortedDelay(durationMs: number, signal: AbortSignal): Promise<boolean> {
  if (durationMs <= 0) return Promise.resolve(signal.aborted);
  if (signal.aborted) return Promise.resolve(true);
  return new Promise((resolveDelay) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolveDelay(false);
    }, durationMs);
    const onAbort = () => {
      clearTimeout(timer);
      resolveDelay(true);
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function validateInitialState(graph: CompiledGraphV1, state: Readonly<Record<string, JsonValueV1>>): Record<string, JsonValueV1> {
  const fields = new Set(graph.state.fields.map((field) => field.name));
  for (const key of Object.keys(state)) if (!fields.has(key)) throw new Error(`initial state field ${key} is not declared by the graph`);
  return { ...state };
}

export async function runGraph(input: RunGraphInputV1): Promise<GraphRunResultV1> {
  const startedAt = performance.now();
  const signal = input.signal ?? new AbortController().signal;
  const expectedContext = createGraphRunContext({ graph: input.graph, runId: input.eventStore.context.runId });
  if (!sameRunContext(expectedContext, input.eventStore.context)) throw new Error("event store context does not match the compiled graph runner contract");
  const nodes = new Map(input.graph.nodes.map((node) => [node.id, node]));
  const state = validateInitialState(input.graph, input.initialState ?? {});
  const mutations = new Set<string>();
  const evidence = new Set<string>();
  const violations = policyViolations(input.graph);
  const shadow = createShadowRun({ graph: input.graph, runId: input.eventStore.context.runId, sink: { append: () => undefined } });
  const tokens: TokenAccumulator = {
    input: 0, cached: 0, output: 0, reasoning: 0,
    inputComplete: true, cachedComplete: true, outputComplete: true, reasoningComplete: true,
  };
  let providerElapsedMs = 0;
  let nodesExecuted = 0;
  let retries = 0;
  let executorProbe: ExecutorProbeV1 | null = null;
  let executorFailure: ExecutorFailureV1 | null = null;
  let control = input.eventStore.state();
  const startingNodeId = control?.currentNodeId ?? input.graph.entry;
  let resumed = control !== null;
  let recoveredRunningAttempt = false;
  let routedFailureReason: "provider" | "validation" | "exhausted" = "provider";

  const persist = (payload: RunEventPayloadV1): RunStateV1 => {
    input.eventStore.append(payload);
    const current = input.eventStore.state();
    if (!current) throw new Error("execution event append did not produce state");
    input.checkpointStore.write(current);
    control = current;
    return current;
  };

  const finish = (status: GraphRunStatusV1, expectedTerminal = terminalForStatus(input.graph, status)): GraphRunResultV1 => {
    const events = shadow.finish();
    const elapsedMs = performance.now() - startedAt;
    const metrics = Object.freeze({
      nodesExecuted,
      retries,
      inputTokens: tokens.inputComplete ? tokens.input : null,
      cachedInputTokens: tokens.cachedComplete ? tokens.cached : null,
      outputTokens: tokens.outputComplete ? tokens.output : null,
      reasoningTokens: tokens.reasoningComplete ? tokens.reasoning : null,
      elapsedMs,
      providerElapsedMs,
      orchestrationOverheadMs: Math.max(0, elapsedMs - providerElapsedMs),
    });
    return Object.freeze({
      schemaVersion: 1,
      status,
      state: Object.freeze({ ...state }),
      durableState: control,
      evidenceRefs: Object.freeze([...evidence].sort()),
      metrics,
      events,
      trajectory: scoreTrajectoryConformance({ graph: input.graph, events, expectedTerminal }),
      workspaceMutations: Object.freeze([...mutations].sort()),
      policyViolations: Object.freeze([...violations]),
      executor: executorProbe,
      executorFailure,
      resume: Object.freeze({ resumed, startingNodeId, recoveredRunningAttempt }),
    });
  };

  if (violations.length > 0) return finish("policy-denied");
  executorProbe = input.executor.probe(requiredCapabilities(input.graph));
  if (executorProbe.status === "unsupported") return finish("unsupported");

  if (control === null) {
    persist({ type: "run-created", entryNodeId: input.graph.entry });
    resumed = false;
  } else {
    const recovered = resumeRun({ eventStore: input.eventStore, checkpointStore: input.checkpointStore, current: expectedContext });
    control = recovered.state;
    if (control.status === "completed") return finish("completed", "success");
    if (control.status === "cancelled") return finish("cancelled", "cancelled");
    if (control.status === "failed") return finish("failed", "failure");
    if (control.status === "running") {
      persist({ type: "node-retry-scheduled", nodeId: control.currentNodeId, attempt: control.attempt, reason: "transient" });
      recoveredRunningAttempt = true;
      retries += 1;
    } else if (control.status === "waiting") {
      persist({ type: "node-resumed", nodeId: control.currentNodeId, attempt: control.attempt });
    }
  }

  while (control && !["completed", "failed", "cancelled"].includes(control.status)) {
    const node = nodes.get(control.currentNodeId);
    if (!node) throw new Error(`compiled graph node ${control.currentNodeId} is missing`);
    if (control.status === "pending" || control.status === "retrying") {
      const nextAttempt = control.status === "pending" ? 1 : control.attempt + 1;
      persist({ type: "node-started", nodeId: node.id, attempt: nextAttempt });
    }
    if (control.status !== "running") throw new Error(`runner cannot execute node ${node.id} from state ${control.status}`);
    const elapsed = performance.now() - startedAt;
    shadow.record({ kind: "node-entered", nodeId: node.id, source: "harness", adapter: `${executorProbe.provider}-v1`, elapsedMs: elapsed });

    if (node.type === "terminal") {
      if (node.handler.ref === "success") {
        persist({ type: "run-completed", nodeId: node.id, attempt: control.attempt });
        shadow.record({ kind: "terminal-reached", nodeId: node.id, source: "harness", adapter: `${executorProbe.provider}-v1`, elapsedMs: performance.now() - startedAt });
        return finish("completed", node.handler.ref);
      }
      if (node.handler.ref === "cancelled") {
        persist({ type: "run-cancelled", nodeId: node.id, attempt: control.attempt, reason: "user" });
        shadow.record({ kind: "terminal-reached", nodeId: node.id, source: "harness", adapter: `${executorProbe.provider}-v1`, elapsedMs: performance.now() - startedAt });
        return finish("cancelled", node.handler.ref);
      }
      persist({ type: "run-failed", nodeId: node.id, attempt: control.attempt, reason: routedFailureReason });
      shadow.record({ kind: "terminal-reached", nodeId: node.id, source: "harness", adapter: `${executorProbe.provider}-v1`, elapsedMs: performance.now() - startedAt });
      return finish("failed", node.handler.ref);
    }

    const before = workspaceSnapshot(input.workspaceRoot);
    const result = await input.executor.execute(createExecutorRequest({
      runId: input.eventStore.context.runId,
      attempt: control.attempt,
      node: { id: node.id, kind: node.type, ref: node.handler.ref },
      workspaceRoot: input.workspaceRoot,
      instruction: input.instruction,
      state,
      allowedStateWrites: node.state.writes,
      requiredCapabilities: requestCapabilities(node),
      timeoutMs: node.timeoutMs,
      policy: { mode: "read-only" },
    }), signal);
    executorFailure = result.failure ?? null;
    nodesExecuted += 1;
    providerElapsedMs += result.elapsedMs;
    addUsage(tokens, result);
    for (const ref of result.evidenceRefs) evidence.add(ref);
    const changed = snapshotDifference(before, workspaceSnapshot(input.workspaceRoot));
    for (const path of changed) mutations.add(path);
    if (changed.length > 0) {
      violations.push(`node ${node.id} mutated a read-only workspace`);
      shadow.record({ kind: "node-completed", nodeId: node.id, outcome: "failure", source: "harness", adapter: `${executorProbe.provider}-v1`, elapsedMs: performance.now() - startedAt });
      persist({ type: "run-failed", nodeId: node.id, attempt: control.attempt, reason: "policy" });
      return finish("policy-denied");
    }

    if (result.status === "completed") {
      const writes = Object.keys(result.transientStateWrites).sort();
      const expectedWrites = [...node.state.writes].sort();
      if (JSON.stringify(writes) !== JSON.stringify(expectedWrites)) {
        routedFailureReason = "validation";
      } else {
        Object.assign(state, result.transientStateWrites);
        const edge = normalEdge(input.graph, node, state);
        if (!edge) {
          shadow.record({ kind: "node-completed", nodeId: node.id, outcome: "failure", source: "harness", adapter: `${executorProbe.provider}-v1`, elapsedMs: performance.now() - startedAt });
          persist({ type: "run-failed", nodeId: node.id, attempt: control.attempt, reason: "validation" });
          return finish("failed");
        }
        shadow.record({ kind: "node-completed", nodeId: node.id, outcome: "success", source: "harness", adapter: `${executorProbe.provider}-v1`, elapsedMs: performance.now() - startedAt });
        for (const proofId of node.proof.produces) {
          shadow.record({ kind: "proof-recorded", nodeId: node.id, proofId, source: "harness", adapter: `${executorProbe.provider}-v1`, elapsedMs: performance.now() - startedAt });
        }
        shadow.record({ kind: "edge-selected", edgeId: edge.id, source: "harness", adapter: `${executorProbe.provider}-v1`, elapsedMs: performance.now() - startedAt });
        persist({ type: "node-completed", nodeId: node.id, attempt: control.attempt, nextNodeId: edge.to });
        continue;
      }
    }

    if (result.status === "cancelled") {
      const edge = outcomeEdge(input.graph, node.id, "cancel");
      if (!edge) {
        persist({ type: "run-cancelled", nodeId: node.id, attempt: control.attempt, reason: "user" });
        return finish("cancelled");
      }
      shadow.record({ kind: "node-completed", nodeId: node.id, outcome: "cancelled", source: "harness", adapter: `${executorProbe.provider}-v1`, elapsedMs: performance.now() - startedAt });
      shadow.record({ kind: "edge-selected", edgeId: edge.id, source: "harness", adapter: `${executorProbe.provider}-v1`, elapsedMs: performance.now() - startedAt });
      persist({ type: "node-completed", nodeId: node.id, attempt: control.attempt, nextNodeId: edge.to });
      continue;
    }

    const retry = retryReason(result);
    if (retry && control.attempt < node.retry.maxAttempts && node.retry.on.includes(retry)) {
      const edge = outcomeEdge(input.graph, node.id, "retry");
      if (!edge) throw new Error(`compiled retry node ${node.id} has no retry edge`);
      shadow.record({ kind: "node-completed", nodeId: node.id, outcome: "retry", source: "harness", adapter: `${executorProbe.provider}-v1`, elapsedMs: performance.now() - startedAt });
      shadow.record({ kind: "edge-selected", edgeId: edge.id, source: "harness", adapter: `${executorProbe.provider}-v1`, elapsedMs: performance.now() - startedAt });
      persist({ type: "node-retry-scheduled", nodeId: node.id, attempt: control.attempt, reason: retry });
      retries += 1;
      if (await abortedDelay(node.retry.backoffMs, signal)) {
        persist({ type: "run-cancelled", nodeId: node.id, attempt: control.attempt, reason: "user" });
        return finish("cancelled");
      }
      continue;
    }

    routedFailureReason = result.status === "completed" ? "validation" : eventFailureReason(result);
    const edge = outcomeEdge(input.graph, node.id, "failure");
    shadow.record({ kind: "node-completed", nodeId: node.id, outcome: "failure", source: "harness", adapter: `${executorProbe.provider}-v1`, elapsedMs: performance.now() - startedAt });
    if (!edge) {
      persist({ type: "run-failed", nodeId: node.id, attempt: control.attempt, reason: routedFailureReason });
      return finish("failed");
    }
    shadow.record({ kind: "edge-selected", edgeId: edge.id, source: "harness", adapter: `${executorProbe.provider}-v1`, elapsedMs: performance.now() - startedAt });
    persist({ type: "node-completed", nodeId: node.id, attempt: control.attempt, nextNodeId: edge.to });
  }
  throw new Error("runner exited without a terminal state");
}
