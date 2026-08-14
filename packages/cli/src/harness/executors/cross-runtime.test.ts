import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { compileGraph, PORTABLE_GRAPH_CAPABILITY_CONTRACT } from "../../graph/compile-graph.js";
import { registryFor, workflowFixture } from "../../graph/graph-test-fixtures.js";
import { createCheckpointStore } from "../events/checkpoint-store.js";
import { createEventStore } from "../events/event-store.js";
import { createGraphRunContext, runGraph } from "../run-graph.js";
import { ClaudeCodeExecutor } from "./claude-code-executor.js";
import { CodexExecutor } from "./codex-executor.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    chmodSync(root, 0o700);
    rmSync(root, { recursive: true, force: true });
  }
});

function runtimeFixture() {
  const root = mkdtempSync(join(tmpdir(), "ariadnev-cross-runtime-"));
  roots.push(root);
  const script = join(root, "runtime.mjs");
  writeFileSync(script, `
const [provider, ...args] = process.argv.slice(2);
if (args.includes("--version")) {
  process.stdout.write(provider === "codex" ? "codex-cli 0.147.0\\n" : "2.1.226 (Claude Code)\\n");
  process.exit(0);
}
if (args.includes("--help")) {
  process.stdout.write(provider === "codex"
    ? "--json --ephemeral --ignore-user-config --ignore-rules --sandbox --output-schema --cd\\n"
    : "--print --output-format --json-schema --permission-mode --no-session-persistence --settings --strict-mcp-config --mcp-config --tools --allowedTools --model --safe-mode --no-chrome --disable-slash-commands\\n");
  process.exit(0);
}
let input = "";
for await (const chunk of process.stdin) input += chunk;
const node = input.match(/Node: ([a-z0-9._-]+)/)?.[1];
const writesLine = (input.match(/Allowed transient state writes: ([^\\n]+)/)?.[1] ?? "none").replace(/\\.$/, "");
const fields = writesLine === "none" ? [] : writesLine.split(", ");
const values = {
  request: "Find the router.",
  facts: { files: ["src/router.ts"] },
  answer: "src/router.ts owns routing",
  proof: ["src/router.ts"],
};
const payload = {
  schemaVersion: 1,
  writes: Object.fromEntries(fields.map((field) => [field, JSON.stringify(values[field])])),
  evidenceRefs: node === "intake" ? [] : ["src/router.ts"],
};
if (provider === "codex") {
  process.stdout.write(JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: JSON.stringify(payload) } }) + "\\n");
  process.stdout.write(JSON.stringify({ type: "turn.completed", usage: { input_tokens: 10, cached_input_tokens: 2, output_tokens: 4, reasoning_output_tokens: 1 } }) + "\\n");
} else {
  process.stdout.write(JSON.stringify({ type: "result", subtype: "success", is_error: false, structured_output: payload, usage: { input_tokens: 10, cache_read_input_tokens: 2, output_tokens: 4 } }) + "\\n");
}
`);
  const workspaceRoot = join(root, "workspace");
  mkdirSync(join(workspaceRoot, "src"), { recursive: true });
  writeFileSync(join(workspaceRoot, "src", "router.ts"), "export const route = true;\n");
  const codexHome = join(root, "codex-home");
  const claudeHome = join(root, "claude-home");
  mkdirSync(codexHome);
  mkdirSync(claudeHome);
  return { root, script, workspaceRoot, codexHome, claudeHome };
}

describe("cross-runtime graph conformance", () => {
  it("executes one provider-neutral graph through Codex and Claude Code", async () => {
    const current = runtimeFixture();
    const source = workflowFixture("read-only-delivery");
    const compiled = compileGraph(source, registryFor([source]), PORTABLE_GRAPH_CAPABILITY_CONTRACT);
    if (!compiled.ok) throw new Error(JSON.stringify(compiled.findings));
    const executors = [
      new CodexExecutor({
        executable: process.execPath,
        baseArgs: [current.script, "codex"],
        expectedRuntimeVersion: "0.147.0",
        model: "fixture",
        codexHome: current.codexHome,
      }),
      new ClaudeCodeExecutor({
        executable: process.execPath,
        baseArgs: [current.script, "claude"],
        expectedRuntimeVersion: "2.1.226",
        model: "fixture",
        claudeConfigDir: current.claudeHome,
      }),
    ];

    const outcomes = [];
    for (const executor of executors) {
      const runId = `run.cross-${executor.provider}`;
      const context = createGraphRunContext({ graph: compiled.graph, runId });
      outcomes.push(await runGraph({
        graph: compiled.graph,
        executor,
        eventStore: createEventStore({ root: join(current.root, "runs"), context }),
        checkpointStore: createCheckpointStore({ root: join(current.root, "runs"), runId }),
        workspaceRoot: current.workspaceRoot,
        instruction: "Find the router.",
      }));
    }

    if (outcomes.some((outcome) => outcome.status !== "completed")) {
      throw new Error(JSON.stringify(outcomes.map((outcome) => ({
        status: outcome.status,
        failure: outcome.executorFailure,
        state: outcome.state,
        executor: outcome.executor,
      })), null, 2));
    }
    expect(outcomes.map((outcome) => outcome.status)).toEqual(["completed", "completed"]);
    expect(outcomes[0].state).toEqual(outcomes[1].state);
    expect(outcomes.every((outcome) => outcome.trajectory.promotable)).toBe(true);
    expect(outcomes.every((outcome) => outcome.workspaceMutations.length === 0)).toBe(true);
    expect(outcomes.every((outcome) => outcome.policyViolations.length === 0)).toBe(true);
    expect(outcomes.map((outcome) => outcome.executor?.provider)).toEqual(["codex", "claude-code"]);
  });
});
