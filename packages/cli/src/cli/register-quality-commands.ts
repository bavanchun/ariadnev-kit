import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Command } from "commander";
import type { CommandRegistrationContext, GlobalOpts } from "./command-registration-context.js";
import { runAudit } from "./audit-command.js";
import { runContract } from "./contract-command.js";
import { runSkillEnv, type SkillEnvAction } from "./skill-env-command.js";
import { emit, emitError } from "./emit.js";
import { parseBehavioralCommand, runBehavioralEval } from "./behavioral-eval-command.js";
import { realEvalDeps, runEval } from "./eval-command.js";
import { runValidate } from "./validate-command.js";
// The registration layer owns both the command tree and every runValidate
// caller, so it is where the surface is built — see ValidateOpts.surface.
import { commandSurface } from "./command-surface.js";
import { getKitRoot } from "../kit/embedded-kit.js";
import { loadConfig, realLoadDeps } from "../config/load-config.js";

export function registerQualityCommands(program: Command, context: CommandRegistrationContext): void {
  program
    .command("validate")
    .description("Lint the kit source (frontmatter, sizes, references, cross-skill routing) without installing")
    .option("--check", "also fail if the README provider matrix is out of sync (CI gate)", false)
    .option("--strict", "count orphan and dangling reference warnings as failures", false)
    .option("--json", "emit the machine envelope instead of the text report", false)
    .action((opts: { check?: boolean; strict?: boolean; json?: boolean }) => {
      const { summary, ok } = runValidate({
        check: !!opts.check,
        strict: !!opts.strict,
        json: !!opts.json,
        surface: commandSurface(),
      });
      emit(summary);
      if (!ok) process.exitCode = 1;
    });

  program
    .command("audit")
    .description("Compare installed files against the receipt, or scan the scripts the kit ships")
    .argument("[target]", "kit (default) | scripts", "kit")
    .option("--global", "audit the ~/ scope", false)
    .option("--json", "emit JSON instead of the text report", false)
    .option("--strict", "count untracked files and flagged scripts as failures", false)
    .action((target: string, opts: { global?: boolean; json?: boolean; strict?: boolean }) => {
      if (target !== "kit" && target !== "scripts") {
        throw new Error(`unknown audit target: ${target} (expected "kit" or "scripts")`);
      }
      const global = program.opts<GlobalOpts>();
      const scope = opts.global ? "global" : "project";
      const { output, exitCode } = runAudit({
        target,
        scope,
        home: global.home,
        cwd: global.cwd,
        json: !!opts.json,
        strict: !!opts.strict,
      });
      emit(output);
      context.record("audit", { scope, status: exitCode === 0 ? "ok" : "drift" });
      if (exitCode !== 0) process.exitCode = exitCode;
    });

  program
    .command("skill")
    .description("Manage the Python environment a skill's scripts need, and run those scripts")
    .argument("<action>", "install | verify | repair | upgrade | remove | run")
    .argument("[name]", "skill name (omit for verify/upgrade across every skill)")
    .argument("[args...]", "for run: script path, then its own arguments")
    .option("--deep", "verify RECORD's files and import the packages in a child process", false)
    .option("--json", "emit JSON instead of the text report", false)
    .action((action: string, name: string | undefined, args: string[], opts: { deep?: boolean; json?: boolean }) => {
      const actions: SkillEnvAction[] = ["install", "verify", "repair", "upgrade", "remove", "run"];
      if (!actions.includes(action as SkillEnvAction)) {
        throw new Error(`unknown skill action: ${action} (expected ${actions.join(" | ")})`);
      }
      const global = program.opts<GlobalOpts>();
      const { config, warnings } = loadConfig({ home: global.home, cwd: global.cwd }, realLoadDeps());
      // A rejected key is only a security control if the user can see it was
      // rejected; silence here is how a project file's ignored setting turns
      // into "ariadnev didn't respect my config".
      for (const warning of warnings) emitError(`config: ${warning}`);
      const { output, exitCode } = runSkillEnv({
        action: action as SkillEnvAction,
        skill: name,
        args,
        deep: !!opts.deep,
        json: !!opts.json,
        dryRun: !!global.dryRun,
        executionPolicy: config.scripts.executionPolicy,
      });
      if (output) emit(output);
      if (exitCode !== 0) process.exitCode = exitCode;
    });

  program
    .command("contract")
    .description("Print the provider×artifact capability contract (--json for machines)")
    .option("--json", "emit JSON instead of the Markdown matrix", false)
    .action((opts: { json?: boolean }) => {
      const { output } = runContract({
        json: !!opts.json,
        version: context.version,
        color: !opts.json && context.outColor(),
      });
      emit(output);
    });

  program
    .command("eval")
    .description("Score kit quality — tier-1 static; tier-2 behavioral suite; optional tier-3 LLM judge")
    .option("--skill <name>", "only evaluate one skill (bare or av: prefixed)")
    .option("--suite", "run the tier-2 behavioral scenario suite", false)
    .option("--runner <json-argv>", "strict JSON argv array; prompt is sent on stdin")
    .option("--variant <name>", "benchmark variant: ariadnev or reference", "ariadnev")
    .option("--runtime-provider <name>", "pinned runtime provider identity")
    .option("--runtime-version <version>", "pinned runtime version identity")
    .option("--model <name>", "pinned model identity")
    .option("--timeout-ms <milliseconds>", "per-run timeout", "300000")
    .option("--skill-repeats <count>", "repeats for every skill routing cell", "3")
    .option("--deep-repeats <count>", "repeats for every golden task", "1")
    .option("--concurrency <count>", "maximum parallel isolated runs", "1")
    .option("--json", "emit the machine envelope instead of the text report (--suite always emits JSON)", false)
    .action(async (opts: {
      skill?: string; suite?: boolean; runner?: string; variant: string; json?: boolean;
      runtimeProvider?: string; runtimeVersion?: string; model?: string;
      timeoutMs: string; skillRepeats: string; deepRepeats: string; concurrency: string;
    }) => {
      if (opts.suite) {
        if (opts.skill) throw new Error("--skill cannot be combined with --suite");
        const encoded = opts.runner ?? process.env.ARIADNEV_BEHAVIORAL_CMD;
        if (!encoded) throw new Error("--suite requires --runner or ARIADNEV_BEHAVIORAL_CMD");
        if (!opts.runtimeProvider || !opts.runtimeVersion || !opts.model) {
          throw new Error("--suite requires --runtime-provider, --runtime-version, and --model");
        }
        if (opts.variant !== "ariadnev" && opts.variant !== "reference") throw new Error("--variant must be ariadnev or reference");
        const positive = (value: string, label: string) => {
          const parsed = Number(value);
          if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${label} must be a positive integer`);
          return parsed;
        };
        const { summary, ok } = await runBehavioralEval({
          command: parseBehavioralCommand(encoded),
          variant: opts.variant,
          runtime: { provider: opts.runtimeProvider, version: opts.runtimeVersion, model: opts.model },
          availableCapabilities: [],
          timeoutMs: positive(opts.timeoutMs, "--timeout-ms"),
          skillRepeats: positive(opts.skillRepeats, "--skill-repeats"),
          deepRepeats: positive(opts.deepRepeats, "--deep-repeats"),
          concurrency: positive(opts.concurrency, "--concurrency"),
          kitRoot: getKitRoot(dirname(fileURLToPath(import.meta.url))),
          runnerHome: process.env.ARIADNEV_BEHAVIORAL_HOME,
          surface: commandSurface(),
        });
        emit(summary);
        context.record("eval", { status: ok ? "ok" : "fail" });
        if (!ok) process.exitCode = 1;
        return;
      }
      const evalCmd = process.env.ARIADNEV_EVAL_CMD;
      const { summary, ok } = runEval({
        skill: opts.skill,
        evalCmd,
        color: context.outColor(),
        json: !!opts.json,
        deps: evalCmd ? realEvalDeps(evalCmd) : undefined,
        surface: commandSurface(),
      });
      emit(summary);
      context.record("eval", { status: ok ? "ok" : "fail" });
      if (!ok) process.exitCode = 1;
    });
}
