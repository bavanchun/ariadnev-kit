import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { jsonEnvelope } from "./json-envelope.js";
import { dirname, join } from "node:path";
import { isProviderId, type ProviderId } from "../providers/index.js";
import { uninstallKit, recoverFromJournal, type UninstallKitOutcome } from "../uninstall/uninstall-execute.js";
import { clearJournal, readJournal } from "../install/intent-journal.js";
import { readRegistry } from "../projects/registry.js";
import { atomicWrite } from "../install/fs-atomic.js";
import { executePurge, purgePlanFor, type PurgeExecution, type PurgeExecuteOpts } from "../uninstall/purge-execute.js";
import { purgeWarning, renderPurgeSummary } from "../uninstall/purge-summary.js";
import type { Receipt } from "../install/install-receipt.js";

export interface UninstallHandlerOpts {
  /** Provider ids to uninstall; empty means every provider in the receipt. */
  providers: string[];
  scope: "project" | "global";
  dryRun: boolean;
  home: string;
  cwd: string;
  timestamp: string;
  json?: boolean;
  /** Also delete files edited since install. Orphans stay out of reach. */
  force?: boolean;
  /**
   * Remove everything ariadnev put on this machine, not just what a provider
   * install wrote: the state directory, registered project installs, the MCP
   * residue, and the binary. At project scope it means only this project's
   * files and this project's `.ariadnev` — there is no per-project binary or
   * registry to reach.
   */
  purge?: boolean;
  /** `process.execPath`. Injected so tests can purge a fixture, not the runner. */
  execPath?: string;
}

// 2: the envelope gained a `purge` object. A consumer pinned to 1 should see
// the change rather than infer it from a field that was not there yesterday.
export const UNINSTALL_SCHEMA_VERSION = 2;

export interface UninstallHandlerResult {
  outcomes: UninstallKitOutcome[];
  summary: string;
  /** Present only when `--purge` was passed. */
  purge?: PurgeExecution;
}

function validateProviders(providers: string[]): ProviderId[] {
  const bad = providers.filter((p) => !isProviderId(p));
  if (bad.length) throw new Error(`unknown provider(s): ${bad.join(", ")}`);
  return providers as ProviderId[];
}

export function renderUninstallSummary(
  outcomes: UninstallKitOutcome[],
  dryRun: boolean,
  recovered = false,
): string {
  const lines: string[] = [dryRun ? "ariadnev uninstall — DRY RUN (no changes made)" : "ariadnev uninstall — complete"];
  if (recovered) {
    lines.push("  recovered from an interrupted install (no receipt was written)");
  }
  if (outcomes.length === 0) {
    lines.push("  nothing to do (none of the requested providers are installed)");
    return lines.join("\n");
  }
  for (const { providerId, result } of outcomes) {
    lines.push(`  ${providerId}: removed=${result.removed.length} preserved=${result.preserved.length}`);
    for (const p of result.preserved) {
      // The reason as the plan recorded it. It used to be hardcoded to
      // "modified since install", which was true when that was the only way a
      // file could be preserved and became a lie the moment a file could also
      // be preserved for not being ours at all.
      lines.push(`      - kept (${p.reason}): ${p.path}`);
    }
  }
  if (dryRun) {
    lines.push("");
    lines.push("Nothing was deleted. Re-run with --yes to apply this plan.");
  }
  return lines.join("\n");
}

export class NoInstallRecordError extends Error {
  constructor(root: string) {
    super(
      `no install record found under ${join(root, ".ariadnev")} — nothing was uninstalled. ` +
        `If the kit was installed with a different scope, pass --global (or drop it).`,
    );
    this.name = "NoInstallRecordError";
  }
}

/**
 * No receipt: either nothing was ever installed here, or an install was killed
 * before it could write one. The journal distinguishes the two. Reporting
 * "complete" for the second case is how files written by a crashed install
 * became unreachable — so with neither record this fails loudly instead.
 */
function runJournalRecovery(root: string, opts: UninstallHandlerOpts): UninstallHandlerResult {
  const journal = readJournal(root);
  if (!journal) throw new NoInstallRecordError(root);

  const requested = opts.providers.length > 0 ? validateProviders(opts.providers) : null;
  const providerIds = journal.providers
    .map((p) => p.provider)
    .filter((id) => requested === null || requested.includes(id));

  // No `force` here, and not by omission: the journal records intent, not
  // hashes, so this path cannot tell a clean file from an edited one. A flag
  // whose meaning is "also delete the edited ones" has nothing to select on,
  // and forwarding it would suggest a distinction that was never available.
  const outcomes = recoverFromJournal(
    journal,
    providerIds,
    { home: opts.home, cwd: opts.cwd },
    { dryRun: opts.dryRun, timestamp: opts.timestamp },
  );
  // The journal described exactly one interrupted run; once cleaned up it has
  // nothing left to describe, and leaving it would make the next uninstall
  // replay a run that already happened.
  if (!opts.dryRun) clearJournal(root);
  return { outcomes, summary: renderUninstallSummary(outcomes, opts.dryRun, true) };
}

/**
 * Run the purge passes and fold their report into an uninstall result.
 *
 * Always last. The provider pass has to have finished writing its backups
 * before the state pass deletes the directory they are in, and this is where
 * that ordering is enforced for the top-level scope.
 */
function withPurge(base: UninstallHandlerResult, opts: UninstallHandlerOpts): UninstallHandlerResult {
  const purgeOpts: PurgeExecuteOpts = {
    dryRun: opts.dryRun,
    timestamp: opts.timestamp,
    home: opts.home,
    cwd: opts.cwd,
    scope: opts.scope,
    execPath: opts.execPath ?? process.execPath,
    allowedRoots: purgeRoots(opts),
  };
  const execution = executePurge(purgePlanFor(purgeOpts), purgeOpts);
  const lines = [base.summary, ...renderPurgeSummary(execution, opts.dryRun)];
  if (opts.dryRun) lines.push("", ...purgeWarning());
  return { ...base, purge: execution, summary: lines.join("\n") };
}

/**
 * Every root a purge op is allowed to touch.
 *
 * Wider than `lifecycleRoots` by exactly two things, both of which purge
 * genuinely reaches and nothing else does: the directories of registered
 * projects, and the directory holding the executable.
 */
function purgeRoots(opts: UninstallHandlerOpts): string[] {
  const roots = [opts.home, opts.cwd, dirname(opts.execPath ?? process.execPath)];
  if (opts.scope === "global") {
    for (const entry of readRegistry(opts.home).projects) roots.push(entry.dir);
  }
  return [...new Set(roots)];
}

/** Reads the receipt for the given scope, uninstalls, writes the receipt back (or deletes it when empty). */
export function runUninstall(opts: UninstallHandlerOpts): UninstallHandlerResult {
  const root = opts.scope === "global" ? opts.home : opts.cwd;
  const receiptPath = join(root, ".ariadnev", "receipt.json");
  if (!existsSync(receiptPath)) {
    // A purge with no receipt is not the error case a plain uninstall makes it.
    // The state directory, the registry and the binary are all still there and
    // are exactly what the user asked to be rid of; refusing because the file
    // recording provider ownership happens to be gone would strand them with
    // the residue and no command that removes it.
    if (opts.purge && !readJournal(root)) {
      const empty: UninstallHandlerResult = { outcomes: [], summary: renderUninstallSummary([], opts.dryRun) };
      return maybeJson(withPurge(empty, opts), opts);
    }
    return runJournalRecovery(root, opts);
  }

  const receipt = JSON.parse(readFileSync(receiptPath, "utf8")) as Receipt;
  const providerIds =
    opts.providers.length > 0
      ? validateProviders(opts.providers)
      : (Object.keys(receipt.installs) as ProviderId[]);

  const { outcomes, receipt: updated } = uninstallKit(
    receipt,
    providerIds,
    { home: opts.home, cwd: opts.cwd },
    { dryRun: opts.dryRun, timestamp: opts.timestamp, force: opts.force },
  );

  if (!opts.dryRun) {
    if (Object.keys(updated.installs).length === 0) {
      // Last provider gone: drop the receipt. Backups are intentionally kept
      // by default — the user can delete `.ariadnev/backups` manually.
      if (existsSync(receiptPath)) unlinkSync(receiptPath);
    } else {
      atomicWrite(receiptPath, `${JSON.stringify(updated, null, 2)}\n`);
    }
  }

  const base: UninstallHandlerResult = { outcomes, summary: renderUninstallSummary(outcomes, opts.dryRun) };
  return maybeJson(opts.purge ? withPurge(base, opts) : base, opts);
}

/** Swap the text report for the machine envelope when `--json` asked for it. */
function maybeJson(result: UninstallHandlerResult, opts: UninstallHandlerOpts): UninstallHandlerResult {
  if (!opts.json) return result;
  return {
    ...result,
    summary: jsonEnvelope(UNINSTALL_SCHEMA_VERSION, "uninstall.run", {
      dryRun: opts.dryRun,
      scope: opts.scope,
      outcomes: result.outcomes,
      purge: result.purge ?? null,
    }),
  };
}
