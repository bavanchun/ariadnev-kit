import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { isProviderId, type ProviderId } from "../providers/index.js";
import { uninstallKit, type UninstallKitOutcome } from "../uninstall/uninstall-execute.js";
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
}

export interface UninstallHandlerResult {
  outcomes: UninstallKitOutcome[];
  summary: string;
}

function validateProviders(providers: string[]): ProviderId[] {
  const bad = providers.filter((p) => !isProviderId(p));
  if (bad.length) throw new Error(`unknown provider(s): ${bad.join(", ")}`);
  return providers as ProviderId[];
}

export function renderUninstallSummary(outcomes: UninstallKitOutcome[], dryRun: boolean): string {
  const lines: string[] = [dryRun ? "vcskill uninstall — DRY RUN (no changes made)" : "vcskill uninstall — complete"];
  if (outcomes.length === 0) {
    lines.push("  nothing to do (no receipt, or none of the requested providers are installed)");
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

/** Reads the receipt for the given scope, uninstalls, writes the receipt back (or deletes it when empty). */
export function runUninstall(opts: UninstallHandlerOpts): UninstallHandlerResult {
  const root = opts.scope === "global" ? opts.home : opts.cwd;
  const receiptPath = join(root, ".vcskill", "receipt.json");
  if (!existsSync(receiptPath)) {
    return { outcomes: [], summary: renderUninstallSummary([], opts.dryRun) };
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
      // by default — the user can delete `.vcskill/backups` manually.
      if (existsSync(receiptPath)) unlinkSync(receiptPath);
    } else {
      atomicWrite(receiptPath, `${JSON.stringify(updated, null, 2)}\n`);
    }
  }

  return { outcomes, summary: renderUninstallSummary(outcomes, opts.dryRun) };
}
