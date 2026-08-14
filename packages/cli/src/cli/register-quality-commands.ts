import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Command } from "commander";
import type { CommandRegistrationContext } from "./command-registration-context.js";
import { runContract } from "./contract-command.js";
import { runCoverage } from "./coverage-command.js";
import { emit } from "./emit.js";
import { parseBehavioralCommand, runBehavioralEval } from "./behavioral-eval-command.js";
import { realEvalDeps, runEval } from "./eval-command.js";
import { runValidate } from "./validate-command.js";
import { getKitRoot } from "../kit/embedded-kit.js";

export function registerQualityCommands(program: Command, context: CommandRegistrationContext): void {
  program
    .command("validate")
    .description("Lint the kit source (frontmatter, sizes, references, claim coverage) without installing")
    .option("--check", "also fail if the README provider matrix is out of sync (CI gate)", false)
    .action((opts: { check?: boolean }) => {
      const { summary, ok } = runValidate({ check: !!opts.check });
      emit(summary);
      if (!ok) process.exitCode = 1;
    });

  program
    .command("coverage")
    .description("Strictly check classified claims against skill content")
    .option("--skill <name>", "only check one skill (bare or vc: prefixed)")
    .action((opts: { skill?: string }) => {
      const { summary, ok } = runCoverage({ skill: opts.skill });
      emit(summary);
      if (!ok) process.exitCode = 1;
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
    .option("--skill <name>", "only evaluate one skill (bare or vc: prefixed)")
    .option("--suite", "run the tier-2 behavioral scenario suite", false)
    .option("--runner <json-argv>", "strict JSON argv array; prompt is sent on stdin")
    .option("--variant <name>", "benchmark variant: vcskill or reference", "vcskill")
    .option("--runtime-provider <name>", "pinned runtime provider identity")
    .option("--runtime-version <version>", "pinned runtime version identity")
    .option("--model <name>", "pinned model identity")
    .option("--timeout-ms <milliseconds>", "per-run timeout", "300000")
    .option("--skill-repeats <count>", "repeats for every skill routing cell", "3")
    .option("--deep-repeats <count>", "repeats for every golden task", "1")
    .option("--concurrency <count>", "maximum parallel isolated runs", "1")
    .action(async (opts: {
      skill?: string; suite?: boolean; runner?: string; variant: string;
      runtimeProvider?: string; runtimeVersion?: string; model?: string;
      timeoutMs: string; skillRepeats: string; deepRepeats: string; concurrency: string;
    }) => {
      if (opts.suite) {
        if (opts.skill) throw new Error("--skill cannot be combined with --suite");
        const encoded = opts.runner ?? process.env.VCSKILL_BEHAVIORAL_CMD;
        if (!encoded) throw new Error("--suite requires --runner or VCSKILL_BEHAVIORAL_CMD");
        if (!opts.runtimeProvider || !opts.runtimeVersion || !opts.model) {
          throw new Error("--suite requires --runtime-provider, --runtime-version, and --model");
        }
        if (opts.variant !== "vcskill" && opts.variant !== "reference") throw new Error("--variant must be vcskill or reference");
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
          runnerHome: process.env.VCSKILL_BEHAVIORAL_HOME,
        });
        emit(summary);
        context.record("eval", { status: ok ? "ok" : "fail" });
        if (!ok) process.exitCode = 1;
        return;
      }
      const evalCmd = process.env.VCSKILL_EVAL_CMD;
      const { summary, ok } = runEval({
        skill: opts.skill,
        evalCmd,
        color: context.outColor(),
        deps: evalCmd ? realEvalDeps(evalCmd) : undefined,
      });
      emit(summary);
      context.record("eval", { status: ok ? "ok" : "fail" });
      if (!ok) process.exitCode = 1;
    });
}
