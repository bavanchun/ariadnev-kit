import { basename } from "node:path";
import { recordActivity } from "../activity/emit.js";
import {
  runActivityList,
  runActivityStats,
  tailActivity,
} from "./activity-command.js";
import { executableRoot, lifecycleRoots, runUnlock, withLifecycleLock } from "../install/lifecycle-lock.js";
import type { Command } from "commander";
import { runBackupsList, runBackupsPrune, runBackupsRestore } from "./backups-command.js";
import { runBackupsShow, runBackupsVerify, type BackupsResult } from "./backups-inspect.js";
import { EXIT } from "./exit-codes.js";
import { BACKUPS_SCHEMA_VERSION } from "./backups-inspect.js";
import { jsonEnvelope } from "./json-envelope.js";
import type { CommandRegistrationContext, GlobalOpts } from "./command-registration-context.js";
import { runDoctor } from "./doctor-command.js";
import { emit, emitError } from "./emit.js";
import { nowStamp } from "./timestamp.js";
import { realUpdateDeps, runUpdate } from "./update-command.js";

type Scope = "project" | "global";

interface BackupsCliOpts {
  global?: boolean;
  file?: string;
  latest?: boolean;
  olderThan?: string;
  keepLast?: string;
  json?: boolean;
}

/** Positive integer from a CLI string, or null when it is not one. */
function count(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  return /^\d+$/.test(raw) ? Number(raw) : null;
}

function needsTimestamp(action: string, timestamp: string | undefined, latest: boolean): BackupsResult | null {
  if (timestamp !== undefined || latest) return null;
  return { output: `usage: ariadnev backups ${action} <timestamp>`, exitCode: EXIT.usage };
}

/**
 * One dispatch for every backups verb, so `recover` reaches the same code as
 * `backups restore` rather than growing a parallel path that drifts from it.
 */
function runBackupsAction(
  action: string,
  timestamp: string | undefined,
  opts: BackupsCliOpts,
  base: { home: string; cwd: string; scope: Scope },
  dryRun: boolean,
): BackupsResult {
  const json = !!opts.json;
  if (action === "list") return { output: runBackupsList({ ...base, json }), exitCode: EXIT.ok };

  if (action === "show" || action === "verify") {
    const missing = needsTimestamp(action, timestamp, false);
    if (missing) return missing;
    const inspect = { ...base, timestamp: timestamp!, json };
    return action === "show" ? runBackupsShow(inspect) : runBackupsVerify(inspect);
  }

  if (action === "restore") {
    const latest = !!opts.latest;
    const missing = needsTimestamp("restore", timestamp, latest);
    if (missing) return missing;
    const { summary, restored } = runBackupsRestore({
      ...base,
      timestamp: timestamp ?? "",
      latest,
      dryRun,
      file: opts.file,
      preRestoreTimestamp: nowStamp(),
    });
    if (json) {
      return {
        output: jsonEnvelope(BACKUPS_SCHEMA_VERSION, "backups.restore", { dryRun, restored }),
        exitCode: EXIT.ok,
      };
    }
    return { output: summary, exitCode: EXIT.ok };
  }

  if (action === "prune") {
    const olderThanDays = count(opts.olderThan);
    const keepLast = count(opts.keepLast);
    if ((opts.olderThan !== undefined && olderThanDays === null) || (opts.keepLast !== undefined && keepLast === null)) {
      return { output: "ariadnev backups prune — --older-than and --keep-last take a whole number", exitCode: EXIT.usage };
    }
    return runBackupsPrune({
      ...base,
      olderThanDays: olderThanDays ?? undefined,
      keepLast: keepLast ?? undefined,
      dryRun,
      now: Date.now(),
      json,
    });
  }

  return {
    output: `unknown backups action: ${action} (use list, show, verify, restore or prune)`,
    exitCode: EXIT.usage,
  };
}

/**
 * Only `restore` and `prune` write. `list`, `show` and `verify` read a manifest,
 * and blocking them during an install would take away the commands someone
 * reaches for precisely when they want to know what is going on.
 */
function backupsLockRoots(action: string, global: GlobalOpts): string[] {
  const mutates = action === "restore" || action === "prune";
  return mutates && !global.dryRun ? lifecycleRoots(global) : [];
}

function finishBackups(result: BackupsResult): void {
  if (result.exitCode === EXIT.ok) emit(result.output);
  else emitError(result.output);
  if (result.exitCode !== EXIT.ok) process.exitCode = result.exitCode;
}

export function registerMaintenanceCommands(
  program: Command,
  context: CommandRegistrationContext,
): void {
  program
    .command("doctor")
    .description("Health-check the installed kit against its receipt")
    .option("--global", "check ~/ scope", false)
    .option("--fix", "re-merge hook bindings that drifted out of settings.json (backs up first)", false)
    .option("--json", "emit the machine envelope instead of the text report", false)
    .action(async (opts: { global?: boolean; fix?: boolean; json?: boolean }) => {
      const global = program.opts<GlobalOpts>();
      const scope = opts.global ? "global" : "project";
      // Only `--fix` mutates; a read-only health check must never be blocked by
      // a running install, which is exactly when someone reaches for it.
      const { summary, exitCode, status } = await withLifecycleLock(
        opts.fix && !global.dryRun ? lifecycleRoots(global) : [],
        "doctor --fix",
        () => runDoctor({
        scope,
        home: global.home,
        cwd: global.cwd,
        fix: !!opts.fix,
        dryRun: !!global.dryRun,
        timestamp: nowStamp(),
        color: context.outColor(),
        json: !!opts.json,
        }),
      );
      emit(summary);
      context.record("doctor", { scope, status });
      if (exitCode !== 0) process.exitCode = exitCode;
    });

  program
    .command("backups")
    .description("List, show, verify, restore or prune ariadnev-managed backups")
    .argument("<action>", "list | show <ts> | verify <ts> | restore <ts> | prune")
    .argument("[timestamp]", "backup timestamp (for show, verify, restore)")
    .option("--global", "use ~/ scope", false)
    .option("--file <rel>", "restore only the file matching this name")
    .option("--latest", "restore the newest backup instead of a named one", false)
    .option("--older-than <days>", "prune: remove backups older than this many days")
    .option("--keep-last <n>", "prune: keep this many newest backups")
    .option("--json", "emit the machine envelope instead of the text report", false)
    .action(async (action: string, timestamp: string | undefined, opts: BackupsCliOpts) => {
      const global = program.opts<GlobalOpts>();
      const scope = opts.global ? "global" : "project";
      const base = { home: global.home, cwd: global.cwd, scope } as const;
      finishBackups(
        await withLifecycleLock(backupsLockRoots(action, global), `backups ${action}`, () =>
          runBackupsAction(action, timestamp, opts, base, !!global.dryRun),
        ),
      );
    });

  // `recover` is an alias, not a second implementation. The kit this was ported
  // from documents it as one too, and the only thing it really adds is
  // `--latest`, which now lives on `restore` beside the other restore flags.
  program
    .command("recover")
    .description("Alias for `backups restore --latest` (pass a timestamp to pick one)")
    .argument("[timestamp]", "backup timestamp; omit to take the newest")
    .option("--global", "use ~/ scope", false)
    .option("--file <rel>", "restore only the file matching this name")
    .option("--json", "emit the machine envelope instead of the text report", false)
    .action(async (timestamp: string | undefined, opts: BackupsCliOpts) => {
      const global = program.opts<GlobalOpts>();
      const scope = opts.global ? "global" : "project";
      finishBackups(
        await withLifecycleLock(backupsLockRoots("restore", global), "recover", () =>
          runBackupsAction(
            "restore",
            timestamp,
            { ...opts, latest: timestamp === undefined },
            { home: global.home, cwd: global.cwd, scope },
            !!global.dryRun,
          ),
        ),
      );
    });

  // The escape hatch a refuse-never-steal policy requires. A lock is only ever
  // cleared because someone decided it was leaked, and this is where they say so.
  program
    .command("unlock")
    .description("Clear a leaked ariadnev lifecycle lock (only when no ariadnev command is running)")
    .option("--global", "use ~/ scope", false)
    .option("--json", "emit the machine envelope instead of the text report", false)
    .action((opts: { global?: boolean; json?: boolean }) => {
      const global = program.opts<GlobalOpts>();
      const result = runUnlock({
        roots: [...lifecycleRoots(global), executableRoot(process.execPath)],
        json: !!opts.json,
      });
      emit(result.output);
    });

  program
    .command("update")
    .description("Self-update to the latest ariadnev release (--check to only report, --to to pin an exact version)")
    .option("--global", "check ~/ scope", false)
    .option("--check", "only report whether an update exists; don't install", false)
    .option("--to <version>", "install this exact release instead of latest (e.g. downgrade)")
    .option("--json", "emit the machine envelope instead of the text report", false)
    .action(async (opts: { global?: boolean; check?: boolean; to?: string; json?: boolean }) => {
      const global = program.opts<GlobalOpts>();
      const isBinary = !/^(node|bun)/i.test(basename(process.execPath));
      // `--check` only reports. The executable root is locked as well as the
      // scope roots: `update` replaces `process.execPath`, one file shared by
      // every project and outside every scope root, so two updates in different
      // directories would otherwise be entirely unserialized.
      const { summary, exitCode } = await withLifecycleLock(
        opts.check || global.dryRun ? [] : [...lifecycleRoots(global), executableRoot(process.execPath)],
        "update",
        () => runUpdate(
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
          json: !!opts.json,
        },
        realUpdateDeps(),
        ),
      );
      emit(summary);
      if (exitCode !== 0) process.exitCode = exitCode;
      if (!opts.check && exitCode === 0) {
        context.record("update", {});
        // Two logs, deliberately: history answers "what did ariadnev do to this
        // machine", activity answers "what has been happening lately". Neither
        // can answer the other's question from the other's records.
        recordActivity(global.home, "update.completed", { status: "ok" });
      }
    });

  registerActivityCommands(program);
}

/**
 * `av activity list | tail | stats` — reading the event log.
 *
 * Registered here beside `doctor` and `query` because it is an inspection
 * surface, not a lifecycle one: nothing under `activity` writes.
 */
function registerActivityCommands(program: Command): void {
  const activity = program
    .command("activity")
    .description("Inspect the local activity event log");

  activity
    .command("list")
    .description("List recent local activity events, newest first")
    .option("--limit <n>", "maximum events to return", "100")
    .option("--since <cursor>", "return events with IDs greater than this cursor")
    .option("--json", "emit a stable versioned JSON envelope", false)
    .action((opts: { limit?: string; since?: string; json?: boolean }) => {
      const global = program.opts<GlobalOpts>();
      emit(runActivityList({
        home: global.home,
        limit: Number(opts.limit),
        ...(opts.since ? { since: opts.since } : {}),
        json: !!opts.json,
      }));
    });

  activity
    .command("tail")
    .description("Stream new local activity events until interrupted")
    .option("--json", "emit one JSON event per line", false)
    .action(async (opts: { json?: boolean }) => {
      const global = program.opts<GlobalOpts>();
      const controller = new AbortController();
      const stop = () => controller.abort();
      process.once("SIGINT", stop);
      process.once("SIGTERM", stop);
      try {
        await tailActivity({
          home: global.home,
          json: !!opts.json,
          signal: controller.signal,
          onLine: emit,
        });
      } finally {
        process.removeListener("SIGINT", stop);
        process.removeListener("SIGTERM", stop);
      }
    });

  activity
    .command("stats")
    .description("Summarize local skill usage by coding agent")
    .option("--window <span>", "lookback window, for example 24h, 7d, 2w", "7d")
    .option("--kit <id>", "filter by kit ID")
    .option("--runtime <name>", "filter by coding-agent runtime")
    .option("--json", "emit a stable versioned JSON envelope", false)
    .action((opts: { window?: string; kit?: string; runtime?: string; json?: boolean }) => {
      const global = program.opts<GlobalOpts>();
      emit(runActivityStats({
        home: global.home,
        ...(opts.window ? { window: opts.window } : {}),
        ...(opts.kit ? { kit: opts.kit } : {}),
        ...(opts.runtime ? { runtime: opts.runtime } : {}),
        json: !!opts.json,
      }));
    });
}
