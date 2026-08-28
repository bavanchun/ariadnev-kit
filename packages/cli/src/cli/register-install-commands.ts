import { recordActivity } from "../activity/emit.js";
import type { Command } from "commander";
import { lifecycleRoots, withLifecycleLock } from "../install/lifecycle-lock.js";
import { PROVIDER_IDS } from "../providers/index.js";
import { emit } from "./emit.js";
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
    .option("--json", "emit the machine envelope instead of the text report", false)
    .action(async (opts: { provider?: string[]; global?: boolean; json?: boolean }) => {
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
    .option("--json", "emit the machine envelope instead of the text report", false)
    .action(async (opts: { provider?: string[]; global?: boolean; force?: boolean; json?: boolean }) => {
      const global = program.opts<GlobalOpts>();
      const scope = opts.global ? "global" : "project";
      // Preview unless the user said yes. `uninstall` used to delete on sight,
      // and a scripted caller that relied on that now gets a plan and an
      // explanation instead of a deletion — the direction of the change that is
      // recoverable. `--dry-run` still forces a preview even alongside `--yes`.
      const dryRun = !!global.dryRun || !global.yes;
      const { summary, outcomes } = await withLifecycleLock(
        dryRun ? [] : lifecycleRoots(global),
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
            json: !!opts.json,
          }),
      );
      emit(summary);
      if (!dryRun) {
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
