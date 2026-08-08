import { chmodSync, cpSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createExecutorProbe,
  createExecutorResult,
  type ExecutorRequestV1,
  type GraphExecutorV1,
  type JsonValueV1,
} from "../harness/executors/executor.js";
import { createExecutorRegistry } from "../harness/executors/executor-registry.js";
import { runWorkflowCommand } from "./run-command.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    chmodSync(root, 0o700);
    rmSync(root, { recursive: true, force: true });
  }
});

const values: Record<string, JsonValueV1> = {
  request: "Find the router.",
  facts: { files: ["src/router.ts"] },
  answer: "src/router.ts owns routing",
  proof: ["src/router.ts"],
};

class FixtureExecutor implements GraphExecutorV1 {
  readonly provider = "codex";
  readonly probeResult = createExecutorProbe({
    provider: this.provider,
    adapterVersion: "1.0.0",
    runtimeVersion: "0.147.0",
    model: "fixture",
    status: "supported",
    available: [
      "state:read", "state:write", "workspace:read", "process:execute", "graph:interrupt",
      "graph:retry", "graph:routing", "execution:cancel", "execution:structured-output",
    ],
    missing: [],
  });

  probe() { return this.probeResult; }

  async execute(request: ExecutorRequestV1, signal: AbortSignal) {
    if (signal.aborted) return createExecutorResult({
      status: "cancelled",
      probe: this.probeResult,
      elapsedMs: 0,
      evidenceRefs: [],
      usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0 },
      transientStateWrites: {},
      failure: { code: "cancelled", message: "cancelled", transient: false },
    });
    return createExecutorResult({
      status: "completed",
      probe: this.probeResult,
      elapsedMs: 1,
      evidenceRefs: request.node.id === "intake" ? [] : ["src/router.ts"],
      usage: { inputTokens: 10, cachedInputTokens: 2, outputTokens: 4, reasoningTokens: 1 },
      transientStateWrites: Object.fromEntries(request.allowedStateWrites.map((field) => [field, values[field]])),
    });
  }
}

class HangingExecutor extends FixtureExecutor {
  entered!: () => void;
  readonly started = new Promise<void>((resolve) => { this.entered = resolve; });

  override async execute(request: ExecutorRequestV1, signal: AbortSignal) {
    this.entered();
    await new Promise<void>((resolve) => {
      if (signal.aborted) resolve();
      else signal.addEventListener("abort", () => resolve(), { once: true });
    });
    return super.execute(request, signal);
  }
}

class CrashOnceExecutor extends FixtureExecutor {
  private crashed = false;

  override async execute(request: ExecutorRequestV1, signal: AbortSignal) {
    if (!this.crashed) {
      this.crashed = true;
      throw new Error("synthetic provider crash");
    }
    return super.execute(request, signal);
  }
}

function fixture(executor: GraphExecutorV1 = new FixtureExecutor()) {
  const root = mkdtempSync(join(tmpdir(), "vcskill-run-command-"));
  const runsRoot = mkdtempSync(join(tmpdir(), "vcskill-run-storage-"));
  roots.push(root, runsRoot);
  return {
    root,
    deps: {
      kitRoot: join(process.cwd(), "kit"),
      runsRoot,
      registry: createExecutorRegistry([executor]),
      now: () => "2026-08-08T13:00:00.000Z",
      randomId: () => "abcdef0123456789",
      cancellationPollMs: 5,
    },
  };
}

describe("run workflow command", () => {
  it("validates and dry-runs a canonical graph without creating a run", async () => {
    const current = fixture();
    const validated = await runWorkflowCommand({
      action: "validate",
      workflow: "read-only-delivery",
      workspaceRoot: current.root,
    }, current.deps);
    expect(validated).toMatchObject({ schemaVersion: 1, action: "validate", ok: true, status: "valid", workflow: "read-only-delivery" });

    const dry = await runWorkflowCommand({
      action: "dry-run",
      workflow: "read-only-delivery",
      runtime: "codex",
      workspaceRoot: current.root,
    }, current.deps);
    expect(dry).toMatchObject({ schemaVersion: 1, action: "dry-run", ok: true, status: "ready", runtime: "codex" });

    const denied = await runWorkflowCommand({
      action: "dry-run",
      workflow: "safe-change-delivery",
      runtime: "claude-code",
      workspaceRoot: current.root,
    }, current.deps);
    expect(denied).toMatchObject({
      schemaVersion: 1,
      action: "dry-run",
      ok: false,
      status: "policy-denied",
      runtime: "claude-code",
    });
  });

  it("runs, persists status, resumes idempotently, and refuses runtime drift", async () => {
    const current = fixture();
    const started = await runWorkflowCommand({
      action: "run",
      workflow: "read-only-delivery",
      runtime: "codex",
      runId: "run.public-test",
      workspaceRoot: current.root,
      instruction: "Find the router.",
    }, current.deps);
    expect(started).toMatchObject({ ok: true, action: "run", status: "completed", runId: "run.public-test", runtime: "codex" });

    expect(await runWorkflowCommand({ action: "status", runId: "run.public-test", workspaceRoot: current.root }, current.deps)).toMatchObject({
      ok: true,
      action: "status",
      status: "completed",
      runId: "run.public-test",
    });
    expect(await runWorkflowCommand({
      action: "resume",
      runId: "run.public-test",
      runtime: "codex",
      workspaceRoot: current.root,
      instruction: "Find the router.",
    }, current.deps)).toMatchObject({ ok: true, action: "resume", status: "completed" });

    await expect(runWorkflowCommand({
      action: "resume",
      runId: "run.public-test",
      runtime: "claude-code",
      workspaceRoot: current.root,
      instruction: "Find the router.",
    }, current.deps)).rejects.toThrow(/runtime.*change|runtime.*drift/i);
  });

  it("propagates an external cancel request to the active executor", async () => {
    const executor = new HangingExecutor();
    const current = fixture(executor);
    const running = runWorkflowCommand({
      action: "run",
      workflow: "read-only-delivery",
      runtime: "codex",
      runId: "run.cancel-test",
      workspaceRoot: current.root,
      instruction: "Find the router.",
    }, current.deps);
    await executor.started;
    expect(await runWorkflowCommand({ action: "cancel", runId: "run.cancel-test", workspaceRoot: current.root }, current.deps)).toMatchObject({
      ok: true,
      action: "cancel",
      status: "cancel-requested",
    });
    await expect(running).resolves.toMatchObject({ status: "cancelled" });
  });

  it("honors a persisted cancel request before resumed execution can advance", async () => {
    const current = fixture(new CrashOnceExecutor());
    current.deps.cancellationPollMs = 60_000;
    await expect(runWorkflowCommand({
      action: "run",
      workflow: "read-only-delivery",
      runtime: "codex",
      runId: "run.cancel-before-resume",
      workspaceRoot: current.root,
      instruction: "Find the router.",
    }, current.deps)).rejects.toThrow(/synthetic provider crash/i);
    await runWorkflowCommand({ action: "cancel", runId: "run.cancel-before-resume", workspaceRoot: current.root }, current.deps);
    await expect(runWorkflowCommand({
      action: "resume",
      runId: "run.cancel-before-resume",
      runtime: "codex",
      workspaceRoot: current.root,
      instruction: "Find the router.",
    }, current.deps)).resolves.toMatchObject({ ok: false, status: "cancelled" });
  });

  it("keeps status and emergency cancellation available across graph drift", async () => {
    const current = fixture(new CrashOnceExecutor());
    const copiedKit = join(current.root, "kit");
    cpSync(join(process.cwd(), "kit"), copiedKit, { recursive: true });
    current.deps.kitRoot = copiedKit;
    await expect(runWorkflowCommand({
      action: "run",
      workflow: "read-only-delivery",
      runtime: "codex",
      runId: "run.graph-drift-control",
      workspaceRoot: current.root,
      instruction: "Find the router.",
    }, current.deps)).rejects.toThrow(/synthetic provider crash/i);

    const graphPath = join(copiedKit, "workflows", "read-only-delivery.json");
    writeFileSync(graphPath, readFileSync(graphPath, "utf8").replace('"graph": "1.0.0"', '"graph": "1.0.1"'));
    await expect(runWorkflowCommand({ action: "status", runId: "run.graph-drift-control", workspaceRoot: current.root }, current.deps))
      .resolves.toMatchObject({ status: "running", graph: { id: "read-only-delivery", version: "1.0.0" } });
    await expect(runWorkflowCommand({ action: "cancel", runId: "run.graph-drift-control", workspaceRoot: current.root }, current.deps))
      .resolves.toMatchObject({ status: "cancel-requested", graph: { id: "read-only-delivery", version: "1.0.0" } });
    await expect(runWorkflowCommand({
      action: "resume",
      runId: "run.graph-drift-control",
      runtime: "codex",
      workspaceRoot: current.root,
      instruction: "Find the router.",
    }, current.deps)).rejects.toThrow(/graph.*drift/i);
  });

  it("refuses to resume stale state after workspace content drift", async () => {
    const current = fixture(new CrashOnceExecutor());
    const source = join(current.root, "input.ts");
    writeFileSync(source, "export const version = 1;\n");
    await expect(runWorkflowCommand({
      action: "run",
      workflow: "read-only-delivery",
      runtime: "codex",
      runId: "run.workspace-drift",
      workspaceRoot: current.root,
      instruction: "Find the router.",
    }, current.deps)).rejects.toThrow(/synthetic provider crash/i);
    writeFileSync(source, "export const version = 2;\n");
    await expect(runWorkflowCommand({
      action: "resume",
      runId: "run.workspace-drift",
      runtime: "codex",
      workspaceRoot: current.root,
      instruction: "Find the router.",
    }, current.deps)).rejects.toThrow(/workspace drift/i);
  });

  it("resumes from the exact private state snapshot after a provider crash", async () => {
    const current = fixture(new CrashOnceExecutor());
    await expect(runWorkflowCommand({
      action: "run",
      workflow: "read-only-delivery",
      runtime: "codex",
      runId: "run.crash-resume",
      workspaceRoot: current.root,
      instruction: "Find the router.",
    }, current.deps)).rejects.toThrow(/synthetic provider crash/i);

    await expect(runWorkflowCommand({
      action: "resume",
      runId: "run.crash-resume",
      runtime: "codex",
      workspaceRoot: current.root,
      instruction: "Find the router.",
    }, current.deps)).resolves.toMatchObject({
      ok: true,
      status: "completed",
      result: { resume: { resumed: true, recoveredRunningAttempt: true } },
    });
  });

  it("does not fall back from an explicit unavailable runtime", async () => {
    const current = fixture();
    await expect(runWorkflowCommand({
      action: "dry-run",
      workflow: "read-only-delivery",
      runtime: "claude-code",
      workspaceRoot: current.root,
    }, current.deps)).resolves.toMatchObject({
      ok: false,
      status: "unsupported",
      runtime: "claude-code",
      reason: "unknown-runtime",
    });
  });

  it("keeps manifest and control records private and free of raw task data", async () => {
    const current = fixture();
    const instruction = `private task rooted at ${current.root}`;
    await runWorkflowCommand({
      action: "run",
      workflow: "read-only-delivery",
      runtime: "codex",
      runId: "run.private-records",
      workspaceRoot: current.root,
      instruction,
    }, current.deps);
    const runDirectory = join(current.deps.runsRoot, "run.private-records");
    for (const name of ["manifest.json", "events.jsonl", "checkpoint.json"]) {
      const path = join(runDirectory, name);
      const stored = readFileSync(path, "utf8");
      expect(stored).not.toContain(instruction);
      expect(stored).not.toContain(current.root);
      expect(statSync(path).mode & 0o777).toBe(0o600);
    }
  });

  it("refuses run storage inside a read-only workspace", async () => {
    const current = fixture();
    await expect(runWorkflowCommand({
      action: "run",
      workflow: "read-only-delivery",
      runtime: "codex",
      runId: "run.storage-boundary",
      workspaceRoot: current.root,
      instruction: "Find the router.",
    }, { ...current.deps, runsRoot: join(current.root, "runs") })).rejects.toThrow(/outside.*workspace/i);
  });
});
