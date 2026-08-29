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

// NO `config start | status | stop` HERE, THOUGH UPSTREAM HAS THEM. Two things
// in this repository already decided that, and both are older than this phase.
// The parity manifest's note says `config` keeps its ariadnev meaning and the
// dashboard half goes to `gui`. And `command-surface.test.ts` pins those three
// names as *phantoms* — commands kit prose references and this CLI does not
// have — because the kit inherited "start it with `av config start --port 3456`"
// from upstream, where it opens a plans dashboard. Registering the names would
// not make that sentence true; it would only stop the lint from saying it is
// false. `av api start` is the daemon and `av gui` is the thing that opens.
