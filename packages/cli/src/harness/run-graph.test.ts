import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { compileGraph, PORTABLE_GRAPH_CAPABILITY_CONTRACT, type CompiledGraphV1 } from "../graph/compile-graph.js";
import { cloneGraph, registryFor, workflowFixture } from "../graph/graph-test-fixtures.js";
import { initializeGitRepository } from "../eval/fixture-git.js";
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
import {
  createSideEffectResult,
  type SideEffectExecutorV1,
  type SideEffectRequestV1,
  type SideEffectResultV1,
} from "./effects/side-effect-lease.js";
import { grantApproval } from "./policy/approval-gate.js";
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
    proposal: { paths: ["src/router.ts"], replacement: "export const route = 'v2';\n" },
    decision: "approved",
    approval: { decision: "approved" },
    change: { paths: ["src/router.ts"] },
    "test-results": { passed: true },
    review: { passed: true },
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

class FakeSideEffectExecutor implements SideEffectExecutorV1 {
  readonly calls: SideEffectRequestV1[] = [];

  constructor(
    private readonly handler: (request: SideEffectRequestV1, call: number) => SideEffectResultV1 = defaultSideEffect,
    readonly effects: ReadonlyArray<"workspace" | "external"> = ["workspace"],
  ) {}

  async execute(request: SideEffectRequestV1): Promise<SideEffectResultV1> {
    this.calls.push(request);
    return this.handler(request, this.calls.length);
  }
}

function defaultSideEffect(request: SideEffectRequestV1): SideEffectResultV1 {
  writeFileSync(join(request.workspaceRoot, "src", "router.ts"), "export const route = 'v2';\n");
  return createSideEffectResult({
    status: "completed",
    elapsedMs: 3,
    evidenceRefs: ["src/router.ts"],
    transientStateWrites: { change: { paths: ["src/router.ts"] } },
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

  it("pauses for a bound approval, then completes one scoped workspace effect", async () => {
    const graph = compile("safe-change-delivery");
    const current = fixture(graph, "run.safe-change");
    initializeGitRepository(current.workspaceRoot);
    const executor = new FakeExecutor();
    const effects = new FakeSideEffectExecutor();
    const base = {
      graph,
      executor,
      sideEffectExecutor: effects,
      eventStore: current.eventStore,
      checkpointStore: current.checkpointStore,
      workspaceRoot: current.workspaceRoot,
      workspaceScope: ["src/router.ts"],
      instruction: "Change the router.",
      policy: { mode: "workspace-change", grants: ["workspace:write"] } as const,
    };
    const waiting = await runGraph(base);
    expect(waiting).toMatchObject({ status: "approval-required", approvalRequest: { nodeId: "apply" } });
    expect(effects.calls).toEqual([]);
    const approval = grantApproval(waiting.approvalRequest!, {
      approvedAt: "2026-08-08T10:00:00.000Z",
      expiresAt: "2099-08-08T11:00:00.000Z",
    });
    const completed = await runGraph({ ...base, initialState: waiting.state, approval });
    expect(completed.status).toBe("completed");
    expect(effects.calls).toHaveLength(1);
    expect(effects.calls[0].lease.status).toBe("attempted");
    expect(completed.workspaceMutations).toEqual(["src/router.ts"]);
    expect(completed.state).toMatchObject({ "test-results": { passed: true }, review: { passed: true } });
    expect(completed.evidenceRefs).toContain("src/router.ts");
    const diff = spawnSync("git", ["diff", "--name-only"], { cwd: current.workspaceRoot, encoding: "utf8" });
    expect(diff.status).toBe(0);
    expect(diff.stdout.trim()).toBe("src/router.ts");
    expect(completed.rollbackEvidence).toEqual([expect.objectContaining({
      automatic: false,
      changedPaths: ["src/router.ts"],
    })]);
    expect(current.eventStore.read().events.map((event) => event.type)).toEqual(expect.arrayContaining([
      "node-waiting", "node-resumed", "effect-prepared", "effect-committed", "run-completed",
    ]));
  });

  it("invalidates approval when the workspace drifts before resume", async () => {
    const graph = compile("safe-change-delivery");
    const current = fixture(graph, "run.approval-drift");
    const executor = new FakeExecutor();
    const effects = new FakeSideEffectExecutor();
    const base = {
      graph,
      executor,
      sideEffectExecutor: effects,
      eventStore: current.eventStore,
      checkpointStore: current.checkpointStore,
      workspaceRoot: current.workspaceRoot,
      workspaceScope: ["src/router.ts"],
      instruction: "Change the router.",
      policy: { mode: "workspace-change", grants: ["workspace:write"] } as const,
    };
    const waiting = await runGraph(base);
    const approval = grantApproval(waiting.approvalRequest!, { expiresAt: "2099-08-08T11:00:00.000Z" });
    writeFileSync(join(current.workspaceRoot, "unexpected.txt"), "drift\n");
    const denied = await runGraph({ ...base, initialState: waiting.state, approval });
    expect(denied).toMatchObject({ status: "approval-required", approvalFailure: "workspace-drift" });
    expect(effects.calls).toEqual([]);
  });

  it("requires reconciliation when a workspace executor escapes its approved scope", async () => {
    const graph = compile("safe-change-delivery");
    const current = fixture(graph, "run.effect-scope-escape");
    const effects = new FakeSideEffectExecutor((request) => {
      writeFileSync(join(request.workspaceRoot, "unexpected.txt"), "outside scope\n");
      return createSideEffectResult({
        status: "completed",
        elapsedMs: 1,
        evidenceRefs: ["unexpected.txt"],
        transientStateWrites: { change: { paths: ["unexpected.txt"] } },
      });
    });
    const base = {
      graph,
      executor: new FakeExecutor(),
      sideEffectExecutor: effects,
      eventStore: current.eventStore,
      checkpointStore: current.checkpointStore,
      workspaceRoot: current.workspaceRoot,
      workspaceScope: ["src/router.ts"],
      instruction: "Change only the router.",
      policy: { mode: "workspace-change", grants: ["workspace:write"] } as const,
    };
    const waiting = await runGraph(base);
    const approval = grantApproval(waiting.approvalRequest!, { expiresAt: "2099-08-08T11:00:00.000Z" });
    const result = await runGraph({ ...base, initialState: waiting.state, approval });
    expect(result).toMatchObject({ status: "reconciliation-required", workspaceMutations: ["unexpected.txt"] });
    expect(result.policyViolations).toContain("node apply changed paths outside its approved workspace scope");
  });

  it("requires reconciliation instead of blindly retrying a crashed effect", async () => {
    const graph = compile("safe-change-delivery");
    const current = fixture(graph, "run.effect-crash");
    const executor = new FakeExecutor();
    const crashing = new FakeSideEffectExecutor((request) => {
      writeFileSync(join(request.workspaceRoot, "src", "router.ts"), "export const route = 'v2';\n");
      throw new Error("synthetic crash after effect");
    });
    const base = {
      graph,
      executor,
      eventStore: current.eventStore,
      checkpointStore: current.checkpointStore,
      workspaceRoot: current.workspaceRoot,
      workspaceScope: ["src/router.ts"],
      instruction: "Change the router.",
      policy: { mode: "workspace-change", grants: ["workspace:write"] } as const,
    };
    const waiting = await runGraph({ ...base, sideEffectExecutor: crashing });
    const approval = grantApproval(waiting.approvalRequest!, { expiresAt: "2099-08-08T11:00:00.000Z" });
    await expect(runGraph({ ...base, sideEffectExecutor: crashing, initialState: waiting.state, approval })).rejects.toThrow(/synthetic crash/);
    const idempotencyKey = crashing.calls[0].lease.idempotencyKey;
    const resumedStore = createEventStore({ root: current.runRoot, context: current.context });
    const resumedCheckpoints = createCheckpointStore({ root: current.runRoot, runId: current.context.runId });
    const resumedBase = { ...base, eventStore: resumedStore, checkpointStore: resumedCheckpoints, sideEffectExecutor: new FakeSideEffectExecutor() };
    const uncertain = await runGraph({ ...resumedBase, initialState: waiting.state });
    expect(uncertain).toMatchObject({
      status: "reconciliation-required",
      reconciliationRequired: { idempotencyKey, status: "uncertain" },
    });
    expect(resumedBase.sideEffectExecutor.calls).toEqual([]);
    const changedScope = await runGraph({ ...resumedBase, workspaceScope: ["src/"], initialState: waiting.state });
    expect(changedScope).toMatchObject({ status: "approval-required", approvalFailure: "scope-drift" });
    const changedScopeApproval = grantApproval(changedScope.approvalRequest!, { expiresAt: "2099-08-08T11:00:00.000Z" });
    const mismatchedIdentity = await runGraph({
      ...resumedBase,
      workspaceScope: ["src/"],
      initialState: waiting.state,
      approval: changedScopeApproval,
      reconciliation: {
        idempotencyKey,
        outcome: "committed",
        evidenceRefs: ["reconcile:workspace-diff"],
        transientStateWrites: { change: { paths: ["src/router.ts"] } },
      },
    });
    expect(mismatchedIdentity).toMatchObject({ status: "reconciliation-required" });
    expect(mismatchedIdentity.policyViolations).toContain("reconciliation for node apply does not match its recorded effect identity");
    const restoredScope = await runGraph({ ...resumedBase, initialState: waiting.state, approval });
    expect(restoredScope).toMatchObject({ status: "reconciliation-required" });
    const missingEvidence = await runGraph({
      ...resumedBase,
      initialState: waiting.state,
      reconciliation: {
        idempotencyKey,
        outcome: "committed",
        evidenceRefs: [],
        transientStateWrites: { change: { paths: ["src/router.ts"] } },
      },
    });
    expect(missingEvidence.policyViolations).toContain("reconciliation for node apply lacks required evidence");
    const invalidWrites = await runGraph({
      ...resumedBase,
      initialState: waiting.state,
      reconciliation: {
        idempotencyKey,
        outcome: "committed",
        evidenceRefs: ["reconcile:workspace-diff"],
        transientStateWrites: {},
      },
    });
    expect(invalidWrites.policyViolations).toContain("reconciliation for node apply lacks required evidence or state writes");
    writeFileSync(join(current.workspaceRoot, "unexpected.txt"), "unapproved drift\n");
    const drifted = await runGraph({
      ...resumedBase,
      initialState: waiting.state,
      reconciliation: {
        idempotencyKey,
        outcome: "committed",
        evidenceRefs: ["reconcile:workspace-diff"],
        transientStateWrites: { change: { paths: ["src/router.ts"] } },
      },
    });
    expect(drifted).toMatchObject({ status: "reconciliation-required" });
    expect(drifted.policyViolations).toContain("reconciliation for node apply observed workspace drift outside its approved scope");
    expect(drifted.rollbackEvidence).toEqual([expect.objectContaining({
      changedPaths: ["src/router.ts", "unexpected.txt"],
    })]);
    rmSync(join(current.workspaceRoot, "unexpected.txt"));
    const falseNotApplied = await runGraph({
      ...resumedBase,
      initialState: waiting.state,
      reconciliation: {
        idempotencyKey,
        outcome: "not-applied",
        evidenceRefs: ["reconcile:workspace-diff"],
        transientStateWrites: {},
      },
    });
    expect(falseNotApplied.policyViolations).toContain(`effect ${idempotencyKey} cannot reconcile as not-applied after workspace drift`);
    const completed = await runGraph({
      ...resumedBase,
      initialState: waiting.state,
      reconciliation: {
        idempotencyKey,
        outcome: "committed",
        evidenceRefs: ["reconcile:workspace-diff"],
        transientStateWrites: { change: { paths: ["src/router.ts"] } },
      },
    });
    expect(completed.status).toBe("completed");
    expect(resumedBase.sideEffectExecutor.calls).toEqual([]);
  });

  it("requires an explicit external scope and never retries a crashed external request", async () => {
    const graph = compile("safe-change-delivery", (source) => {
      const apply = source.nodes.find((node) => node.id === "apply")!;
      apply.authority.effect = "external";
      apply.authority.capabilities = ["state:read", "state:write", "workspace:read", "external:mutate"];
    });
    const current = fixture(graph, "run.external-crash");
    const executor = new FakeExecutor();
    let requests = 0;
    const crashing = new FakeSideEffectExecutor(() => {
      requests += 1;
      throw new Error("synthetic crash after external request");
    }, ["external"]);
    const base = {
      graph,
      executor,
      sideEffectExecutor: crashing,
      eventStore: current.eventStore,
      checkpointStore: current.checkpointStore,
      workspaceRoot: current.workspaceRoot,
      instruction: "Update remote issue 42.",
      policy: { mode: "workspace-change", grants: ["external:mutate"] } as const,
    };

    const denied = await runGraph(base);
    expect(denied.status).toBe("policy-denied");
    expect(denied.policyViolations).toContain("external effects require an explicit external scope");
    expect(current.eventStore.read().events).toEqual([]);

    const scoped = { ...base, externalScope: ["github/issues/42"] };
    const waiting = await runGraph(scoped);
    expect(waiting).toMatchObject({
      status: "approval-required",
      approvalRequest: { effect: "external", scope: { paths: ["github/issues/42"] } },
    });
    const approval = grantApproval(waiting.approvalRequest!, { expiresAt: "2099-08-08T11:00:00.000Z" });
    await expect(runGraph({ ...scoped, initialState: waiting.state, approval })).rejects.toThrow(/external request/);
    expect(requests).toBe(1);

    const resumed = await runGraph({
      ...scoped,
      eventStore: createEventStore({ root: current.runRoot, context: current.context }),
      checkpointStore: createCheckpointStore({ root: current.runRoot, runId: current.context.runId }),
      sideEffectExecutor: new FakeSideEffectExecutor(defaultSideEffect, ["external"]),
      initialState: waiting.state,
    });
    expect(resumed).toMatchObject({ status: "reconciliation-required" });
    expect(requests).toBe(1);
  });

  it("reuses one idempotency key when a proven not-applied effect retries", async () => {
    const graph = compile("safe-change-delivery", (source) => {
      source.nodes.find((node) => node.id === "apply")!.retry.backoffMs = 0;
    });
    const current = fixture(graph, "run.effect-retry");
    let physicalEffects = 0;
    const effects = new FakeSideEffectExecutor((request, call) => {
      if (call === 1) return createSideEffectResult({
        status: "failed",
        elapsedMs: 1,
        evidenceRefs: ["reconcile:no-workspace-diff"],
        transientStateWrites: {},
        failure: { code: "conflict", message: "synthetic conflict", transient: true },
      });
      physicalEffects += 1;
      return defaultSideEffect(request);
    });
    const executor = new FakeExecutor();
    const base = {
      graph,
      executor,
      sideEffectExecutor: effects,
      eventStore: current.eventStore,
      checkpointStore: current.checkpointStore,
      workspaceRoot: current.workspaceRoot,
      workspaceScope: ["src/router.ts"],
      instruction: "Change the router.",
      policy: { mode: "workspace-change", grants: ["workspace:write"] } as const,
    };
    const waiting = await runGraph(base);
    const approval = grantApproval(waiting.approvalRequest!, { expiresAt: "2099-08-08T11:00:00.000Z" });
    const completed = await runGraph({ ...base, initialState: waiting.state, approval });
    expect(completed.status).toBe("completed");
    expect(effects.calls.map((call) => call.lease.idempotencyKey)).toEqual([effects.calls[0].lease.idempotencyKey, effects.calls[0].lease.idempotencyKey]);
    expect(physicalEffects).toBe(1);
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
