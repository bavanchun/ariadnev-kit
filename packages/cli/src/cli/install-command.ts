import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { loadKit, resolveKitRoot } from "../kit/load-kit.js";
import { installKit } from "../install/install-execute.js";
import { isProviderId, type ProviderId } from "../providers/index.js";
import type { ProviderInstallResult } from "../install/install-types.js";
import { renderSummary } from "./render-summary.js";

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

/** Pure-ish handler: resolves providers, loads kit, installs, returns summary. */
export function runInstall(opts: InstallHandlerOpts): InstallHandlerResult {
  const providers = validateProviders(opts.providers);
  const kitRoot = opts.kitRoot ?? resolveKitRoot(dirname(fileURLToPath(import.meta.url)));
  const kit = loadKit(kitRoot);
  const results = installKit(
    kit,
    providers,
    { home: opts.home, cwd: opts.cwd, scope: opts.scope },
    { dryRun: opts.dryRun, timestamp: opts.timestamp },
  );
  return { results, summary: renderSummary(results, opts.dryRun) };
}
