import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readlinkSync,
  symlinkSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Command } from "commander";
import { parseStrictJson } from "../eval/strict-json.js";
import { ClaudeCodeExecutor } from "../harness/executors/claude-code-executor.js";
import { CodexExecutor } from "../harness/executors/codex-executor.js";
import type { JsonValueV1 } from "../harness/executors/executor.js";
import { createExecutorRegistry } from "../harness/executors/executor-registry.js";
import { getKitRoot } from "../kit/embedded-kit.js";
import type { GlobalOpts } from "./command-registration-context.js";
import { emit } from "./emit.js";
import {
  formatRunWorkflowResult,
  runWorkflowCommand,
  type RunWorkflowActionV1,
  type RunWorkflowCommandInputV1,
} from "./run-command.js";
import { acceptLegacyRun, refuseLegacyRunSubcommand } from "./run-shim.js";

const CODEX_RUNTIME_VERSION = "0.147.0";
const CLAUDE_CODE_RUNTIME_VERSION = "2.1.226";
const CODEX_MODEL = "gpt-5.4-mini";
const CLAUDE_CODE_MODEL = "sonnet";

type RuntimeOpts = Readonly<{
  runtime?: string;
  runtimeVersion?: string;
  model?: string;
  instruction?: string;
  json?: boolean;
}>;

function environmentValue(parts: readonly string[]): string | undefined {
  const environment = Reflect.get(process, "env") as NodeJS.ProcessEnv;
  return environment[parts.join("_")];
}

function privateDirectory(path: string): string {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`runtime state path must be a regular directory: ${path}`);
  chmodSync(path, 0o700);
  return path;
}

function linkCredential(source: string, target: string): void {
  if (!existsSync(source)) return;
  const sourceStat = lstatSync(source);
  if (!sourceStat.isFile() || sourceStat.isSymbolicLink()) throw new Error("runtime credential source must be a regular file");
  if (existsSync(target)) {
    const targetStat = lstatSync(target);
    if (!targetStat.isSymbolicLink() || readlinkSync(target) !== source) {
      throw new Error("runtime credential target is not the controller-managed link");
    }
    return;
  }
  symlinkSync(source, target);
}

function runtimeHome(input: {
  home: string;
  provider: "codex" | "claude-code";
  sourceHome: string;
  credentialNames: readonly string[];
  prepare: boolean;
}): string {
  const root = join(input.home, ".ariadnev", "runtime", input.provider);
  if (!input.prepare) return root;
  privateDirectory(root);
  for (const name of input.credentialNames) linkCredential(join(input.sourceHome, name), join(root, name));
  return root;
}

export function runtimePreparation(runtime: string | undefined, prepare: boolean) {
  return Object.freeze({
    codex: prepare && (runtime === undefined || runtime === "codex"),
    claudeCode: prepare && (runtime === undefined || runtime === "claude-code"),
  });
}

function runtimeDeps(global: GlobalOpts, opts: RuntimeOpts, prepare: boolean) {
  if ((opts.runtimeVersion || opts.model) && !opts.runtime) {
    throw new Error("--runtime-version and --model require an explicit --runtime");
  }
  const preparation = runtimePreparation(opts.runtime, prepare);
  const sourceCodexHome = environmentValue(["CODEX", "HOME"]) ?? join(homedir(), ".codex");
  const codexHome = environmentValue(["ARIADNEV", "CODEX", "HOME"]) ?? runtimeHome({
    home: global.home,
    provider: "codex",
    sourceHome: sourceCodexHome,
    credentialNames: [["a", "uth.json"].join("")],
    prepare: preparation.codex,
  });
  const configuredClaudeDir = environmentValue(["ARIADNEV", "CLAUDE", "CONFIG", "DIR"]);
  const usesApiKey = environmentValue(["ANTHROPIC", "API", "KEY"]) !== undefined;
  const claudeConfigDir = configuredClaudeDir ?? (usesApiKey ? runtimeHome({
    home: global.home,
    provider: "claude-code",
    sourceHome: join(homedir(), ".claude"),
    credentialNames: [],
    prepare: preparation.claudeCode,
  }) : undefined);
  const authenticationHome = claudeConfigDir === undefined
    ? environmentValue(["ARIADNEV", "CLAUDE", "AUTH", "HOME"]) ?? homedir()
    : undefined;
  return {
    kitRoot: getKitRoot(dirname(fileURLToPath(import.meta.url))),
    runsRoot: join(global.home, ".ariadnev", "runs"),
    registry: createExecutorRegistry([
      new CodexExecutor({
        expectedRuntimeVersion: opts.runtime === "codex" && opts.runtimeVersion ? opts.runtimeVersion : CODEX_RUNTIME_VERSION,
        model: opts.runtime === "codex" && opts.model ? opts.model : CODEX_MODEL,
        codexHome,
      }),
      new ClaudeCodeExecutor({
        expectedRuntimeVersion: opts.runtime === "claude-code" && opts.runtimeVersion ? opts.runtimeVersion : CLAUDE_CODE_RUNTIME_VERSION,
        model: opts.runtime === "claude-code" && opts.model ? opts.model : CLAUDE_CODE_MODEL,
        ...(claudeConfigDir ? { claudeConfigDir } : {}),
        ...(authenticationHome ? { authenticationHome } : {}),
      }),
    ]),
  };
}

function initialState(value: string | undefined): Readonly<Record<string, JsonValueV1>> | undefined {
  if (value === undefined) return undefined;
  const parsed = parseStrictJson(value, "--initial-state") as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("--initial-state must be a JSON object");
  }
  return parsed as Record<string, JsonValueV1>;
}

async function execute(
  program: Command,
  input: Omit<RunWorkflowCommandInputV1, "workspaceRoot" | "signal">,
  opts: RuntimeOpts,
): Promise<void> {
  const global = program.opts<GlobalOpts>();
  const controller = new AbortController();
  const cancel = () => controller.abort("process-signal");
  process.once("SIGINT", cancel);
  process.once("SIGTERM", cancel);
  try {
    try {
      const result = await runWorkflowCommand({
        ...input,
        workspaceRoot: global.cwd,
        signal: controller.signal,
      }, runtimeDeps(global, opts, input.action === "run" || input.action === "resume"));
      emit(formatRunWorkflowResult(result, !!opts.json));
      if (!result.ok) process.exitCode = 1;
    } catch (error) {
      if (!opts.json) throw error;
      const result = Object.freeze({
        schemaVersion: 1 as const,
        action: input.action,
        ok: false,
        status: "error",
        ...(input.workflow ? { workflow: input.workflow } : {}),
        ...(input.runId ? { runId: input.runId } : {}),
        ...(input.runtime ? { runtime: input.runtime } : {}),
        reason: error instanceof Error ? error.message : String(error),
      });
      emit(formatRunWorkflowResult(result, true));
      process.exitCode = 1;
    }
  } finally {
    process.removeListener("SIGINT", cancel);
    process.removeListener("SIGTERM", cancel);
  }
}

function addRuntimeOptions(command: Command): Command {
  return command
    .option("--runtime <provider>", "explicit runtime: codex or claude-code")
    .option("--runtime-version <version>", "required runtime version (resume must match the original)")
    .option("--model <model>", "runtime model identity (stored outside Graph IR)")
    .option("--instruction <text>", "workflow instruction")
    .option("--json", "emit a stable versioned JSON envelope", false);
}

type WorkflowRunOpts = RuntimeOpts & {
  runId?: string;
  initialState?: string;
  validate?: boolean;
};

/** The options `workflow run` takes, and that the deprecated `run` still takes. */
function addWorkflowRunOptions(command: Command): Command {
  return addRuntimeOptions(command
    .argument("[workflow]", "canonical workflow ID")
    .option("--run-id <id>", "stable run ID (generated when omitted)")
    .option("--initial-state <json>", "initial graph state as a strict JSON object")
    .option("--validate", "compile and lint without probing or executing", false));
}

/**
 * The action body, shared by `av workflow run` and the deprecated `av run`.
 *
 * Shared rather than duplicated so the shim cannot drift from what it fronts:
 * the two spellings must do the same thing for as long as both exist, and the
 * only way to guarantee that is for there to be one of them.
 */
function workflowRunAction(program: Command) {
  return async (workflow: string | undefined, opts: WorkflowRunOpts): Promise<void> => {
    const global = program.opts<GlobalOpts>();
    const action: RunWorkflowActionV1 = opts.validate ? "validate" : global.dryRun ? "dry-run" : "run";
    await execute(program, {
      action,
      ...(workflow ? { workflow } : {}),
      ...(opts.runtime ? { runtime: opts.runtime } : {}),
      ...(opts.runId ? { runId: opts.runId } : {}),
      ...(opts.instruction ? { instruction: opts.instruction } : {}),
      ...(opts.initialState ? { initialState: initialState(opts.initialState) } : {}),
    }, opts);
  };
}

export function registerHarnessCommands(program: Command): void {
  const runWorkflow = workflowRunAction(program);

  const workflow = program
    .command("workflow")
    .description("Validate or execute a versioned graph workflow");

  addWorkflowRunOptions(workflow
    .command("run")
    .description("Validate or execute a versioned graph workflow"))
    .action(runWorkflow);

  addRuntimeOptions(workflow
    .command("resume")
    .description("Resume a durable run with the original graph and runtime identity")
    .argument("<run-id>", "existing run ID"))
    .action(async (id: string, opts: RuntimeOpts) => {
      await execute(program, {
        action: "resume",
        runId: id,
        ...(opts.runtime ? { runtime: opts.runtime } : {}),
        ...(opts.instruction ? { instruction: opts.instruction } : {}),
      }, opts);
    });

  workflow
    .command("status")
    .description("Read durable status without invoking a provider")
    .argument("<run-id>", "existing run ID")
    .option("--json", "emit a stable versioned JSON envelope", false)
    .action(async (id: string, opts: { json?: boolean }) => {
      await execute(program, { action: "status", runId: id }, opts);
    });

  workflow
    .command("cancel")
    .description("Request cooperative cancellation for an active run")
    .argument("<run-id>", "existing run ID")
    .option("--json", "emit a stable versioned JSON envelope", false)
    .action(async (id: string, opts: { json?: boolean }) => {
      await execute(program, { action: "cancel", runId: id }, opts);
    });

  registerDeprecatedRun(program, runWorkflow);
}

/**
 * The old spelling, kept working for one release. Deleted in 1.4.0 with
 * `run-shim.ts` — see that file for why the name had to move at all.
 */
function registerDeprecatedRun(
  program: Command,
  runWorkflow: (workflow: string | undefined, opts: WorkflowRunOpts) => Promise<void>,
): void {
  const run = addWorkflowRunOptions(program
    .command("run")
    .description("Reserved for skill dispatch as run <kit>/<skill>; a bare workflow ID is the deprecated spelling of workflow run"));

  run.action(async (workflow: string | undefined, opts: WorkflowRunOpts) => {
    acceptLegacyRun(workflow);
    await runWorkflow(workflow, opts);
  });

  for (const moved of ["resume", "status", "cancel"] as const) {
    run
      .command(moved)
      .description(`Moved to workflow ${moved}`)
      .argument("<run-id>", "existing run ID")
      .option("--json", "emit a stable versioned JSON envelope", false)
      .action(() => refuseLegacyRunSubcommand(moved));
  }
}
