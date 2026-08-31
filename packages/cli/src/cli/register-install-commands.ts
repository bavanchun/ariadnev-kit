import { recordActivity } from "../activity/emit.js";
import type { Command } from "commander";
import { lifecycleRoots, projectRoots, withLifecycleLock } from "../install/lifecycle-lock.js";
import { PROVIDER_IDS } from "../providers/index.js";
import { emit } from "./emit.js";
import { readRegistry } from "../projects/registry.js";
import { UsageError } from "./exit-codes.js";
import { runInstall } from "./install-command.js";
import { nowStamp } from "./timestamp.js";
import { runUninstall } from "./uninstall-command.js";
import type { CommandRegistrationContext, GlobalOpts } from "./command-registration-context.js";

function splitProviders(value: string): string[] {
  return value.split(",").map((provider) => provider.trim()).filter(Boolean);
}

export function registerInstallCommands(program: Command, context: CommandRegistrationContext): void {
  program
    .command("install")
    .description("Install the kit to one or more providers")
    .option("--provider <list>", "comma-separated provider ids", splitProviders)
    .option("--global", "install to ~/ instead of ./", false)
    .option("--force", "overwrite files edited since the last install", false)
    .option("--json", "emit the machine envelope instead of the text report", false)
    .action(async (opts: { provider?: string[]; global?: boolean; force?: boolean; json?: boolean }) => {
      const global = program.opts<GlobalOpts>();
      const scope = opts.global ? "global" : "project";
      let providers = opts.provider ?? [];
      if (providers.length === 0 && !global.yes && process.stdout.isTTY) {
        const { promptProviders } = await import("./prompt-providers.js");
        providers = (await promptProviders()).providers;
      }
      if (providers.length === 0) providers = [...PROVIDER_IDS].slice(0, 1);
      let applyHookSettings = false;
      if (providers.includes("claude-code") && !global.yes && !global.dryRun && process.stdout.isTTY) {
        const { confirmHookSettingsMerge } = await import("./prompt-providers.js");
        applyHookSettings = await confirmHookSettingsMerge();
      }
      // Taken here, not at the top of the action: everything above is an
      // interactive prompt, and holding a lock across an unbounded human wait
      // is how a lock starts blocking work it was never protecting.
      const { summary, results } = await withLifecycleLock(
        global.dryRun ? [] : lifecycleRoots(global),
        "install",
        () =>
          runInstall({
            providers,
            scope,
            dryRun: !!global.dryRun,
            home: global.home,
            cwd: global.cwd,
            timestamp: nowStamp(),
            applyHookSettings,
            ariadnevVersion: context.version,
            force: !!opts.force,
            json: !!opts.json,
          }),
      );
      emit(summary);
      if (!global.dryRun) {
        context.record("install", { provider: providers.join(","), scope, count: results.length });
        // One event per provider rather than one comma-joined row: `stats`
        // groups by runtime, and a joined string is a category nobody asked for
        // that no filter can match.
        for (const provider of providers) recordActivity(global.home, "install.completed", { runtime: provider, status: "ok" });
      }
    });

  program
    .command("uninstall")
    .description("Remove a previously installed kit (previews by default; --yes applies)")
    .option("--provider <list>", "comma-separated provider ids (default: every provider in the receipt)", splitProviders)
    .option("--global", "uninstall from ~/ instead of ./", false)
    .option("--force", "also delete files edited since install (never files ariadnev did not install)", false)
    .option(
      "--purge",
      "also remove ariadnev's own state, registered project installs, the MCP residue, and the binary — IRREVERSIBLE. At project scope: this project's files and its .ariadnev only",
      false,
    )
    .option("--json", "emit the machine envelope instead of the text report", false)
    .action(async (opts: { provider?: string[]; global?: boolean; force?: boolean; purge?: boolean; json?: boolean }) => {
      const global = program.opts<GlobalOpts>();
      const scope = opts.global ? "global" : "project";
      // Narrowing to one provider and removing the binary are incoherent
      // together: the binary is what the providers still installed would be
      // run by. Rejecting it beats silently ignoring half of what was typed.
      if (opts.purge && (opts.provider ?? []).length > 0) {
        throw new UsageError("--purge removes the binary, so it cannot be narrowed with --provider; drop one of them");
      }
      // Preview unless the user said yes. `uninstall` used to delete on sight,
      // and a scripted caller that relied on that now gets a plan and an
      // explanation instead of a deletion — the direction of the change that is
      // recoverable. `--dry-run` still forces a preview even alongside `--yes`.
      const dryRun = !!global.dryRun || !global.yes;
      // A purge writes into registered projects, which `lifecycleRoots` does
      // not name, so those roots are locked too.
      //
      // The executable's directory is deliberately NOT among them, though
      // `update` locks it for its own writes there. Taking a lock creates
      // `<root>/.ariadnev/locks/`, and releasing one removes only the file —
      // so locking the bin directory would leave a brand new `.ariadnev` in it,
      // manufactured by the command whose entire purpose is to leave none.
      // Measured, not theorised: it put `~/.local/bin/.ariadnev/locks` on disk.
      // What that lock would have protected is a single unlink, and every other
      // lifecycle command is already excluded by the home lock.
      const roots = opts.purge
        ? [...lifecycleRoots(global), ...projectRoots(readRegistry(global.home).projects.map((entry) => entry.dir))]
        : lifecycleRoots(global);
      const { summary, outcomes } = await withLifecycleLock(
        dryRun ? [] : roots,
        "uninstall",
        () =>
          runUninstall({
            providers: opts.provider ?? [],
            scope,
            dryRun,
            home: global.home,
            cwd: global.cwd,
            timestamp: nowStamp(),
            force: !!opts.force,
            purge: !!opts.purge,
            json: !!opts.json,
          }),
      );
      emit(summary);
      // Both recorders write under `~/.ariadnev` — history.jsonl and the
      // activity log. After an applied purge that directory has just been
      // deleted, and writing here would recreate it: the command would report
      // a complete removal and leave the state directory standing, holding one
      // event that says it removed the state directory.
      if (!dryRun && !opts.purge) {
        context.record("uninstall", { provider: (opts.provider ?? []).join(","), scope });
        // From the outcomes, not from `--provider`. That flag is empty in the
        // ordinary case — "remove everything in the receipt" — so reading it
        // here would record nothing at all for the most common uninstall there
        // is, and the gap would look like the command was never run.
        for (const { providerId } of outcomes) {
          recordActivity(global.home, "uninstall.completed", { runtime: providerId, status: "ok" });
        }
      }
    });
}
