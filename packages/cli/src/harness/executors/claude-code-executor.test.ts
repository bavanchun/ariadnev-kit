import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ClaudeCodeExecutor } from "./claude-code-executor.js";
import { createExecutorRequest } from "./executor.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    chmodSync(root, 0o700);
    rmSync(root, { recursive: true, force: true });
  }
});

function fixture(mode = "success", auxiliary = "unused") {
  const root = mkdtempSync(join(tmpdir(), "ariadnev-claude-executor-"));
  roots.push(root);
  const workspaceRoot = join(root, "workspace");
  const claudeHome = join(root, "claude-home");
  const runtime = join(root, "fake-claude.mjs");
  mkdirSync(workspaceRoot);
  mkdirSync(claudeHome);
  writeFileSync(runtime, `
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";

const mode = process.argv[2];
const auxiliary = process.argv[3];
const expectedConfig = process.argv[4];
const args = process.argv.slice(5);
const environment = process[["e", "nv"].join("")];
const homeKey = ["H", "OME"].join("");
const configKey = ["CLAUDE", "_CONFIG", "_DIR"].join("");
if (args.includes("--version")) {
  if (mode === "probe-environment" && (environment[homeKey] !== expectedConfig || environment[configKey] !== expectedConfig)) process.exit(9);
  console.log("2.1.226 (Claude Code)");
  process.exit(0);
}
if (args.includes("--help")) {
  if (mode === "probe-environment" && (environment[homeKey] !== expectedConfig || environment[configKey] !== expectedConfig)) process.exit(9);
  console.log("--print --output-format --json-schema --permission-mode --no-session-persistence --settings --strict-mcp-config --mcp-config --tools --allowedTools --model --safe-mode --no-chrome --disable-slash-commands");
  process.exit(0);
}

let instruction = "";
for await (const chunk of process.stdin) instruction += chunk;
if (mode === "hang") {
  const child = spawn(process.execPath, ["-e", "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"], { stdio: "ignore" });
  writeFileSync(auxiliary, String(child.pid));
  setInterval(() => {}, 1000);
} else if (mode === "output-limit") {
  process.stdout.write("x".repeat(64 * 1024));
} else if (mode === "malformed-json") {
  process.stdout.write("{not-json}\\n");
} else if (mode === "provider-error") {
  process.stderr.write("synthetic provider failure\\n");
  process.exit(7);
} else {
  const facts = {
    ok: true,
    instructionOnStdin: instruction.includes("untrusted request"),
    omittedEnvironment: environment.UNLISTED_VALUE === undefined,
    isolatedHome: mode === "auth-home"
      ? environment[homeKey] === expectedConfig && environment[configKey] === undefined
      : environment[homeKey] === process.cwd() && environment[configKey] === expectedConfig,
    safeFlags: args.includes("--safe-mode")
      && args.includes("dontAsk")
      && args.includes("--no-session-persistence")
      && args[args.indexOf("--tools") + 1] === "Read,Glob,Grep"
      && args[args.indexOf("--allowedTools") + 1] === "Read,Glob,Grep"
      && args[args.indexOf("--mcp-config") + 1] === JSON.stringify({ mcpServers: {} }),
  };
  const writes = mode === "extra-state"
    ? { facts: JSON.stringify(facts), unexpected: JSON.stringify("blocked") }
    : { facts: JSON.stringify(facts) };
  const evidenceRefs = mode === "unsafe-evidence" ? ["../outside.txt"] : ["src/router.ts"];
  process.stdout.write(JSON.stringify({
    type: "result",
    subtype: "success",
    is_error: false,
    structured_output: { schemaVersion: 1, writes, evidenceRefs },
    usage: { input_tokens: 21, cache_creation_input_tokens: 2, cache_read_input_tokens: 8, output_tokens: 5 },
  }) + "\\n");
}
`, { mode: 0o700 });
  return {
    root,
    workspaceRoot,
    runtime,
    claudeHome,
    executor: new ClaudeCodeExecutor({
      executable: process.execPath,
      baseArgs: [runtime, mode, auxiliary, claudeHome],
      expectedRuntimeVersion: "2.1.226",
      model: "sonnet",
      claudeConfigDir: claudeHome,
      maxOutputBytes: 8 * 1024,
      terminationGraceMs: 25,
      sourceEnvironment: { PATH: "/usr/bin:/bin", UNLISTED_VALUE: "do-not-forward" },
    }),
  };
}

function request(workspaceRoot: string, instruction = "untrusted request") {
  return createExecutorRequest({
    runId: "run.claude-test",
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
    // Process exited after the final probe.
  }
  throw new Error(`process ${pid} was not reaped`);
}

describe("ClaudeCodeExecutor", () => {
  it("probes the pinned runtime and normalizes bounded structured output", async () => {
    const current = fixture();
    expect(current.executor.probe(["state:read", "workspace:read", "execution:structured-output"])).toMatchObject({
      provider: "claude-code",
      runtimeVersion: "2.1.226",
      model: "sonnet",
      status: "supported",
      missing: [],
    });
    const result = await current.executor.execute(request(current.workspaceRoot), new AbortController().signal);
    expect(result).toMatchObject({
      status: "completed",
      transientStateWrites: {
        facts: { ok: true, instructionOnStdin: true, omittedEnvironment: true, isolatedHome: true, safeFlags: true },
      },
      evidenceRefs: ["src/router.ts"],
      usage: { inputTokens: 23, cachedInputTokens: 8, outputTokens: 5, reasoningTokens: null },
    });
    expect(current.executor.activeProcessCount).toBe(0);
  });

  it("reuses one pinned runtime-contract probe for the executor lifetime", () => {
    const current = fixture();
    expect(current.executor.probe(["workspace:read"])).toMatchObject({ status: "supported" });
    rmSync(current.runtime);
    expect(current.executor.probe(["workspace:read"])).toMatchObject({
      status: "supported",
      runtimeVersion: "2.1.226",
    });
  });

  it("keeps adversarial instructions on stdin and probes with isolated configuration", async () => {
    const current = fixture("probe-environment");
    expect(current.executor.probe(["workspace:read"])).toMatchObject({ status: "supported" });
    const marker = join(current.root, "shell-injection-marker");
    const result = await current.executor.execute(
      request(current.workspaceRoot, `untrusted request $(touch ${marker})`),
      new AbortController().signal,
    );
    expect(result.status).toBe("completed");
    expect(existsSync(marker)).toBe(false);
  });

  it("reports unavailable and drifted runtimes without fallback", () => {
    const missing = new ClaudeCodeExecutor({
      executable: join(tmpdir(), "ariadnev-missing-claude"),
      expectedRuntimeVersion: "2.1.226",
      model: "sonnet",
    });
    expect(missing.probe(["workspace:read"])).toMatchObject({ status: "unsupported", reason: "runtime-unavailable" });
    const current = fixture();
    const drifted = new ClaudeCodeExecutor({
      executable: process.execPath,
      baseArgs: [current.runtime, "success", "unused", current.claudeHome],
      expectedRuntimeVersion: "2.1.227",
      model: "sonnet",
    });
    expect(drifted.probe(["workspace:read"])).toMatchObject({ status: "unsupported", reason: "runtime-version-drift" });
  });

  it("supports normal OAuth discovery through an explicit authentication home under safe mode", async () => {
    const current = fixture();
    const executor = new ClaudeCodeExecutor({
      executable: process.execPath,
      baseArgs: [current.runtime, "auth-home", "unused", current.claudeHome],
      expectedRuntimeVersion: "2.1.226",
      model: "sonnet",
      authenticationHome: current.claudeHome,
    });
    await expect(executor.execute(request(current.workspaceRoot), new AbortController().signal)).resolves.toMatchObject({
      status: "completed",
      transientStateWrites: { facts: { isolatedHome: true, safeFlags: true } },
    });
    expect(executor.activeProcessCount).toBe(0);
  });

  it("honors timeout and cancellation while reaping the provider tree", async () => {
    for (const cancelled of [false, true]) {
      const root = mkdtempSync(join(tmpdir(), "ariadnev-claude-stop-"));
      roots.push(root);
      const pidPath = join(root, "grandchild.pid");
      const current = fixture("hang", pidPath);
      const controller = new AbortController();
      const pending = current.executor.execute({ ...request(current.workspaceRoot), timeoutMs: 1_000 }, controller.signal);
      await waitForFile(pidPath);
      if (cancelled) controller.abort();
      const result = await pending;
      expect(result).toMatchObject(cancelled
        ? { status: "cancelled", failure: { code: "cancelled" } }
        : { status: "timed-out", failure: { code: "timeout" } });
      await waitForExit(Number(readFileSync(pidPath, "utf8")));
      expect(current.executor.activeProcessCount).toBe(0);
    }
  });

  it.each([
    ["output-limit", "output-limit", "output-limit"],
    ["malformed-json", "failed", "malformed-output"],
    ["provider-error", "failed", "provider-exit"],
    ["extra-state", "failed", "malformed-output"],
    ["unsafe-evidence", "failed", "malformed-output"],
  ] as const)("fails closed for %s", async (mode, status, code) => {
    const current = fixture(mode);
    const result = await current.executor.execute(request(current.workspaceRoot), new AbortController().signal);
    expect(result).toMatchObject({ status, failure: { code } });
    expect(current.executor.activeProcessCount).toBe(0);
  });

  it("rejects missing config roots and unsupported mutation authority", async () => {
    const current = fixture();
    const missingHome = new ClaudeCodeExecutor({
      executable: process.execPath,
      baseArgs: [current.runtime, "success", "unused", current.claudeHome],
      expectedRuntimeVersion: "2.1.226",
      model: "sonnet",
      claudeConfigDir: join(current.root, "missing-home"),
    });
    await expect(missingHome.execute(request(current.workspaceRoot), new AbortController().signal)).resolves.toMatchObject({
      status: "unsupported",
      failure: { code: "policy-unsupported" },
    });
    const denied = await current.executor.execute(createExecutorRequest({
      ...request(current.workspaceRoot),
      requiredCapabilities: ["workspace:write"],
    }), new AbortController().signal);
    expect(denied).toMatchObject({ status: "unsupported", failure: { code: "policy-unsupported" } });
    const processDenied = await current.executor.execute(createExecutorRequest({
      ...request(current.workspaceRoot),
      requiredCapabilities: ["process:execute"],
    }), new AbortController().signal);
    expect(processDenied).toMatchObject({ status: "unsupported", failure: { code: "policy-unsupported" } });
  });
});
