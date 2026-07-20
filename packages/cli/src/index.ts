import { homedir } from "node:os";
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { Command } from "commander";
import { runInstall } from "./cli/install-command.js";
import { runUninstall } from "./cli/uninstall-command.js";
import { runDoctor } from "./cli/doctor-command.js";
import { runBackupsList, runBackupsRestore } from "./cli/backups-command.js";
import { runUpdate, realUpdateDeps } from "./cli/update-command.js";
import { basename } from "node:path";
import { runList } from "./cli/list-command.js";
import { runValidate } from "./cli/validate-command.js";
import { runContract } from "./cli/contract-command.js";
import { runEval, realEvalDeps } from "./cli/eval-command.js";
import { maybeNudge, realNudgeDeps } from "./cli/update-check.js";
import { emit, emitError, setEmitTransform } from "./cli/emit.js";
import { sanitize } from "./security/credential-sanitizer.js";
import { shouldColor, wordmark, coral, faint } from "./ui/style.js";
import { scopeProcessEnv } from "./env-scope.js";
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

/** Whether stdout should carry ANSI branding (TTY, not CI, not NO_COLOR). */
function outColor(): boolean {
  return shouldColor(process.env, process.stdout);
}

/** The branded no-args / help banner. Plain when piped. */
function banner(): string {
  const o = { color: outColor() };
  return [
    `${wordmark(o)}  ${faint("— author agent skills once, install to any provider", o)}`,
    "",
    `  ${coral("vc", o)} <command>   ·   try  ${coral("vc install", o)}  ·  ${coral("vc doctor", o)}  ·  ${coral("vc list", o)}`,
  ].join("\n");
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
      emit(summary);
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
      emit(summary);
    });

  program
    .command("doctor")
    .description("Health-check the installed kit against its receipt")
    .option("--global", "check ~/ scope", false)
    .option("--fix", "re-merge hook bindings that drifted out of settings.json (backs up first)", false)
    .action((opts: { global?: boolean; fix?: boolean }) => {
      const g = program.opts<GlobalOpts>();
      const { summary, exitCode } = runDoctor({
        scope: opts.global ? "global" : "project",
        home: g.home,
        cwd: g.cwd,
        fix: !!opts.fix,
        dryRun: !!g.dryRun,
        timestamp: nowStamp(),
        color: outColor(),
      });
      emit(summary);
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
        emit(runBackupsList({ home: g.home, cwd: g.cwd, scope }));
        return;
      }
      if (action === "restore") {
        if (!timestamp) {
          emitError("usage: vcskill backups restore <timestamp> [--file <rel>]");
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
        emit(summary);
        return;
      }
      emitError(`unknown backups action: ${action} (use "list" or "restore")`);
      process.exitCode = 1;
    });

  program
    .command("update")
    .description("Self-update to the latest vcskill release (--check to only report)")
    .option("--global", "check ~/ scope", false)
    .option("--check", "only report whether an update exists; don't install", false)
    .action(async (opts: { global?: boolean; check?: boolean }) => {
      const g = program.opts<GlobalOpts>();
      const isBinary = !/^(node|bun)/i.test(basename(process.execPath));
      const { summary } = await runUpdate(
        {
          home: g.home,
          cwd: g.cwd,
          scope: opts.global ? "global" : "project",
          currentVersion: packageVersion(),
          execPath: process.execPath,
          isBinary,
          checkOnly: !!opts.check,
          platform: process.platform,
          arch: process.arch,
        },
        realUpdateDeps(),
      );
      emit(summary);
    });

  program
    .command("validate")
    .description("Lint the kit source (frontmatter, sizes, reference integrity) without installing")
    .option("--check", "also fail if the README provider matrix is out of sync (CI gate)", false)
    .action((opts: { check?: boolean }) => {
      const { summary, ok } = runValidate({ check: !!opts.check });
      emit(summary);
      if (!ok) process.exitCode = 1;
    });

  program
    .command("contract")
    .description("Print the provider×artifact capability contract (--json for machines)")
    .option("--json", "emit JSON instead of the Markdown matrix", false)
    .action((opts: { json?: boolean }) => {
      const { output } = runContract({ json: !!opts.json, version: packageVersion(), color: !opts.json && outColor() });
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
        color: outColor(),
        deps: evalCmd ? realEvalDeps(evalCmd) : undefined,
      });
      emit(summary);
      if (!ok) process.exitCode = 1;
    });

  program
    .command("list")
    .description("Show kit contents and per-provider install state")
    .option("--global", "check ~/ scope", false)
    .action((opts: { global?: boolean }) => {
      const g = program.opts<GlobalOpts>();
      emit(runList({ scope: opts.global ? "global" : "project", home: g.home, cwd: g.cwd, color: outColor() }));
    });

  registerAddSkill(program);
  registerMigrate(program);

  // Branded first impression: the wordmark banner heads `--help`, and bare
  // `vcskill`/`vc` (no subcommand) prints it instead of a bare usage error.
  program.addHelpText("beforeAll", () => `${banner()}\n`);
  program.action(() => emit(banner()));

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
// A newer-version hint, printed to stderr after a normal command. Only when
// running as the binary in an interactive terminal, not in CI, and not for the
// `update` command itself. Best-effort — never blocks or throws.
async function nudgeAfterCommand(): Promise<void> {
  const isBinary = !/^(node|bun)/i.test(basename(process.execPath));
  const cmd = process.argv[2];
  if (!isBinary || !process.stderr.isTTY || process.env.CI || cmd === "update") return;
  try {
    const hint = await maybeNudge(realNudgeDeps(packageVersion()));
    if (hint) emitError(hint);
  } catch {
    /* nudge is best-effort */
  }
}

if (isEntry()) {
  // A cwd `.env` must never configure vcskill (Bun auto-loads it) — drop any
  // VCSKILL_* it injected before anything reads process.env.
  scopeProcessEnv();
  // Redact credentials at the single output boundary + the fatal handler, so a
  // token in any summary/error string is never printed.
  setEmitTransform(sanitize);
  buildProgram()
    .parseAsync(process.argv)
    .then(nudgeAfterCommand)
    .catch((err) => {
      console.error(sanitize(String(err instanceof Error ? err.message : err)));
      process.exit(1);
    });
}
