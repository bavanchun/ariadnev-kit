import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compileGraph, PORTABLE_GRAPH_CAPABILITY_CONTRACT } from "../src/graph/compile-graph.js";
import { registryFor, workflowFixture } from "../src/graph/graph-test-fixtures.js";
import { createCheckpointStore } from "../src/harness/events/checkpoint-store.js";
import { createEventStore } from "../src/harness/events/event-store.js";
import {
  createExecutorProbe,
  createExecutorResult,
  type ExecutorRequestV1,
  type GraphExecutorV1,
  type JsonValueV1,
} from "../src/harness/executors/executor.js";
import { createGraphRunContext, runGraph } from "../src/harness/run-graph.js";

const WARMUPS = 5;
const REPEATS = 100;
const available = [
  "state:read", "state:write", "workspace:read", "process:execute", "graph:interrupt",
  "graph:retry", "graph:routing", "execution:cancel", "execution:structured-output",
] as const;
const capability = createExecutorProbe({
  provider: "benchmark",
  adapterVersion: "1.0.0",
  runtimeVersion: "1.0.0",
  model: "deterministic-fixture",
  status: "supported",
  available,
  missing: [],
});

class BenchmarkExecutor implements GraphExecutorV1 {
  readonly provider = "benchmark";
  probe() { return capability; }
  async execute(request: ExecutorRequestV1) {
    const values: Record<string, JsonValueV1> = {
      request: request.instruction,
      facts: { files: ["src/router.ts"] },
      answer: "src/router.ts owns routing",
      proof: ["src/router.ts"],
    };
    return createExecutorResult({
      status: "completed",
      probe: capability,
      elapsedMs: 0,
      evidenceRefs: ["src/router.ts"],
      usage: { inputTokens: 10, cachedInputTokens: 5, outputTokens: 4, reasoningTokens: 1 },
      transientStateWrites: Object.fromEntries(request.allowedStateWrites.map((field) => [field, values[field]])),
    });
  }
}

function percentile(samples: readonly number[], quantile: number): number {
  const sorted = [...samples].sort((left, right) => left - right);
  return sorted[Math.floor((sorted.length - 1) * quantile)] ?? 0;
}

function summary(samples: readonly number[]) {
  return {
    samples: samples.length,
    p50Ms: Number(percentile(samples, 0.5).toFixed(4)),
    p95Ms: Number(percentile(samples, 0.95).toFixed(4)),
    maxMs: Number(Math.max(...samples).toFixed(4)),
  };
}

const source = workflowFixture("read-only-delivery");
const compiled = compileGraph(source, registryFor([source]), PORTABLE_GRAPH_CAPABILITY_CONTRACT);
if (!compiled.ok) throw new Error(JSON.stringify(compiled.findings));

async function sample(index: number): Promise<{ wholeRunMs: number; meanNodeMs: number }> {
  const root = mkdtempSync(join(tmpdir(), "ariadnev-runner-benchmark-"));
  try {
    const workspaceRoot = join(root, "workspace");
    const runRoot = join(root, "runs");
    mkdirSync(join(workspaceRoot, "src"), { recursive: true });
    writeFileSync(join(workspaceRoot, "src", "router.ts"), "export const route = true;\n");
    const context = createGraphRunContext({ graph: compiled.graph, runId: `run.benchmark-${index}` });
    const result = await runGraph({
      graph: compiled.graph,
      executor: new BenchmarkExecutor(),
      eventStore: createEventStore({ root: runRoot, context }),
      checkpointStore: createCheckpointStore({ root: runRoot, runId: context.runId }),
      workspaceRoot,
      instruction: "Find the router.",
    });
    if (result.status !== "completed" || !result.trajectory.promotable || result.workspaceMutations.length > 0) {
      throw new Error("benchmark graph did not meet its correctness floor");
    }
    return {
      wholeRunMs: result.metrics.orchestrationOverheadMs,
      meanNodeMs: result.metrics.orchestrationOverheadMs / result.metrics.nodesExecuted,
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

for (let index = 0; index < WARMUPS; index += 1) await sample(index);
const samples = [];
for (let index = 0; index < REPEATS; index += 1) samples.push(await sample(WARMUPS + index));
const wholeRunMs = samples.map((current) => current.wholeRunMs);
const meanNodeMs = samples.map((current) => current.meanNodeMs);
const output = {
  schemaVersion: 1,
  environment: {
    platform: process.platform,
    arch: process.arch,
    runtime: process.versions.bun ? `bun-${process.versions.bun}` : `node-${process.version}`,
  },
  workload: { warmups: WARMUPS, repeats: REPEATS, graph: compiled.graph.id, providerTimeExcluded: true },
  orchestrationWholeRun: summary(wholeRunMs),
  orchestrationMeanPerNode: summary(meanNodeMs),
  budget: {
    requirement: "p95 orchestration <= 200 ms/node",
    enforcement: "p95 whole-graph orchestration <= 200 ms (conservative)",
    p95LimitMs: 200,
    passed: percentile(wholeRunMs, 0.95) <= 200,
  },
};
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
