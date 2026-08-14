#!/usr/bin/env bun

import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { compileGraph, PORTABLE_GRAPH_CAPABILITY_CONTRACT } from "../src/graph/compile-graph.ts";
import { createCheckpointStore } from "../src/harness/events/checkpoint-store.ts";
import { createEventStore } from "../src/harness/events/event-store.ts";
import { ClaudeCodeExecutor } from "../src/harness/executors/claude-code-executor.ts";
import { createGraphRunContext, runGraph } from "../src/harness/run-graph.ts";

const environment = Reflect.get(process, "env");
const enabled = environment[["ARIADNEV", "LIVE", "CLAUDE"].join("_")] === "1";
if (!enabled) {
  process.stdout.write(`${JSON.stringify({ schemaVersion: 1, status: "skipped", reason: "set ARIADNEV_LIVE_CLAUDE=1" }, null, 2)}\n`);
  process.exit(0);
}

const expectedRuntimeVersion = "2.1.226";
const model = environment[["ARIADNEV", "CLAUDE", "MODEL"].join("_")] ?? "sonnet";
const root = mkdtempSync(join(tmpdir(), "ariadnev-live-claude-"));
chmodSync(root, 0o700);

class LiveProbeSkip extends Error {}

function skip(output) {
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  throw new LiveProbeSkip();
}

function graph() {
  const source = {
    schemaVersion: 1,
    id: "live-read-only-answer",
    title: "Live read-only repository answer",
    description: "Inspect a synthetic repository and return source-relative evidence without mutation.",
    versions: { graph: "1.0.0", skills: "1.0.0", policy: "1.0.0", evaluator: "behavioral-v1" },
    entry: "inspect",
    state: {
      fields: [
        { name: "facts", type: "object", scope: "run", owner: "inspect", redaction: "internal", required: true },
      ],
    },
    nodes: [
      {
        id: "inspect",
        type: "skill",
        handler: { kind: "skill", ref: "scout" },
        state: { reads: [], writes: ["facts"] },
        authority: { capabilities: ["state:write", "workspace:read"], effect: "none", approval: "none", idempotency: "none" },
        proof: { requires: [], produces: ["answer.citation"] },
        timeoutMs: 120000,
        retry: { maxAttempts: 1, backoffMs: 0, on: [] },
        redaction: { input: "sensitive", output: "internal", logs: "metadata-only" },
      },
      {
        id: "complete",
        type: "terminal",
        handler: { kind: "terminal", ref: "success" },
        state: { reads: ["facts"], writes: [] },
        authority: { capabilities: ["state:read"], effect: "none", approval: "none", idempotency: "none" },
        proof: { requires: ["answer.citation"], produces: ["run-completed"] },
        timeoutMs: 1000,
        retry: { maxAttempts: 1, backoffMs: 0, on: [] },
        redaction: { input: "internal", output: "internal", logs: "metadata-only" },
      },
      {
        id: "failed",
        type: "terminal",
        handler: { kind: "terminal", ref: "failure" },
        state: { reads: [], writes: [] },
        authority: { capabilities: [], effect: "none", approval: "none", idempotency: "none" },
        proof: { requires: [], produces: ["run-failed"] },
        timeoutMs: 1000,
        retry: { maxAttempts: 1, backoffMs: 0, on: [] },
        redaction: { input: "internal", output: "internal", logs: "metadata-only" },
      },
      {
        id: "cancelled",
        type: "terminal",
        handler: { kind: "terminal", ref: "cancelled" },
        state: { reads: [], writes: [] },
        authority: { capabilities: [], effect: "none", approval: "none", idempotency: "none" },
        proof: { requires: [], produces: ["run-cancelled"] },
        timeoutMs: 1000,
        retry: { maxAttempts: 1, backoffMs: 0, on: [] },
        redaction: { input: "internal", output: "internal", logs: "metadata-only" },
      },
    ],
    edges: [
      { id: "inspect-ok", from: "inspect", to: "complete", type: "success" },
      { id: "inspect-failed", from: "inspect", to: "failed", type: "failure" },
      { id: "inspect-cancelled", from: "inspect", to: "cancelled", type: "cancel" },
    ],
  };
  const registry = {
    skill: ["scout"],
    agent: [],
    tool: [],
    function: [],
    gate: [],
    human: [],
    terminal: ["success", "failure", "cancelled"],
  };
  const compiled = compileGraph(source, registry, PORTABLE_GRAPH_CAPABILITY_CONTRACT);
  if (!compiled.ok) throw new Error(`live graph failed compilation: ${JSON.stringify(compiled.findings)}`);
  return compiled.graph;
}

try {
  const workspaceRoot = join(root, "workspace");
  const runRoot = join(root, "runs");
  mkdirSync(join(workspaceRoot, "src"), { recursive: true });
  writeFileSync(join(workspaceRoot, "src", "evaluation-router.ts"), [
    "export function routeEvaluation(level) {",
    "  return level === 'skill' ? 'skill-suite' : 'golden-suite';",
    "}",
    "",
  ].join("\n"));
  writeFileSync(join(workspaceRoot, "src", "index.ts"), "export { routeEvaluation } from './evaluation-router.js';\n");
  const initialized = spawnSync("git", ["init", "-q"], { cwd: workspaceRoot, shell: false, encoding: "utf8" });
  if (initialized.status !== 0) throw new Error("unable to initialize the synthetic git fixture");
  const initialGitStatus = spawnSync("git", ["status", "--porcelain=v1"], { cwd: workspaceRoot, shell: false, encoding: "utf8" });
  if (initialGitStatus.status !== 0) throw new Error("unable to capture the synthetic git fixture state");

  const executor = new ClaudeCodeExecutor({
    executable: environment[["ARIADNEV", "CLAUDE", "BIN"].join("_")] ?? "claude",
    expectedRuntimeVersion,
    model,
    authenticationHome: homedir(),
    sourceEnvironment: environment,
    maxOutputBytes: 2 * 1024 * 1024,
  });
  const capability = executor.probe(["state:write", "workspace:read", "execution:structured-output"]);
  if (capability.status !== "supported") {
    skip({
      schemaVersion: 1,
      status: "skipped",
      reason: capability.reason,
      runtimeVersion: capability.runtimeVersion,
      expectedRuntimeVersion,
    });
  }

  const compiled = graph();
  const context = createGraphRunContext({ graph: compiled, runId: "run.live-claude-read-only" });
  const result = await runGraph({
    graph: compiled,
    executor,
    eventStore: createEventStore({ root: runRoot, context }),
    checkpointStore: createCheckpointStore({ root: runRoot, runId: context.runId }),
    workspaceRoot,
    instruction: [
      "Inspect the bounded synthetic repository using only read-only tools.",
      "Find which source module owns evaluation routing, return concise facts, and cite the source-relative file.",
      "Do not change the workspace.",
    ].join("\n"),
  });
  const gitStatus = spawnSync("git", ["status", "--porcelain=v1"], { cwd: workspaceRoot, shell: false, encoding: "utf8" });
  const totalTokens = result.metrics.inputTokens === null || result.metrics.outputTokens === null
    ? null
    : result.metrics.inputTokens + result.metrics.outputTokens;
  const expectedEvidence = result.evidenceRefs.includes("src/evaluation-router.ts");
  const passed = result.status === "completed"
    && result.trajectory.promotable
    && result.workspaceMutations.length === 0
    && result.policyViolations.length === 0
    && gitStatus.status === 0
    && gitStatus.stdout === initialGitStatus.stdout
    && expectedEvidence
    && totalTokens !== null
    && totalTokens <= 30000
    && executor.activeProcessCount === 0;
  const output = {
    schemaVersion: 1,
    status: passed ? "pass" : "fail",
    environment: { provider: "claude-code", runtimeVersion: capability.runtimeVersion, model },
    outcome: {
      terminal: result.status,
      trajectoryPromotable: result.trajectory.promotable,
      expectedEvidence,
      eventCount: result.events.length,
      executorFailure: result.executorFailure,
    },
    safety: {
      workspaceMutations: result.workspaceMutations.length,
      policyViolations: result.policyViolations.length,
      gitUnchanged: gitStatus.status === 0 && gitStatus.stdout === initialGitStatus.stdout,
      activeProcesses: executor.activeProcessCount,
    },
    performance: {
      elapsedMs: Number(result.metrics.elapsedMs.toFixed(2)),
      providerElapsedMs: Number(result.metrics.providerElapsedMs.toFixed(2)),
      orchestrationOverheadMs: Number(result.metrics.orchestrationOverheadMs.toFixed(2)),
      inputTokens: result.metrics.inputTokens,
      cachedInputTokens: result.metrics.cachedInputTokens,
      outputTokens: result.metrics.outputTokens,
      reasoningTokens: result.metrics.reasoningTokens,
      totalTokens,
      tokenBudget: 30000,
      tokenBudgetPassed: totalTokens !== null && totalTokens <= 30000,
    },
    comparison: {
      baselineVerdict: "incomplete",
      baselineTokens: null,
      currentVerdict: passed ? "pass" : "fail",
      tokenDelta: null,
      tokenDeltaReason: "baseline telemetry unavailable",
    },
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (!passed) process.exitCode = 1;
} catch (error) {
  if (!(error instanceof LiveProbeSkip)) {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
} finally {
  rmSync(root, { recursive: true, force: true });
}
