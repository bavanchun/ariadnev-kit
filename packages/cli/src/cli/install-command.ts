import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { loadKit } from "../kit/load-kit.js";
import { getKitRoot } from "../kit/embedded-kit.js";
import { installKit } from "../install/install-execute.js";
import { isProviderId, type ProviderId } from "../providers/index.js";
import type { ProviderInstallResult } from "../install/install-types.js";
import { renderHookSettingsSnippet } from "../install/hook-settings-merge.js";
import { renderSummary } from "./render-summary.js";
import type { HealReport } from "../install/install-heal.js";

export interface InstallHandlerOpts {
  providers: string[];
  scope: "project" | "global";
  dryRun: boolean;
  home: string;
  cwd: string;
  /** Override kit source root (tests / packaging). */
  kitRoot?: string;
  /** Injected backup timestamp. */
  timestamp: string;
  /** User confirmed merging hook bindings into settings.json (prompt result). */
  applyHookSettings?: boolean;
  /** Installed ariadnev package version, recorded in the receipt. */
  ariadnevVersion?: string;
}

export interface InstallHandlerResult {
  results: ProviderInstallResult[];
  summary: string;
}

function validateProviders(providers: string[]): ProviderId[] {
  if (providers.length === 0) throw new Error("no providers selected");
  const bad = providers.filter((p) => !isProviderId(p));
  if (bad.length) throw new Error(`unknown provider(s): ${bad.join(", ")}`);
  return providers as ProviderId[];
}

/**
 * What the install removed because this build no longer writes it there, and
 * what it deliberately did not.
 *
 * Silence here would be the wrong default: a heal deletes files from the user's
 * home directory, and a directory it could not clear is something only they can
 * resolve.
 */
function renderHealSummary(heal: HealReport): string {
  const lines: string[] = [];
  if (heal.removed.length > 0) {
    lines.push(`  removed ${heal.removed.length} file(s) this build no longer installs (backed up)`);
  }
  if (heal.wouldRemove.length > 0) {
    lines.push(`  would remove ${heal.wouldRemove.length} file(s) this build no longer installs (a real run backs them up first)`);
  }
  for (const entry of heal.preserved) {
    lines.push(`  kept ${entry.path} — ${entry.reason}`);
  }
  for (const dir of heal.survivingDirs) {
    lines.push(`  ${dir} still holds files no install recorded — review and remove it by hand`);
  }
  return lines.length > 0 ? `\n${lines.join("\n")}` : "";
}

/** Pure-ish handler: resolves providers, loads kit, installs, returns summary. */
export function runInstall(opts: InstallHandlerOpts): InstallHandlerResult {
  const providers = validateProviders(opts.providers);
  const kitRoot = opts.kitRoot ?? getKitRoot(dirname(fileURLToPath(import.meta.url)));
  const kit = loadKit(kitRoot);
  const { results, heal } = installKit(
    kit,
    providers,
    { home: opts.home, cwd: opts.cwd, scope: opts.scope },
    {
      dryRun: opts.dryRun,
      timestamp: opts.timestamp,
      applyHookSettings: opts.applyHookSettings,
      ariadnevVersion: opts.ariadnevVersion,
    },
  );
  let summary = renderSummary(results, opts.dryRun);
  summary += renderHealSummary(heal);
  if (!opts.applyHookSettings) {
    // Merge declined or non-interactive: hand the user the exact block instead.
    const hookOp = results
      .flatMap((r) => r.ops)
      .find((o) => o.action === "hook-settings");
    if (hookOp) summary += `\n\n${renderHookSettingsSnippet(hookOp.bindings)}`;
  }
  return { results, summary };
}
