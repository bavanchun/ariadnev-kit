import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { compileGraph, PORTABLE_GRAPH_CAPABILITY_CONTRACT, type CompiledGraphV1 } from "../graph/compile-graph.js";
import { cloneGraph, registryFor, workflowFixture } from "../graph/graph-test-fixtures.js";
import { createCheckpointStore } from "./events/checkpoint-store.js";
import { createEventStore } from "./events/event-store.js";
import {
  createExecutorProbe,
  createExecutorResult,
  type ExecutorRequestV1,
  type ExecutorResultV1,
  type GraphExecutorV1,
  type JsonValueV1,
} from "./executors/executor.js";
import { createGraphRunContext, runGraph } from "./run-graph.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const AVAILABLE = [
  "state:read",
  "state:write",
  "workspace:read",
  "process:execute",
  "graph:interrupt",
  "graph:retry",
  "graph:routing",
  "execution:cancel",
  "execution:structured-output",
] as const;

function probe(status: "supported" | "unsupported" = "supported") {
  return createExecutorProbe({
    provider: "codex",
    adapterVersion: "1.0.0",
    runtimeVersion: "0.147.0",
    model: "gpt-5.4-mini",
    status,
    available: AVAILABLE,
    missing: status === "supported" ? [] : ["workspace:read"],
    ...(status === "unsupported" ? { reason: "runtime-unavailable" } : {}),
  });
}

class FakeExecutor implements GraphExecutorV1 {
  readonly provider = "codex";
  readonly calls: ExecutorRequestV1[] = [];
  probeCalls = 0;

  constructor(
    private readonly handler: (request: ExecutorRequestV1, call: number) => ExecutorResultV1 = defaultResult,
    private readonly capabilityProbe = probe(),
  ) {}

  probe(): ReturnType<typeof probe> {
    this.probeCalls += 1;
    return this.capabilityProbe;
  }

  async execute(request: ExecutorRequestV1): Promise<ExecutorResultV1> {
    this.calls.push(request);
    return this.handler(request, this.calls.length);
  }
}

function defaultResult(request: ExecutorRequestV1): ExecutorResultV1 {
  const values: Record<string, JsonValueV1> = {
    request: request.instruction,
    facts: { files: ["src/router.ts"] },
    answer: "The router is implemented in src/router.ts.",
    proof: ["src/router.ts"],
  };
  return createExecutorResult({
    status: "completed",
    probe: probe(),
    elapsedMs: 10,
    evidenceRefs: ["src/router.ts"],
    usage: { inputTokens: 10, cachedInputTokens: 2, outputTokens: 4, reasoningTokens: 1 },
    transientStateWrites: Object.fromEntries(request.allowedStateWrites.map((field) => [field, values[field]])),
  });
}

function compile(name: "read-only-delivery" | "safe-change-delivery", mutate?: (source: ReturnType<typeof cloneGraph>) => void) {
  const source = cloneGraph(workflowFixture(name));
  mutate?.(source);
  const result = compileGraph(source, registryFor([source]), PORTABLE_GRAPH_CAPABILITY_CONTRACT);
  if (!result.ok) throw new Error(JSON.stringify(result.findings));
  return result.graph;
}

function fixture(graph: CompiledGraphV1, runId = "run.graph-test") {
  const root = mkdtempSync(join(tmpdir(), "vcskill-run-graph-"));
  roots.push(root);
  const workspaceRoot = join(root, "workspace");
  const runRoot = join(root, "runs");
  mkdirSync(join(workspaceRoot, "src"), { recursive: true });
  writeFileSync(join(workspaceRoot, "src", "router.ts"), "export const route = true;\n");
  const context = createGraphRunContext({ graph, runId });
  const eventStore = createEventStore({ root: runRoot, context });
  const checkpointStore = createCheckpointStore({ root: runRoot, runId });
  return { root, workspaceRoot, runRoot, context, eventStore, checkpointStore };
}

describe("runGraph", () => {
  it("executes the canonical read-only graph with durable and shadow evidence", async () => {
    const graph = compile("read-only-delivery");
    const current = fixture(graph);
    const executor = new FakeExecutor();
    const result = await runGraph({
      graph,
      executor,
      eventStore: current.eventStore,
      checkpointStore: current.checkpointStore,
      workspaceRoot: current.workspaceRoot,
      instruction: "Find the router implementation.",
    });

    expect(result.status).toBe("completed");
    expect(executor.calls.map((call) => call.node.id)).toEqual(["intake", "inspect", "answer", "verify"]);
    expect(result.state.answer).toBe("The router is implemented in src/router.ts.");
    expect(result.workspaceMutations).toEqual([]);
    expect(result.metrics).toMatchObject({ nodesExecuted: 4, retries: 0, inputTokens: 40, outputTokens: 16 });
    expect(current.eventStore.read().events.map((event) => event.type)).toEqual([
      "run-created",
      "node-started", "node-completed",
      "node-started", "node-completed",
      "node-started", "node-completed",
      "node-started", "node-completed",
      "node-started", "run-completed",
    ]);
    expect(current.checkpointStore.read()).toMatchObject({ status: "completed", sequence: 11, currentNodeId: "complete" });
    expect(result.trajectory.promotable).toBe(true);
    expect(result.evidenceRefs).toEqual(["src/router.ts"]);
  });

  it("denies write-capable graphs before probing or appending events", async () => {
    const graph = compile("safe-change-delivery");
    const current = fixture(graph);
    const executor = new FakeExecutor();
    const result = await runGraph({
      graph,
      executor,
      eventStore: current.eventStore,
      checkpointStore: current.checkpointStore,
      workspaceRoot: current.workspaceRoot,
      instruction: "Change the router.",
    });
    expect(result).toMatchObject({ status: "policy-denied" });
    expect(result.policyViolations).toContain("node apply requires workspace:write");
    expect(executor.probeCalls).toBe(0);
    expect(executor.calls).toEqual([]);
    expect(current.eventStore.read().events).toEqual([]);
  });

  it("fails closed when an executor mutates a read-only workspace", async () => {
    const graph = compile("read-only-delivery");
    const current = fixture(graph);
    const executor = new FakeExecutor((request) => {
      writeFileSync(join(request.workspaceRoot, "forbidden.txt"), "mutation");
      return defaultResult(request);
    });
    const result = await runGraph({
      graph,
      executor,
      eventStore: current.eventStore,
      checkpointStore: current.checkpointStore,
      workspaceRoot: current.workspaceRoot,
      instruction: "Read only.",
    });
    expect(result.status).toBe("policy-denied");
    expect(result.workspaceMutations).toEqual(["forbidden.txt"]);
    expect(current.eventStore.state()).toMatchObject({ status: "failed", terminalReason: "policy" });
  });

  it("resumes at a pending node without replaying completed work", async () => {
    const graph = compile("read-only-delivery");
    const current = fixture(graph, "run.pending-resume");
    current.eventStore.append({ type: "run-created", entryNodeId: "intake" });
    current.eventStore.append({ type: "node-started", nodeId: "intake", attempt: 1 });
    current.eventStore.append({ type: "node-completed", nodeId: "intake", attempt: 1, nextNodeId: "inspect" });
    current.checkpointStore.write(current.eventStore.state()!);
    const executor = new FakeExecutor();
    const result = await runGraph({
      graph,
      executor,
      eventStore: current.eventStore,
      checkpointStore: current.checkpointStore,
      workspaceRoot: current.workspaceRoot,
      instruction: "Find the router.",
      initialState: { request: "Find the router." },
    });
    expect(result.status).toBe("completed");
    expect(executor.calls.map((call) => call.node.id)).toEqual(["inspect", "answer", "verify"]);
    expect(result.resume).toMatchObject({ resumed: true, startingNodeId: "inspect", recoveredRunningAttempt: false });
  });

  it("recovers a crashed running read-only attempt as the next attempt", async () => {
    const graph = compile("read-only-delivery");
    const current = fixture(graph, "run.running-resume");
    current.eventStore.append({ type: "run-created", entryNodeId: "intake" });
    current.eventStore.append({ type: "node-started", nodeId: "intake", attempt: 1 });
    current.checkpointStore.write(current.eventStore.state()!);
    const executor = new FakeExecutor();
    const result = await runGraph({
      graph,
      executor,
      eventStore: current.eventStore,
      checkpointStore: current.checkpointStore,
      workspaceRoot: current.workspaceRoot,
      instruction: "Find the router.",
    });
    expect(result.status).toBe("completed");
    expect(executor.calls[0]).toMatchObject({ node: { id: "intake" }, attempt: 2 });
    expect(result.resume).toMatchObject({ resumed: true, recoveredRunningAttempt: true });
  });

  it("returns unsupported evidence without starting execution", async () => {
    const graph = compile("read-only-delivery");
    const current = fixture(graph, "run.unsupported");
    const executor = new FakeExecutor(defaultResult, probe("unsupported"));
    const result = await runGraph({
      graph,
      executor,
      eventStore: current.eventStore,
      checkpointStore: current.checkpointStore,
      workspaceRoot: current.workspaceRoot,
      instruction: "Read only.",
    });
    expect(result).toMatchObject({ status: "unsupported", executor: { status: "unsupported", reason: "runtime-unavailable" } });
    expect(executor.calls).toEqual([]);
    expect(current.eventStore.read().events).toEqual([]);
  });

  it("routes cancellation to a durable terminal state", async () => {
    const graph = compile("read-only-delivery");
    const current = fixture(graph, "run.cancelled");
    const executor = new FakeExecutor(() => createExecutorResult({
      status: "cancelled",
      probe: probe(),
      elapsedMs: 2,
      evidenceRefs: [],
      usage: { inputTokens: null, cachedInputTokens: null, outputTokens: null, reasoningTokens: null },
      transientStateWrites: {},
      failure: { code: "cancelled", message: "execution cancelled", transient: false },
    }));
    const result = await runGraph({
      graph,
      executor,
      eventStore: current.eventStore,
      checkpointStore: current.checkpointStore,
      workspaceRoot: current.workspaceRoot,
      instruction: "Read only.",
    });
    expect(result.status).toBe("cancelled");
    expect(current.eventStore.state()).toMatchObject({ status: "cancelled", currentNodeId: "cancelled" });
  });

  it("retries only within the graph bound", async () => {
    const graph = compile("read-only-delivery", (source) => {
      const intake = source.nodes.find((node) => node.id === "intake")!;
      intake.retry = { maxAttempts: 2, backoffMs: 0, on: ["timeout"] };
      source.edges.push({ id: "intake-retry", from: "intake", to: "intake", type: "retry" });
    });
    const current = fixture(graph, "run.retry");
    const executor = new FakeExecutor((request, call) => call === 1
      ? createExecutorResult({
          status: "timed-out",
          probe: probe(),
          elapsedMs: 25,
          evidenceRefs: [],
          usage: { inputTokens: null, cachedInputTokens: null, outputTokens: null, reasoningTokens: null },
          transientStateWrites: {},
          failure: { code: "timeout", message: "execution timed out", transient: true },
        })
      : defaultResult(request));
    const result = await runGraph({
      graph,
      executor,
      eventStore: current.eventStore,
      checkpointStore: current.checkpointStore,
      workspaceRoot: current.workspaceRoot,
      instruction: "Find the router.",
    });
    expect(result.status).toBe("completed");
    expect(result.metrics.retries).toBe(1);
    expect(executor.calls.filter((call) => call.node.id === "intake").map((call) => call.attempt)).toEqual([1, 2]);
    expect(current.eventStore.read().events.map((event) => event.type)).toContain("node-retry-scheduled");
  });
});
