import { basename } from "node:path";
import type { Command } from "commander";
import { runBackupsList, runBackupsRestore } from "./backups-command.js";
import type { CommandRegistrationContext, GlobalOpts } from "./command-registration-context.js";
import { runDoctor } from "./doctor-command.js";
import { emit, emitError } from "./emit.js";
import { nowStamp } from "./timestamp.js";
import { realUpdateDeps, runUpdate } from "./update-command.js";

export function registerMaintenanceCommands(
  program: Command,
  context: CommandRegistrationContext,
): void {
  program
    .command("doctor")
    .description("Health-check the installed kit against its receipt")
    .option("--global", "check ~/ scope", false)
    .option("--fix", "re-merge hook bindings that drifted out of settings.json (backs up first)", false)
    .action((opts: { global?: boolean; fix?: boolean }) => {
      const global = program.opts<GlobalOpts>();
      const scope = opts.global ? "global" : "project";
      const { summary, exitCode, status } = runDoctor({
        scope,
        home: global.home,
        cwd: global.cwd,
        fix: !!opts.fix,
        dryRun: !!global.dryRun,
        timestamp: nowStamp(),
        color: context.outColor(),
      });
      emit(summary);
      context.record("doctor", { scope, status });
      if (exitCode !== 0) process.exitCode = exitCode;
    });

  program
    .command("backups")
    .description("List or restore ariadnev-managed backups")
    .argument("<action>", "list | restore <timestamp>")
    .argument("[timestamp]", "backup timestamp (for restore)")
    .option("--global", "use ~/ scope", false)
    .option("--file <rel>", "restore only the file matching this name")
    .action((action: string, timestamp: string | undefined, opts: { global?: boolean; file?: string }) => {
      const global = program.opts<GlobalOpts>();
      const scope = opts.global ? "global" : "project";
      if (action === "list") {
        emit(runBackupsList({ home: global.home, cwd: global.cwd, scope }));
        return;
      }
      if (action === "restore") {
        if (!timestamp) {
          emitError("usage: ariadnev backups restore <timestamp> [--file <rel>]");
          process.exitCode = 1;
          return;
        }
        const { summary } = runBackupsRestore({
          home: global.home,
          cwd: global.cwd,
          scope,
          timestamp,
          dryRun: !!global.dryRun,
          file: opts.file,
          preRestoreTimestamp: nowStamp(),
        });
        emit(summary);
        return;
      }
      emitError(`unknown backups action: ${action} (use "list" or "restore")`);
      process.exitCode = 1;
    });

  program
    .command("update")
    .description("Self-update to the latest ariadnev release (--check to only report, --to to pin an exact version)")
    .option("--global", "check ~/ scope", false)
    .option("--check", "only report whether an update exists; don't install", false)
    .option("--to <version>", "install this exact release instead of latest (e.g. downgrade)")
    .action(async (opts: { global?: boolean; check?: boolean; to?: string }) => {
      const global = program.opts<GlobalOpts>();
      const isBinary = !/^(node|bun)/i.test(basename(process.execPath));
      const { summary, exitCode } = await runUpdate(
        {
          home: global.home,
          cwd: global.cwd,
          scope: opts.global ? "global" : "project",
          currentVersion: context.version,
          execPath: process.execPath,
          isBinary,
          checkOnly: !!opts.check,
          to: opts.to ?? null,
          platform: process.platform,
          arch: process.arch,
        },
        realUpdateDeps(),
      );
      emit(summary);
      if (exitCode !== 0) process.exitCode = exitCode;
      if (!opts.check && exitCode === 0) context.record("update", {});
    });
}
