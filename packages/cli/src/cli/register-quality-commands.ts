import type { Command } from "commander";
import type { CommandRegistrationContext } from "./command-registration-context.js";
import { runContract } from "./contract-command.js";
import { runCoverage } from "./coverage-command.js";
import { emit } from "./emit.js";
import { realEvalDeps, runEval } from "./eval-command.js";
import { runValidate } from "./validate-command.js";

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
    .description("Strictly check classified upstream claims against distilled skill content")
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
    .description("Score kit skill quality — tier-1 static always; tier-3 LLM judge when VCSKILL_EVAL_CMD is set")
    .option("--skill <name>", "only evaluate one skill (bare or vc: prefixed)")
    .action((opts: { skill?: string }) => {
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
