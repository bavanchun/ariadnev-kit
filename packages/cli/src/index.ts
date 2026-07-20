import { homedir } from "node:os";
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { Command } from "commander";
import { runInstall } from "./cli/install-command.js";
import { runUninstall } from "./cli/uninstall-command.js";
import { runDoctor } from "./cli/doctor-command.js";
import { runBackupsList, runBackupsRestore } from "./cli/backups-command.js";
import { runUpdate, fetchLatestVersionFromGitHub } from "./cli/update-command.js";
import { runList } from "./cli/list-command.js";
import { runValidate } from "./cli/validate-command.js";
import { nowStamp } from "./cli/timestamp.js";
import { PROVIDER_IDS } from "./providers/index.js";
import { registerAddSkill } from "./cli/add-skill-command.js";
import { registerMigrate } from "./cli/migrate-command.js";
import { packageVersion } from "./version.js";

interface GlobalOpts {
  home: string;
  cwd: string;
  dryRun?: boolean;
  yes?: boolean;
}

function splitProviders(value: string): string[] {
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}

export function buildProgram(): Command {
  const program = new Command();
  program
    .name("vcskill")
    .description("Author agent skills once, install to any AI provider.")
    .version(packageVersion())
    .option("--home <dir>", "override home root", homedir())
    .option("--cwd <dir>", "override project root", process.cwd())
    .option("--dry-run", "plan only, write nothing", false)
    .option("--yes", "skip interactive prompts", false);

  program
    .command("install")
    .description("Install the kit to one or more providers")
    .option("--provider <list>", "comma-separated provider ids", splitProviders)
    .option("--global", "install to ~/ instead of ./", false)
    .action(async (opts: { provider?: string[]; global?: boolean }) => {
      const g = program.opts<GlobalOpts>();
      const scope = opts.global ? "global" : "project";
      let providers = opts.provider ?? [];
      if (providers.length === 0 && !g.yes && process.stdout.isTTY) {
        const { promptProviders } = await import("./cli/prompt-providers.js");
        const picked = await promptProviders();
        providers = picked.providers;
      }
      if (providers.length === 0) providers = [...PROVIDER_IDS].slice(0, 1); // default claude-code
      let applyHookSettings = false;
      if (providers.includes("claude-code") && !g.yes && !g.dryRun && process.stdout.isTTY) {
        const { confirmHookSettingsMerge } = await import("./cli/prompt-providers.js");
        applyHookSettings = await confirmHookSettingsMerge();
      }
      const { summary } = runInstall({
        providers,
        scope,
        dryRun: !!g.dryRun,
        home: g.home,
        cwd: g.cwd,
        timestamp: nowStamp(),
        applyHookSettings,
        vcskillVersion: packageVersion(),
      });
      console.log(summary);
    });

  program
    .command("uninstall")
    .description("Remove a previously installed kit (receipt-based, preserves user-modified files)")
    .option("--provider <list>", "comma-separated provider ids (default: every provider in the receipt)", splitProviders)
    .option("--global", "uninstall from ~/ instead of ./", false)
    .action((opts: { provider?: string[]; global?: boolean }) => {
      const g = program.opts<GlobalOpts>();
      const { summary } = runUninstall({
        providers: opts.provider ?? [],
        scope: opts.global ? "global" : "project",
        dryRun: !!g.dryRun,
        home: g.home,
        cwd: g.cwd,
        timestamp: nowStamp(),
      });
      console.log(summary);
    });

  program
    .command("doctor")
    .description("Health-check the installed kit against its receipt")
    .option("--global", "check ~/ scope", false)
    .action((opts: { global?: boolean }) => {
      const g = program.opts<GlobalOpts>();
      const { summary, exitCode } = runDoctor({
        scope: opts.global ? "global" : "project",
        home: g.home,
        cwd: g.cwd,
      });
      console.log(summary);
      if (exitCode !== 0) process.exitCode = exitCode;
    });

  program
    .command("backups")
    .description("List or restore vcskill-managed backups")
    .argument("<action>", "list | restore <timestamp>")
    .argument("[timestamp]", "backup timestamp (for restore)")
    .option("--global", "use ~/ scope", false)
    .option("--file <rel>", "restore only the file matching this name")
    .action((action: string, timestamp: string | undefined, opts: { global?: boolean; file?: string }) => {
      const g = program.opts<GlobalOpts>();
      const scope = opts.global ? "global" : "project";
      if (action === "list") {
        console.log(runBackupsList({ home: g.home, cwd: g.cwd, scope }));
        return;
      }
      if (action === "restore") {
        if (!timestamp) {
          console.error("usage: vcskill backups restore <timestamp> [--file <rel>]");
          process.exitCode = 1;
          return;
        }
        const { summary } = runBackupsRestore({
          home: g.home,
          cwd: g.cwd,
          scope,
          timestamp,
          dryRun: !!g.dryRun,
          file: opts.file,
          preRestoreTimestamp: nowStamp(),
        });
        console.log(summary);
        return;
      }
      console.error(`unknown backups action: ${action} (use "list" or "restore")`);
      process.exitCode = 1;
    });

  program
    .command("update")
    .description("Check for a newer vcskill release")
    .option("--global", "check ~/ scope", false)
    .action(async (opts: { global?: boolean }) => {
      const g = program.opts<GlobalOpts>();
      const { summary } = await runUpdate(
        { home: g.home, cwd: g.cwd, scope: opts.global ? "global" : "project", currentVersion: packageVersion() },
        { fetchLatestVersion: fetchLatestVersionFromGitHub },
      );
      console.log(summary);
    });

  program
    .command("validate")
    .description("Lint the kit source (frontmatter, sizes, reference integrity) without installing")
    .action(() => {
      const { summary, ok } = runValidate();
      console.log(summary);
      if (!ok) process.exitCode = 1;
    });

  program
    .command("list")
    .description("Show kit contents and per-provider install state")
    .option("--global", "check ~/ scope", false)
    .action((opts: { global?: boolean }) => {
      const g = program.opts<GlobalOpts>();
      console.log(runList({ scope: opts.global ? "global" : "project", home: g.home, cwd: g.cwd }));
    });

  registerAddSkill(program);
  registerMigrate(program);
  return program;
}

// Resolve argv[1] through any bin symlink so `node_modules/.bin/vcskill`
// (a symlink to dist/index.js) is still recognized as the entry point.
function isEntry(): boolean {
  if (process.env.VCSKILL_RUN === "1") return true;
  // Bun single-file executable: this module is the entry, and its URL lives in
  // the compiled binary's embedded fs — argv[1] is a user arg, not a script.
  if ((import.meta as { main?: boolean }).main === true) return true;
  if (import.meta.url.includes("/$bunfs/") || import.meta.url.startsWith("bun:")) return true;
  if (!process.argv[1]) return false;
  try {
    return pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url;
  } catch {
    return false;
  }
}
if (isEntry()) {
  buildProgram().parseAsync(process.argv).catch((err) => {
    console.error(String(err instanceof Error ? err.message : err));
    process.exit(1);
  });
}
