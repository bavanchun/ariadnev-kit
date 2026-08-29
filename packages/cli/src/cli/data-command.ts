// `av data status | retention | ingest`.
//
// `status --json` EMITS THE ENVELOPE, WHERE THE CAPTURED SURFACE EMITS A BARE
// ARRAY. That is a deliberate divergence. `json-envelope.test.ts` gates every
// top-level command onto one shape, and that gate exists because five private
// envelope shapes were what it was written to stop. Matching a one-off array
// here would mean either exempting this command from the gate or reintroducing
// the inconsistency the gate prevents. The class array lives under `data`.

import { allPolicies, DATA_CLASSES, forecastFor, isDataClass, runRetention } from "../data/retention.js";
import { readState } from "../analytics/lifecycle.js";
import { refreshIndex } from "../analytics/rebuild.js";
import { UsageError } from "./exit-codes.js";
import { jsonEnvelope } from "./json-envelope.js";

export const DATA_SCHEMA_VERSION = 1;

export interface DataOpts {
  readonly home: string;
  readonly now: string;
  readonly json?: boolean;
  readonly env?: NodeJS.ProcessEnv;
}

export function runDataStatus(opts: DataOpts): string {
  const classes = allPolicies().map((policy) => ({
    dataClass: policy.dataClass,
    mode: policy.mode,
    forever: policy.forever,
    forecast: forecastFor(opts.home, policy),
  }));
  if (opts.json) {
    return jsonEnvelope(DATA_SCHEMA_VERSION, "data.status", { classes, total: classes.length, default: "forever" });
  }
  const lines = ["Derived data classes (default retention: forever):"];
  for (const entry of classes) {
    lines.push(`  ${entry.dataClass.padEnd(20)} ${entry.mode}  ${entry.forecast.oneMonthBytes} bytes`);
  }
  lines.push("");
  lines.push("Forecasts are the current local footprint, not an extrapolation.");
  return lines.join("\n");
}

export interface DataRetentionOpts extends DataOpts {
  readonly dataClass?: string;
  readonly days?: number;
  readonly apply?: boolean;
}

export function runDataRetention(opts: DataRetentionOpts): string {
  const dataClass = opts.dataClass ?? "session_metrics";
  if (!isDataClass(dataClass)) {
    throw new UsageError(`unknown --class: ${dataClass}. Available: ${DATA_CLASSES.join(", ")}`);
  }
  if (opts.days !== undefined && (!Number.isInteger(opts.days) || opts.days < 0)) {
    throw new UsageError("--days takes a whole number of days to retain");
  }

  const preview = runRetention({
    home: opts.home,
    dataClass,
    ...(opts.days === undefined ? {} : { days: opts.days }),
    apply: !!opts.apply,
    now: new Date(opts.now),
  });

  if (opts.json) return jsonEnvelope(DATA_SCHEMA_VERSION, "data.retention", preview);

  const lines = [`${dataClass}: ${preview.mode}${preview.retainDays === undefined ? "" : ` (retain ${preview.retainDays} day(s))`}`];
  lines.push(`  eligible  ${preview.eligible}`);
  for (const segment of preview.segments) lines.push(`      ${segment}`);
  if (preview.note) lines.push(`  note      ${preview.note}`);
  lines.push(preview.applied
    ? "  applied   derived rows and whole segments removed; no session file was touched"
    : "  preview   nothing was removed — pass --apply to act on this plan");
  return lines.join("\n");
}

/**
 * One bounded sweep of the sources into the index.
 *
 * Deliberately the same code path as `analytics refresh`, under a second name
 * the captured surface also has. Two names for one operation is a naming
 * choice; two implementations of it would be a drift risk.
 */
export function runDataIngest(opts: DataOpts): string {
  if (!readState(opts.home).enabled) {
    throw new UsageError("analytics is disabled — run `av analytics enable` before ingesting");
  }
  const result = refreshIndex(opts.home, { now: opts.now, ...(opts.env ? { env: opts.env } : {}) });
  if (opts.json) return jsonEnvelope(DATA_SCHEMA_VERSION, "data.ingest", result);
  return `Ingested ${result.sourcesIngested} of ${result.sourcesScanned} source(s); ${result.factCount} fact(s) indexed.`;
}
