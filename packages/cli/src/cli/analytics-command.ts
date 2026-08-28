// `av analytics status | enable | disable | refresh | rebuild | delete`.
//
// LOCAL ONLY. Nothing here transmits anything. The index is a file on this
// machine derived from other files on this machine, and that is the whole
// feature — the captured surface says the same thing in its own help text, and
// this plan's non-goals say it again.
//
// `status` NEVER REPAIRS. It is the command someone runs when something is
// wrong, so it must not be the command that changes things. It probes and
// reports; every other verb is an explicit request to act.

import {
  analyticsStatus,
  deleteIndex,
  disableAnalytics,
  enableAnalytics,
  readState,
} from "../analytics/lifecycle.js";
import { rebuildIndex, refreshIndex } from "../analytics/rebuild.js";
import { UsageError } from "./exit-codes.js";
import { jsonEnvelope } from "./json-envelope.js";

export const ANALYTICS_SCHEMA_VERSION = 1;

export interface AnalyticsOpts {
  readonly home: string;
  readonly now: string;
  readonly json?: boolean;
  readonly env?: NodeJS.ProcessEnv;
}

export function runAnalyticsStatus(opts: AnalyticsOpts): string {
  const status = analyticsStatus(opts.home);
  if (opts.json) {
    // One `schema_version`, at the top. The captured `analytics status` repeats
    // it inside `data`; phases 3 and 4 already settled that a second copy of a
    // number that is always equal can only ever disagree.
    return jsonEnvelope(ANALYTICS_SCHEMA_VERSION, "analytics.status", status);
  }
  const lines = [
    `Analytics: ${status.enabled ? "enabled" : "disabled"} (serving from ${status.serving_mode})`,
    `  index    ${status.health}`,
    `  facts    ${status.fact_count}`,
  ];
  if (status.last_successful_at) lines.push(`  built    ${status.last_successful_at}`);
  if (status.staleness_reason) lines.push(`  note     ${status.staleness_reason}`);
  // Every state that is not "serving" gets the command that fixes it, because
  // absent, disabled, stale and corrupt need four different actions.
  if (!status.enabled) lines.push("  fix      av analytics enable");
  else if (status.health === "absent") lines.push("  fix      av analytics rebuild");
  else if (status.health === "stale") lines.push("  fix      av analytics rebuild");
  else if (status.health === "corrupt") lines.push("  fix      av analytics delete && av analytics rebuild");
  return lines.join("\n");
}

export function runAnalyticsEnable(opts: AnalyticsOpts): string {
  const state = enableAnalytics(opts.home, opts.now);
  if (opts.json) return jsonEnvelope(ANALYTICS_SCHEMA_VERSION, "analytics.enable", { enabled: state.enabled });
  return "Analytics enabled. Run `av analytics rebuild` to build the index.";
}

export function runAnalyticsDisable(opts: AnalyticsOpts): string {
  const state = disableAnalytics(opts.home, opts.now);
  if (opts.json) return jsonEnvelope(ANALYTICS_SCHEMA_VERSION, "analytics.disable", { enabled: state.enabled });
  // Says what it did NOT do, because "disable" and "delete" are easy to
  // conflate and the difference is whether work survives.
  return "Analytics disabled. The index was kept — `av analytics delete` removes it.";
}

export function runAnalyticsDelete(opts: AnalyticsOpts): string {
  const result = deleteIndex(opts.home);
  const stillEnabled = readState(opts.home).enabled;
  if (opts.json) {
    return jsonEnvelope(ANALYTICS_SCHEMA_VERSION, "analytics.delete", { ...result, enabled: stillEnabled });
  }
  if (!result.removed) return "No analytics index to delete.";
  return [
    `Deleted the analytics index (${result.bytesFreed} bytes).`,
    stillEnabled
      ? "Analytics is still enabled; the next `av analytics rebuild` recreates it from the sources."
      : "Analytics remains disabled.",
  ].join("\n");
}

function requireEnabled(home: string): void {
  if (readState(home).enabled) return;
  // Building an index for someone who has not asked for one is the thing
  // "opt-in" rules out, and doing it silently is worse than refusing.
  throw new UsageError("analytics is disabled — run `av analytics enable` first");
}

export function runAnalyticsRefresh(opts: AnalyticsOpts): string {
  requireEnabled(opts.home);
  const result = refreshIndex(opts.home, { now: opts.now, ...(opts.env ? { env: opts.env } : {}) });
  if (opts.json) return jsonEnvelope(ANALYTICS_SCHEMA_VERSION, "analytics.refresh", result);
  return `Refreshed: ${result.sourcesIngested} of ${result.sourcesScanned} source(s) re-read, ${result.factCount} fact(s) indexed in ${result.elapsedMs}ms.`;
}

export function runAnalyticsRebuild(opts: AnalyticsOpts): string {
  requireEnabled(opts.home);
  const result = rebuildIndex(opts.home, { now: opts.now, ...(opts.env ? { env: opts.env } : {}) });
  if (opts.json) return jsonEnvelope(ANALYTICS_SCHEMA_VERSION, "analytics.rebuild", result);
  return `Rebuilt from ${result.sourcesScanned} source(s): ${result.factCount} fact(s) indexed in ${result.elapsedMs}ms.`;
}
