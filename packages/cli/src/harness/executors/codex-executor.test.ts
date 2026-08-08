import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createExecutorRequest } from "./executor.js";
import { CodexExecutor } from "./codex-executor.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    chmodSync(root, 0o700);
    rmSync(root, { recursive: true, force: true });
  }
});

function fixture(mode = "success", auxiliary = "unused") {
  const root = mkdtempSync(join(tmpdir(), "vcskill-codex-executor-"));
  roots.push(root);
  const workspaceRoot = join(root, "workspace");
  const codexHome = join(root, "codex-home");
  const runtime = join(root, "fake-codex.mjs");
  mkdirSync(workspaceRoot);
  mkdirSync(codexHome);
  writeFileSync(join(root, "keep"), "fixture");
  writeFileSync(runtime, `
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";

const mode = process.argv[2];
const auxiliary = process.argv[3];
const args = process.argv.slice(4);
const environment = process[["e", "nv"].join("")];
const homeKey = ["H", "OME"].join("");
const codexHomeKey = ["CODEX", "_HOME"].join("");
if (args.includes("--version")) {
  if (mode === "probe-environment" && (environment[homeKey] !== auxiliary || environment[codexHomeKey] !== auxiliary)) process.exit(9);
  console.log("codex-cli 0.147.0");
  process.exit(0);
}
if (args.includes("exec") && args.includes("--help")) {
  if (mode === "probe-environment" && (environment[homeKey] !== auxiliary || environment[codexHomeKey] !== auxiliary)) process.exit(9);
  console.log("--json --ephemeral --ignore-user-config --ignore-rules --sandbox --output-schema --cd");
  process.exit(0);
}

let instruction = "";
for await (const chunk of process.stdin) instruction += chunk;
const emit = (value) => process.stdout.write(JSON.stringify(value) + "\\n");

if (mode === "hang") {
  const child = spawn(process.execPath, ["-e", "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"], { stdio: "ignore" });
  writeFileSync(auxiliary, String(child.pid));
  setInterval(() => {}, 1000);
} else if (mode === "output-limit") {
  process.stdout.write("x".repeat(64 * 1024));
} else if (mode === "malformed-jsonl") {
  process.stdout.write("{not-json}\\n");
} else if (mode === "provider-error") {
  process.stderr.write("synthetic provider failure\\n");
  process.exit(7);
} else {
  if (mode === "success-background") {
    const child = spawn(process.execPath, ["-e", "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"], { stdio: "ignore" });
    child.unref();
    writeFileSync(auxiliary, String(child.pid));
  }
  const facts = {
        ok: true,
        instructionOnStdin: instruction.includes("untrusted request"),
        omittedEnvironment: environment.UNLISTED_VALUE === undefined,
        isolatedHome: environment.HOME === process.cwd(),
      };
  const writes = mode === "extra-state"
    ? { facts: JSON.stringify(facts), unexpected: JSON.stringify("blocked") }
    : { facts: JSON.stringify(facts) };
  const evidenceRefs = mode === "unsafe-evidence" ? ["../outside.txt"] : ["src/router.ts"];
  emit({ type: "thread.started", thread_id: "thread-test" });
  emit({ type: "turn.started" });
  emit({ type: "item.completed", item: { type: "agent_message", text: JSON.stringify({ schemaVersion: 1, writes, evidenceRefs }) } });
  emit({
    type: "turn.completed",
    usage: { input_tokens: 21, cached_input_tokens: 8, output_tokens: 5, reasoning_output_tokens: 3 },
  });
}
`, { mode: 0o700 });
  return {
    root,
    workspaceRoot,
    runtime,
    executor: new CodexExecutor({
      executable: process.execPath,
      baseArgs: [runtime, mode, mode === "probe-environment" ? codexHome : auxiliary],
      expectedRuntimeVersion: "0.147.0",
      model: "gpt-5.4-mini",
      codexHome,
      maxOutputBytes: 8 * 1024,
      terminationGraceMs: 25,
      sourceEnvironment: { PATH: "/usr/bin:/bin", UNLISTED_VALUE: "do-not-forward" },
    }),
  };
}

function request(workspaceRoot: string, instruction = "untrusted request") {
  return createExecutorRequest({
    runId: "run.codex-test",
    node: { id: "inspect", kind: "skill", ref: "scout" },
    workspaceRoot,
    instruction,
    state: { request: "inspect the repository" },
    allowedStateWrites: ["facts"],
    requiredCapabilities: ["state:read", "state:write", "workspace:read"],
    timeoutMs: 1_000,
    policy: { mode: "read-only" },
  });
}

async function waitForFile(path: string): Promise<void> {
  const deadline = Date.now() + 3_000;
  while (!existsSync(path) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));
  if (!existsSync(path)) throw new Error(`timed out waiting for ${path}`);
}

async function waitForExit(pid: number): Promise<void> {
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0);
    } catch {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // The process exited between the final probe and cleanup.
  }
  throw new Error(`process ${pid} was not reaped`);
}

describe("CodexExecutor", () => {
  it("probes the pinned runtime and normalizes bounded structured output", async () => {
    const { executor, workspaceRoot } = fixture();
    const probe = executor.probe(["state:read", "workspace:read", "execution:structured-output"]);
    expect(probe).toMatchObject({
      provider: "codex",
      runtimeVersion: "0.147.0",
      model: "gpt-5.4-mini",
      status: "supported",
      missing: [],
    });

    const result = await executor.execute(request(workspaceRoot), new AbortController().signal);
    expect(result).toMatchObject({
      status: "completed",
      transientStateWrites: { facts: { ok: true, instructionOnStdin: true, omittedEnvironment: true, isolatedHome: true } },
      evidenceRefs: ["src/router.ts"],
      usage: { inputTokens: 21, cachedInputTokens: 8, outputTokens: 5, reasoningTokens: 3 },
    });
    expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(executor.activeProcessCount).toBe(0);
  });

  it("reuses one pinned runtime-contract probe for the executor lifetime", () => {
    const current = fixture();
    expect(current.executor.probe(["workspace:read"])).toMatchObject({ status: "supported" });
    rmSync(current.runtime);
    expect(current.executor.probe(["workspace:read"])).toMatchObject({
      status: "supported",
      runtimeVersion: "0.147.0",
    });
  });

  it("passes adversarial instructions only through stdin without shell interpolation", async () => {
    const { executor, root, workspaceRoot } = fixture();
    const marker = join(root, "shell-injection-marker");
    const result = await executor.execute(
      request(workspaceRoot, `untrusted request $(touch ${marker})`),
      new AbortController().signal,
    );
    expect(result.status).toBe("completed");
    expect(existsSync(marker)).toBe(false);
    expect(executor.activeProcessCount).toBe(0);
  });

  it("reaps a process tree after the provider reports successful completion", async () => {
    const root = mkdtempSync(join(tmpdir(), "vcskill-codex-success-cleanup-"));
    roots.push(root);
    const pidPath = join(root, "grandchild.pid");
    const { executor, workspaceRoot } = fixture("success-background", pidPath);
    const result = await executor.execute(request(workspaceRoot), new AbortController().signal);
    expect(result.status).toBe("completed");
    const grandchildPid = Number(readFileSync(pidPath, "utf8"));
    await waitForExit(grandchildPid);
    expect(executor.activeProcessCount).toBe(0);
  });

  it("reports missing executables and runtime version drift as unsupported", () => {
    const missing = new CodexExecutor({ executable: join(tmpdir(), "vcskill-missing-codex"), expectedRuntimeVersion: "0.147.0", model: "pinned" });
    expect(missing.probe(["workspace:read"])).toMatchObject({ status: "unsupported", reason: "runtime-unavailable" });

    const { runtime } = fixture();
    const drifted = new CodexExecutor({ executable: process.execPath, baseArgs: [runtime, "success", "unused"], expectedRuntimeVersion: "0.148.0", model: "pinned" });
    expect(drifted.probe(["workspace:read"])).toMatchObject({ status: "unsupported", reason: "runtime-version-drift" });
  });

  it("probes with the isolated home instead of ambient user configuration", () => {
    const { executor } = fixture("probe-environment");
    expect(executor.probe(["workspace:read"])).toMatchObject({ status: "supported", runtimeVersion: "0.147.0" });
  });

  it("fails closed with normalized evidence when isolated roots disappear", async () => {
    const supported = fixture();
    const missingHome = new CodexExecutor({
      executable: process.execPath,
      baseArgs: [supported.runtime, "success", "unused"],
      expectedRuntimeVersion: "0.147.0",
      model: "gpt-5.4-mini",
      codexHome: join(supported.root, "missing-codex-home"),
    });
    await expect(missingHome.execute(request(supported.workspaceRoot), new AbortController().signal)).resolves.toMatchObject({
      status: "unsupported",
      failure: { code: "policy-unsupported" },
    });

    await expect(supported.executor.execute(
      request(join(supported.root, "missing-workspace")),
      new AbortController().signal,
    )).resolves.toMatchObject({ status: "failed", failure: { code: "internal" } });
  });

  it("terminates a timed-out process tree and leaves no owned child", async () => {
    const root = mkdtempSync(join(tmpdir(), "vcskill-codex-timeout-"));
    roots.push(root);
    const pidPath = join(root, "grandchild.pid");
    const { executor, workspaceRoot } = fixture("hang", pidPath);
    const timedRequest = { ...request(workspaceRoot), timeoutMs: 80 };
    const pending = executor.execute(timedRequest, new AbortController().signal);
    await waitForFile(pidPath);
    const grandchildPid = Number(readFileSync(pidPath, "utf8"));
    const result = await pending;
    expect(result).toMatchObject({ status: "timed-out", failure: { code: "timeout" } });
    await waitForExit(grandchildPid);
    expect(executor.activeProcessCount).toBe(0);
  });

  it("honors external cancellation and reaps the process", async () => {
    const root = mkdtempSync(join(tmpdir(), "vcskill-codex-cancel-"));
    roots.push(root);
    const pidPath = join(root, "grandchild.pid");
    const { executor, workspaceRoot } = fixture("hang", pidPath);
    const controller = new AbortController();
    const pending = executor.execute(request(workspaceRoot), controller.signal);
    await waitForFile(pidPath);
    controller.abort();
    const result = await pending;
    expect(result).toMatchObject({ status: "cancelled", failure: { code: "cancelled" } });
    await waitForExit(Number(readFileSync(pidPath, "utf8")));
    expect(executor.activeProcessCount).toBe(0);
  });

  it.each([
    ["output-limit", "output-limit", "output-limit"],
    ["malformed-jsonl", "failed", "malformed-output"],
    ["provider-error", "failed", "provider-exit"],
  ] as const)("distinguishes %s failures", async (mode, status, code) => {
    const { executor, workspaceRoot } = fixture(mode);
    const result = await executor.execute(request(workspaceRoot), new AbortController().signal);
    expect(result).toMatchObject({ status, failure: { code } });
    expect(executor.activeProcessCount).toBe(0);
  });

  it("rejects unsupported authority and malformed model state/evidence", async () => {
    const supported = fixture();
    const ambientHome = new CodexExecutor({
      executable: process.execPath,
      baseArgs: [supported.runtime, "success", "unused"],
      expectedRuntimeVersion: "0.147.0",
      model: "gpt-5.4-mini",
    });
    expect(await ambientHome.execute(request(supported.workspaceRoot), new AbortController().signal)).toMatchObject({
      status: "unsupported",
      failure: { code: "policy-unsupported", message: expect.stringMatching(/controller-owned isolated home/) },
    });
    const denied = await supported.executor.execute(createExecutorRequest({
      ...request(supported.workspaceRoot),
      requiredCapabilities: ["workspace:write"],
    }), new AbortController().signal);
    expect(denied).toMatchObject({ status: "unsupported", failure: { code: "policy-unsupported" } });

    for (const mode of ["extra-state", "unsafe-evidence"] as const) {
      const current = fixture(mode);
      const result = await current.executor.execute(request(current.workspaceRoot), new AbortController().signal);
      expect(result).toMatchObject({ status: "failed", failure: { code: "malformed-output" } });
      expect(current.executor.activeProcessCount).toBe(0);
    }
  });
});
