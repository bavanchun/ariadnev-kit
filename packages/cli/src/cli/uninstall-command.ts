import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { jsonEnvelope } from "./json-envelope.js";
import { join } from "node:path";
import { isProviderId, type ProviderId } from "../providers/index.js";
import { uninstallKit, recoverFromJournal, type UninstallKitOutcome } from "../uninstall/uninstall-execute.js";
import { clearJournal, readJournal } from "../install/intent-journal.js";
import { atomicWrite } from "../install/fs-atomic.js";
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
}

export const UNINSTALL_SCHEMA_VERSION = 1;

export interface UninstallHandlerResult {
  outcomes: UninstallKitOutcome[];
  summary: string;
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
      lines.push(`      - kept (modified since install): ${p.path}`);
    }
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

/** Reads the receipt for the given scope, uninstalls, writes the receipt back (or deletes it when empty). */
export function runUninstall(opts: UninstallHandlerOpts): UninstallHandlerResult {
  const root = opts.scope === "global" ? opts.home : opts.cwd;
  const receiptPath = join(root, ".ariadnev", "receipt.json");
  if (!existsSync(receiptPath)) {
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
    { dryRun: opts.dryRun, timestamp: opts.timestamp },
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

  if (opts.json) {
    return {
      outcomes,
      summary: jsonEnvelope(UNINSTALL_SCHEMA_VERSION, "uninstall.run", { dryRun: opts.dryRun, scope: opts.scope, outcomes }),
    };
  }
  return { outcomes, summary: renderUninstallSummary(outcomes, opts.dryRun) };
}
