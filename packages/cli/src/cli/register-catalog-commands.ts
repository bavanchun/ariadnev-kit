import { homedir } from "node:os";
import type { Command } from "commander";
import { registerAddSkill } from "./add-skill-command.js";
import type { CommandRegistrationContext, GlobalOpts } from "./command-registration-context.js";
import { emit } from "./emit.js";
import { runList } from "./list-command.js";
import { registerMigrate } from "./migrate-command.js";
import { normalizeView, runQuery } from "./query-command.js";
import { runTelemetryStatus } from "./telemetry-command.js";

export function registerCatalogCommands(program: Command, context: CommandRegistrationContext): void {
  program
    .command("list")
    .description("Show kit contents and per-provider install state")
    .option("--global", "check ~/ scope", false)
    .action((opts: { global?: boolean }) => {
      const global = program.opts<GlobalOpts>();
      emit(runList({
        scope: opts.global ? "global" : "project",
        home: global.home,
        cwd: global.cwd,
        color: context.outColor(),
      }));
    });

  program
    .command("query")
    .description("Show recorded ariadnev history (installs | doctor | history)")
    .argument("[view]", "installs | doctor | history", "history")
    .action((view: string | undefined) => {
      emit(runQuery({ view: normalizeView(view), home: homedir(), color: context.outColor() }));
    });

  program
    .command("telemetry")
    .description("Anonymous telemetry status (stateless, off unless configured; opt out with ARIADNEV_TELEMETRY_DISABLED=1)")
    .argument("[action]", "status", "status")
    .action(() => {
      const config = { enabled: !process.env.ARIADNEV_TELEMETRY_DISABLED, url: undefined };
      emit(runTelemetryStatus(process.env, config, { color: context.outColor() }));
    });

  registerAddSkill(program);
  registerMigrate(program);
}
