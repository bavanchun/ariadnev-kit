import { createHash, randomBytes } from "node:crypto";
import { existsSync, lstatSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join, normalize, relative, resolve } from "node:path";
import { categoricalToken } from "../eval/categorical-token.js";
import {
  compileGraph,
  PORTABLE_GRAPH_CAPABILITY_CONTRACT,
  type CompiledGraphV1,
} from "../graph/compile-graph.js";
import { graphRegistryForKit } from "../graph/kit-graph-registry.js";
import { createCheckpointStore } from "../harness/events/checkpoint-store.js";
import { createEventStore } from "../harness/events/event-store.js";
import { sameRunContext } from "../harness/events/event-types.js";
import type { RunStatusV1 } from "../harness/events/run-state.js";
import { captureWorkspaceSnapshot } from "../harness/effects/workspace-drift.js";
import type { ExecutorProbeV1, JsonValueV1 } from "../harness/executors/executor.js";
import type { ExecutorRegistryV1, ExecutorSelectionV1 } from "../harness/executors/executor-registry.js";
import {
  createGraphRunContext,
  requiredExecutorCapabilities,
  runGraph,
  type GraphRunResultV1,
} from "../harness/run-graph.js";
import { createRunManifestStore, type RunManifestV1 } from "../harness/state/run-manifest-store.js";
import { createRunStateSnapshotStore } from "../harness/state/run-state-snapshot-store.js";
import { loadKit } from "../kit/load-kit.js";

export type RunWorkflowActionV1 = "validate" | "dry-run" | "run" | "resume" | "status" | "cancel";

export interface RunWorkflowCommandInputV1 {
  action: RunWorkflowActionV1;
  workflow?: string;
  runId?: string;
  runtime?: string;
  workspaceRoot: string;
  instruction?: string;
  initialState?: Readonly<Record<string, JsonValueV1>>;
  signal?: AbortSignal;
}

export interface RunWorkflowCommandDepsV1 {
  kitRoot: string;
  runsRoot: string;
  registry: ExecutorRegistryV1;
  now?: () => string;
  randomId?: () => string;
  cancellationPollMs?: number;
}

type GraphSummaryV1 = Readonly<{
  id: string;
  digest: string;
  version: string;
  nodes?: number;
  edges?: number;
}>;

export type RunWorkflowCommandResultV1 = Readonly<{
  schemaVersion: 1;
  action: RunWorkflowActionV1;
  ok: boolean;
  status: string;
  workflow?: string;
  runId?: string;
  runtime?: string;
  graph?: GraphSummaryV1;
  probe?: ExecutorProbeV1;
  result?: GraphRunResultV1;
  reason?: string;
}>;

function digest(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function canonicalWorkspace(path: string): string {
  if (!isAbsolute(path) || normalize(path) !== path) {
    throw new Error("workspace root must be a normalized absolute path");
  }
  const resolved = realpathSync(path);
  const stat = lstatSync(resolved);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("workspace root must be a regular directory");
  return resolved;
}

function requiredInstruction(value: string | undefined): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error("run instruction is required");
  if (Buffer.byteLength(value, "utf8") > 256 * 1024) throw new Error("run instruction exceeds the size bound");
  return value;
}

function workspaceIdentity(workspaceRoot: string): string {
  return digest(`workspace\0${workspaceRoot}\0${captureWorkspaceSnapshot(workspaceRoot).digest}`);
}

function compileWorkflow(kitRoot: string, requested: string | undefined): { graph: CompiledGraphV1; workflow: string } {
  const workflow = categoricalToken(requested, "workflow");
  const kit = loadKit(kitRoot);
  const source = kit.workflows.find((candidate) => candidate.name === workflow);
  if (!source) throw new Error(`unknown workflow: ${workflow}`);
  const compiled = compileGraph(source.graph, graphRegistryForKit(kit), PORTABLE_GRAPH_CAPABILITY_CONTRACT);
  if (!compiled.ok) {
    const findings = compiled.findings.map((finding) => `${finding.id}: ${finding.message}`).join("; ");
    throw new Error(`workflow ${workflow} is invalid: ${findings}`);
  }
  return { graph: compiled.graph, workflow };
}

function graphSummary(graph: CompiledGraphV1): GraphSummaryV1 {
  const context = createGraphRunContext({ graph, runId: "run.summary" });
  return Object.freeze({
    id: graph.id,
    digest: context.graph.digest,
    version: graph.versions.graph,
    nodes: graph.nodes.length,
    edges: graph.edges.length,
  });
}

function storedGraphSummary(manifest: RunManifestV1): GraphSummaryV1 {
  return Object.freeze({
    id: manifest.context.graph.id,
    digest: manifest.context.graph.digest,
    version: manifest.context.versions.graph,
  });
}

function selectionFailure(
  action: RunWorkflowActionV1,
  workflow: string,
  graph: CompiledGraphV1,
  selection: Extract<ExecutorSelectionV1, { ok: false }>,
): RunWorkflowCommandResultV1 {
  return Object.freeze({
    schemaVersion: 1,
    action,
    ok: false,
    status: "unsupported",
    workflow,
    ...(selection.provider ? { runtime: selection.provider } : {}),
    graph: graphSummary(graph),
    ...(selection.probes.length === 1 ? { probe: selection.probes[0] } : {}),
    reason: selection.reason,
  });
}

function selectedRuntime(
  action: RunWorkflowActionV1,
  workflow: string,
  graph: CompiledGraphV1,
  registry: ExecutorRegistryV1,
  runtime?: string,
): Extract<ExecutorSelectionV1, { ok: true }> | RunWorkflowCommandResultV1 {
  const selection = registry.select({
    ...(runtime === undefined ? {} : { provider: categoricalToken(runtime, "runtime") }),
    requiredCapabilities: requiredExecutorCapabilities(graph),
  });
  if (!selection.ok) return selectionFailure(action, workflow, graph, selection);
  return selection;
}

function runId(input: RunWorkflowCommandInputV1, deps: RunWorkflowCommandDepsV1): string {
  if (input.runId !== undefined) return categoricalToken(input.runId, "run ID");
  const timestamp = Date.parse((deps.now ?? (() => new Date().toISOString()))());
  if (!Number.isFinite(timestamp)) throw new Error("run clock returned an invalid timestamp");
  const suffix = (deps.randomId ?? (() => randomBytes(8).toString("hex")))();
  return categoricalToken(`run.${timestamp.toString(36)}.${suffix}`, "run ID");
}

function existingRunDirectory(runsRoot: string, id: string): string {
  if (!isAbsolute(runsRoot) || normalize(runsRoot) !== runsRoot) throw new Error("runs root must be a normalized absolute path");
  const directory = join(runsRoot, id);
  if (!existsSync(directory)) throw new Error(`run does not exist: ${id}`);
  const stat = lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("run path must be a regular directory");
  return directory;
}

function assertRunStorageOutsideWorkspace(runsRoot: string, workspaceRoot: string): void {
  let ancestor = runsRoot;
  const missing: string[] = [];
  while (!existsSync(ancestor)) {
    const parent = dirname(ancestor);
    if (parent === ancestor) throw new Error("run storage has no available parent directory");
    missing.unshift(basename(ancestor));
    ancestor = parent;
  }
  const canonicalRunsRoot = resolve(realpathSync(ancestor), ...missing);
  const path = relative(workspaceRoot, canonicalRunsRoot);
  if (path === "" || (path !== ".." && !path.startsWith("../") && !path.startsWith("..\\") && !isAbsolute(path))) {
    throw new Error("run storage must be outside the read-only workspace");
  }
}

function manifestIdentity(input: {
  manifest: RunManifestV1;
  workspaceRoot: string;
  instruction: string;
  requestedRuntime?: string;
}): void {
  if (input.requestedRuntime !== undefined && categoricalToken(input.requestedRuntime, "runtime") !== input.manifest.runtime) {
    throw new Error(`runtime change is not allowed: run uses ${input.manifest.runtime}`);
  }
  if (digest(`instruction\0${input.instruction}`) !== input.manifest.instructionDigest) {
    throw new Error("run instruction drift detected");
  }
  if (workspaceIdentity(input.workspaceRoot) !== input.manifest.workspaceDigest) {
    throw new Error("run workspace drift detected");
  }
}

function terminalResult(input: {
  action: "resume" | "status";
  manifest: RunManifestV1;
  graph: GraphSummaryV1;
  status: RunStatusV1 | "pending";
}): RunWorkflowCommandResultV1 {
  return Object.freeze({
    schemaVersion: 1,
    action: input.action,
    ok: true,
    status: input.status,
    workflow: input.manifest.workflow,
    runId: input.manifest.runId,
    runtime: input.manifest.runtime,
    graph: input.graph,
  });
}

function cancellationMonitor(input: {
  manifestStore: ReturnType<typeof createRunManifestStore>;
  external?: AbortSignal;
  pollMs: number;
}) {
  const controller = new AbortController();
  let failure: Error | null = null;
  const abortFromExternal = () => controller.abort(input.external?.reason);
  if (input.external?.aborted) abortFromExternal();
  else input.external?.addEventListener("abort", abortFromExternal, { once: true });
  const checkCancellation = () => {
    try {
      if (input.manifestStore.cancellationRequested()) controller.abort("cancel-requested");
    } catch (error) {
      failure = error instanceof Error ? error : new Error(String(error));
      controller.abort(failure);
    }
  };
  checkCancellation();
  const timer = setInterval(checkCancellation, input.pollMs);
  timer.unref?.();
  return Object.freeze({
    signal: controller.signal,
    close(): void {
      clearInterval(timer);
      input.external?.removeEventListener("abort", abortFromExternal);
      if (failure) throw failure;
    },
  });
}

function executionEnvelope(input: {
  action: "run" | "resume";
  workflow: string;
  runId: string;
  runtime: string;
  graph: CompiledGraphV1;
  result: GraphRunResultV1;
}): RunWorkflowCommandResultV1 {
  return Object.freeze({
    schemaVersion: 1,
    action: input.action,
    ok: input.result.status === "completed",
    status: input.result.status,
    workflow: input.workflow,
    runId: input.runId,
    runtime: input.runtime,
    graph: graphSummary(input.graph),
    probe: input.result.executor ?? undefined,
    result: input.result,
  });
}

export async function runWorkflowCommand(
  input: RunWorkflowCommandInputV1,
  deps: RunWorkflowCommandDepsV1,
): Promise<RunWorkflowCommandResultV1> {
  const workspaceRoot = canonicalWorkspace(input.workspaceRoot);
  if (input.action === "validate" || input.action === "dry-run" || input.action === "run") {
    const { graph, workflow } = compileWorkflow(deps.kitRoot, input.workflow);
    if (input.action === "validate") {
      return Object.freeze({ schemaVersion: 1, action: "validate", ok: true, status: "valid", workflow, graph: graphSummary(graph) });
    }
    if (input.action === "dry-run") {
      const mutationNodes = graph.nodes.filter((node) => node.authority.effect !== "none").map((node) => node.id);
      if (mutationNodes.length > 0) {
        return Object.freeze({
          schemaVersion: 1,
          action: "dry-run",
          ok: false,
          status: "policy-denied",
          workflow,
          ...(input.runtime ? { runtime: categoricalToken(input.runtime, "runtime") } : {}),
          graph: graphSummary(graph),
          reason: `active side effects are unavailable: ${mutationNodes.join(", ")}`,
        });
      }
    }
    const chosen = selectedRuntime(input.action, workflow, graph, deps.registry, input.runtime);
    if (!("selection" in chosen)) return chosen;
    if (input.action === "dry-run") {
      return Object.freeze({
        schemaVersion: 1,
        action: "dry-run",
        ok: true,
        status: "ready",
        workflow,
        runtime: chosen.provider,
        graph: graphSummary(graph),
        probe: chosen.probe,
      });
    }

    const instruction = requiredInstruction(input.instruction);
    const id = runId(input, deps);
    if (!isAbsolute(deps.runsRoot) || normalize(deps.runsRoot) !== deps.runsRoot) {
      throw new Error("runs root must be a normalized absolute path");
    }
    assertRunStorageOutsideWorkspace(deps.runsRoot, workspaceRoot);
    if (existsSync(join(deps.runsRoot, id))) throw new Error(`run already exists: ${id}`);
    const context = createGraphRunContext({ graph, runId: id });
    const eventStore = createEventStore({ root: deps.runsRoot, context });
    const checkpointStore = createCheckpointStore({ root: deps.runsRoot, runId: id });
    const manifestStore = createRunManifestStore({ runDirectory: eventStore.runDirectory });
    if (chosen.probe.runtimeVersion === null || chosen.probe.model === null) {
      throw new Error("selected runtime did not report a version and model");
    }
    manifestStore.record(Object.freeze({
      schemaVersion: 1,
      runId: id,
      workflow,
      runtime: chosen.provider,
      runtimeVersion: chosen.probe.runtimeVersion,
      model: chosen.probe.model,
      context,
      instructionDigest: digest(`instruction\0${instruction}`),
      workspaceDigest: workspaceIdentity(workspaceRoot),
      createdAt: (deps.now ?? (() => new Date().toISOString()))(),
    }));
    const snapshots = createRunStateSnapshotStore({ runDirectory: eventStore.runDirectory });
    const monitor = cancellationMonitor({
      manifestStore,
      ...(input.signal ? { external: input.signal } : {}),
      pollMs: deps.cancellationPollMs ?? 100,
    });
    let result: GraphRunResultV1;
    try {
      result = await runGraph({
        graph,
        executor: chosen.executor,
        eventStore,
        checkpointStore,
        workspaceRoot,
        instruction,
        ...(input.initialState ? { initialState: input.initialState } : {}),
        persistState: snapshots.write,
        signal: monitor.signal,
      });
    } finally {
      monitor.close();
    }
    return executionEnvelope({ action: "run", workflow, runId: id, runtime: chosen.provider, graph, result });
  }

  const id = categoricalToken(input.runId, "run ID");
  const directory = existingRunDirectory(deps.runsRoot, id);
  const manifestStore = createRunManifestStore({ runDirectory: directory });
  const manifest = manifestStore.read();
  const eventStore = createEventStore({ root: deps.runsRoot, context: manifest.context });
  const durable = eventStore.state();
  const storedGraph = storedGraphSummary(manifest);

  if (input.action === "status") {
    return terminalResult({ action: "status", manifest, graph: storedGraph, status: durable?.status ?? "pending" });
  }
  if (input.action === "cancel") {
    if (durable && ["completed", "failed", "cancelled"].includes(durable.status)) {
      return Object.freeze({
        schemaVersion: 1,
        action: "cancel",
        ok: true,
        status: durable.status,
        workflow: manifest.workflow,
        runId: id,
        runtime: manifest.runtime,
        graph: storedGraph,
      });
    }
    manifestStore.requestCancellation((deps.now ?? (() => new Date().toISOString()))());
    return Object.freeze({
      schemaVersion: 1,
      action: "cancel",
      ok: true,
      status: "cancel-requested",
      workflow: manifest.workflow,
      runId: id,
      runtime: manifest.runtime,
      graph: storedGraph,
    });
  }

  const { graph, workflow } = compileWorkflow(deps.kitRoot, manifest.workflow);
  if (!sameRunContext(createGraphRunContext({ graph, runId: id }), manifest.context)) {
    throw new Error(
      "run graph or runner contract drift detected; resume with the original vcskill version or start a new run (status and cancel remain available)",
    );
  }
  const instruction = requiredInstruction(input.instruction);
  assertRunStorageOutsideWorkspace(deps.runsRoot, workspaceRoot);
  manifestIdentity({
    manifest,
    workspaceRoot,
    instruction,
    ...(input.runtime ? { requestedRuntime: input.runtime } : {}),
  });
  if (durable && ["completed", "failed", "cancelled"].includes(durable.status)) {
    return terminalResult({ action: "resume", manifest, graph: graphSummary(graph), status: durable.status });
  }
  const chosen = selectedRuntime("resume", workflow, graph, deps.registry, manifest.runtime);
  if (!("selection" in chosen)) return chosen;
  if (chosen.probe.runtimeVersion !== manifest.runtimeVersion || chosen.probe.model !== manifest.model) {
    throw new Error("runtime identity drift detected; resume requires the original runtime version and model");
  }
  const snapshots = createRunStateSnapshotStore({ runDirectory: directory });
  const sequence = durable?.lastSequence;
  const initialState = sequence === undefined ? input.initialState ?? {} : snapshots.read(sequence);
  if (sequence !== undefined && initialState === null) throw new Error(`run state snapshot ${sequence} is unavailable`);
  const checkpointStore = createCheckpointStore({ root: deps.runsRoot, runId: id });
  const monitor = cancellationMonitor({
    manifestStore,
    ...(input.signal ? { external: input.signal } : {}),
    pollMs: deps.cancellationPollMs ?? 100,
  });
  let result: GraphRunResultV1;
  try {
    result = await runGraph({
      graph,
      executor: chosen.executor,
      eventStore,
      checkpointStore,
      workspaceRoot,
      instruction,
      initialState: initialState ?? {},
      persistState: snapshots.write,
      signal: monitor.signal,
    });
  } finally {
    monitor.close();
  }
  return executionEnvelope({ action: "resume", workflow, runId: id, runtime: chosen.provider, graph, result });
}

export function formatRunWorkflowResult(result: RunWorkflowCommandResultV1, json: boolean): string {
  if (json) return JSON.stringify(result, null, 2);
  const identity = result.runId ? ` ${result.runId}` : "";
  const runtime = result.runtime ? ` via ${result.runtime}` : "";
  const reason = result.reason ? `: ${result.reason}` : "";
  return `${result.action}${identity}: ${result.status}${runtime}${reason}`;
}
