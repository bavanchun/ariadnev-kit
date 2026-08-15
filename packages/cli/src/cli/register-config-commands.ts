import type { Command } from "commander";
import type { CommandRegistrationContext, GlobalOpts } from "./command-registration-context.js";
import { runConfigResolve } from "./config-command.js";
import { emit } from "./emit.js";
import { realLoadDeps } from "../config/load-config.js";

export function registerConfigCommands(program: Command, _context: CommandRegistrationContext): void {
  const config = program.command("config").description("Inspect ariadnev's own configuration");

  config
    .command("prefs")
    .description("Show the settings in effect after both config layers are applied")
    .argument("<action>", "resolve")
    .option("--json", "emit the machine envelope instead of the text report", false)
    .action((action: string, opts: { json?: boolean }) => {
      if (action !== "resolve") throw new Error(`unknown config prefs action: ${action} (expected "resolve")`);
      const global = program.opts<GlobalOpts>();
      const { output, exitCode } = runConfigResolve(
        { home: global.home, cwd: global.cwd, json: !!opts.json },
        realLoadDeps(),
      );
      emit(output);
      if (exitCode !== 0) process.exitCode = exitCode;
    });
}
