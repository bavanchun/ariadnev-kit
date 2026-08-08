import { readFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compileGraph, PORTABLE_GRAPH_CAPABILITY_CONTRACT } from "../src/graph/compile-graph.js";
import { cloneGraph, registryFor, workflowFixture } from "../src/graph/graph-test-fixtures.js";
import { createCheckpointStore } from "../src/harness/events/checkpoint-store.js";
import { createEventStore } from "../src/harness/events/event-store.js";
import { createSideEffectResult, type SideEffectExecutorV1, type SideEffectRequestV1 } from "../src/harness/effects/side-effect-lease.js";
import {
  createExecutorProbe,
  createExecutorResult,
  type ExecutorRequestV1,
  type GraphExecutorV1,
  type JsonValueV1,
} from "../src/harness/executors/executor.js";
import { grantApproval } from "../src/harness/policy/approval-gate.js";
import { createGraphRunContext, runGraph } from "../src/harness/run-graph.js";

const WARMUPS = 3;
const REPEATS = 30;
const available = [
  "state:read", "state:write", "workspace:read", "process:execute", "graph:interrupt",
  "graph:retry", "graph:routing", "execution:cancel", "execution:structured-output",
] as const;
const probe = createExecutorProbe({
  provider: "benchmark",
  adapterVersion: "1.0.0",
  runtimeVersion: "1.0.0",
  model: "deterministic-fixture",
  status: "supported",
  available,
  missing: [],
});

class Provider implements GraphExecutorV1 {
  readonly provider = "benchmark";
  probe() { return probe; }
  async execute(request: ExecutorRequestV1) {
    const values: Record<string, JsonValueV1> = {
      request: request.instruction,
      proposal: { paths: ["src/router.ts"], replacement: "v2" },
      decision: "approved",
      approval: { decision: "approved" },
      "test-results": { passed: true },
      review: { passed: true },
    };
    return createExecutorResult({
      status: "completed",
      probe,
      elapsedMs: 0,
      evidenceRefs: ["src/router.ts"],
      usage: { inputTokens: 10, cachedInputTokens: 5, outputTokens: 4, reasoningTokens: 1 },
      transientStateWrites: Object.fromEntries(request.allowedStateWrites.map((field) => [field, values[field]])),
    });
  }
}

class Effect implements SideEffectExecutorV1 {
  readonly effects = ["workspace"] as const;
  calls = 0;
  async execute(request: SideEffectRequestV1) {
    this.calls += 1;
    writeFileSync(join(request.workspaceRoot, "src", "router.ts"), "export const route = 'v2';\n");
    return createSideEffectResult({
      status: "completed",
      elapsedMs: 0,
      evidenceRefs: ["src/router.ts"],
      transientStateWrites: { change: { paths: ["src/router.ts"] } },
    });
  }
}

function percentile(values: readonly number[], quantile: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor((sorted.length - 1) * quantile)] ?? 0;
}

function distribution(values: readonly number[]) {
  return {
    samples: values.length,
    p50: Number(percentile(values, 0.5).toFixed(4)),
    p95: Number(percentile(values, 0.95).toFixed(4)),
    max: Number(Math.max(...values).toFixed(4)),
  };
}

const source = cloneGraph(workflowFixture("safe-change-delivery"));
source.nodes.find((node) => node.id === "apply")!.retry.backoffMs = 0;
const compiled = compileGraph(source, registryFor([source]), PORTABLE_GRAPH_CAPABILITY_CONTRACT);
if (!compiled.ok) throw new Error(JSON.stringify(compiled.findings));

async function sample(index: number) {
  const root = mkdtempSync(join(tmpdir(), "vcskill-safe-change-benchmark-"));
  try {
    const workspaceRoot = join(root, "workspace");
    const runRoot = join(root, "runs");
    mkdirSync(join(workspaceRoot, "src"), { recursive: true });
    writeFileSync(join(workspaceRoot, "src", "router.ts"), "export const route = 'v1';\n");
    const context = createGraphRunContext({ graph: compiled.graph, runId: `run.safe-benchmark-${index}` });
    const eventStore = createEventStore({ root: runRoot, context });
    const checkpointStore = createCheckpointStore({ root: runRoot, runId: context.runId });
    const effect = new Effect();
    const base = {
      graph: compiled.graph,
      executor: new Provider(),
      sideEffectExecutor: effect,
      eventStore,
      checkpointStore,
      workspaceRoot,
      workspaceScope: ["src/router.ts"],
      instruction: "Apply the bounded router fix.",
      policy: { mode: "workspace-change", grants: ["workspace:write"] } as const,
    };
    const waiting = await runGraph(base);
    if (waiting.status !== "approval-required" || !waiting.approvalRequest) throw new Error("benchmark did not reach approval");
    const approval = grantApproval(waiting.approvalRequest, {
      approvedAt: "2026-08-08T10:00:00.000Z",
      expiresAt: "2099-08-08T11:00:00.000Z",
    });
    const completed = await runGraph({ ...base, initialState: waiting.state, approval });
    if (completed.status !== "completed" || effect.calls !== 1 || completed.policyViolations.length > 0
      || completed.workspaceMutations.join() !== "src/router.ts") {
      throw new Error("safe-change benchmark missed its task or safety floor");
    }
    const nodes = waiting.metrics.nodesExecuted + completed.metrics.nodesExecuted;
    const overhead = waiting.metrics.orchestrationOverheadMs + completed.metrics.orchestrationOverheadMs;
    return {
      overheadMs: overhead,
      meanNodeMs: overhead / nodes,
      tokens: (waiting.metrics.inputTokens ?? 0) + (waiting.metrics.outputTokens ?? 0)
        + (completed.metrics.inputTokens ?? 0) + (completed.metrics.outputTokens ?? 0),
      retries: waiting.metrics.retries + completed.metrics.retries,
      interventions: 1,
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

for (let index = 0; index < WARMUPS; index += 1) await sample(index);
const samples = [];
for (let index = 0; index < REPEATS; index += 1) samples.push(await sample(WARMUPS + index));
const baseline = JSON.parse(readFileSync(join(process.cwd(), "evals", "baselines", "v0.10.0", "summary.json"), "utf8"))
  .samples.find((item: { cellId: string; variant: string }) => item.cellId === "golden.safe-feature-delivery:default" && item.variant === "vcskill");
const output = {
  schemaVersion: 1,
  workload: { warmups: WARMUPS, repeats: REPEATS, graph: compiled.graph.id, provider: "deterministic-fixture" },
  current: {
    taskSuccessRate: 1,
    unauthorizedEffects: 0,
    duplicateEffects: 0,
    orchestrationWholeRunMs: distribution(samples.map((item) => item.overheadMs)),
    orchestrationMeanNodeMs: distribution(samples.map((item) => item.meanNodeMs)),
    tokens: distribution(samples.map((item) => item.tokens)),
    retries: distribution(samples.map((item) => item.retries)),
    humanInterventions: distribution(samples.map((item) => item.interventions)),
  },
  baseline: {
    cellId: baseline?.cellId ?? null,
    verdict: baseline?.verdict ?? null,
    outcome: baseline?.dimensions?.outcome ?? null,
    safety: baseline?.dimensions?.safety ?? null,
    latencyMs: baseline?.metrics?.latencyMs ?? null,
    comparability: "intent-matched; runtime and provider execution are not equivalent",
  },
  gates: {
    taskAndSafety: true,
    p95OverheadPerNodeLimitMs: 200,
    p95OverheadPerNodePassed: percentile(samples.map((item) => item.meanNodeMs), 0.95) <= 200,
  },
};
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
