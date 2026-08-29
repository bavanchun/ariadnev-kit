// Retention over derived data: what may be dropped, and what may never be.
//
// EVERYTHING HERE IS DERIVED. Retention deletes rows from the analytics index
// and unlinks whole activity segments. It never touches a session file — those
// belong to Claude Code and Codex — and never rewrites an append-only file in
// place.
//
// A SEGMENT IS UNLINKED WHOLE OR LEFT ALONE. Rewriting an append-only log to
// drop its older half means reading it, filtering it, and replacing it while a
// live process may be appending to the original. The window where that loses a
// record is small and real. Whole-file granularity costs precision — a segment
// is a UTC day, so retention lands on day boundaries — and buys an operation
// that cannot tear anything.
//
// DEFAULT `forever`, matching the captured surface. Retention is opt-in, like
// the index it prunes.

import { existsSync, rmSync, statSync } from "node:fs";
import { basename } from "node:path";
import { listSegments } from "../activity/event-log.js";
import { openIndex } from "../analytics/rebuild.js";
import { indexPath } from "../analytics/lifecycle.js";

/**
 * The seven classes the captured surface reports.
 *
 * Kept as a closed list for the same reason the activity vocabulary is: a typo
 * in a `--class` argument must be an error the user sees, not a silently empty
 * result that reads like "nothing to prune".
 */
export const DATA_CLASSES = [
  "session_metrics",
  "skill_invocations",
  "ingestion_runs",
  "ingestion_failures",
  "change_log",
  "outbox",
  "content_shard",
] as const;

export type DataClass = (typeof DATA_CLASSES)[number];

export function isDataClass(value: string): value is DataClass {
  return (DATA_CLASSES as readonly string[]).includes(value);
}

/** Retention mode. `forever` is the default for every class. */
export type RetentionMode = "forever" | "days";

export interface ClassPolicy {
  readonly dataClass: DataClass;
  readonly mode: RetentionMode;
  readonly forever: boolean;
  readonly retainDays?: number;
}

/**
 * How each class is stored, which decides what pruning it means.
 *
 * `index` classes are rows in the analytics database and can be deleted by
 * predicate. `segment` classes are append-only files and are unlinked whole.
 * `absent` classes have no local store in this build — reported honestly rather
 * than answered with a zero that reads as "already clean".
 */
const CLASS_BACKING: Readonly<Record<DataClass, "index" | "segment" | "absent">> = {
  session_metrics: "index",
  skill_invocations: "index",
  ingestion_runs: "index",
  ingestion_failures: "absent",
  change_log: "segment",
  outbox: "absent",
  content_shard: "absent",
};

/** Fact kinds each index-backed class owns. */
const CLASS_KINDS: Readonly<Partial<Record<DataClass, readonly string[]>>> = {
  session_metrics: ["session.messages", "session.duration", "session.tokens"],
  skill_invocations: ["workflow.started", "workflow.completed", "workflow.failed"],
  ingestion_runs: ["install.completed", "update.completed", "uninstall.completed"],
};

export function defaultPolicy(dataClass: DataClass): ClassPolicy {
  return { dataClass, mode: "forever", forever: true };
}

export function allPolicies(): ClassPolicy[] {
  return DATA_CLASSES.map(defaultPolicy);
}

export interface RetentionForecast {
  readonly oneMonthBytes: number;
  readonly threeMonthBytes: number;
  readonly twelveMonthBytes: number;
  readonly assumptions: string;
  readonly confidence: "low";
  readonly policyMode: RetentionMode;
}

/**
 * A size projection, with its own uncertainty stated in the payload.
 *
 * `confidence` is hard-coded `low` and the assumption is spelled out, matching
 * the captured surface. That is the honest shape: a linear extrapolation from a
 * few days of local growth is not a forecast anyone should plan storage around,
 * and a number without that caveat invites exactly that.
 */
export function forecastFor(home: string, policy: ClassPolicy): RetentionForecast {
  const bytes = currentBytes(home, policy.dataClass);
  // Reported as the current footprint repeated rather than a growth curve: with
  // no history of growth to extrapolate from, inventing a slope would be making
  // the number up. The captured surface returns zeros here for the same reason.
  return {
    oneMonthBytes: bytes,
    threeMonthBytes: bytes,
    twelveMonthBytes: bytes,
    assumptions: "current local footprint; growth is not extrapolated without a measured history",
    confidence: "low",
    policyMode: policy.mode,
  };
}

function currentBytes(home: string, dataClass: DataClass): number {
  const backing = CLASS_BACKING[dataClass];
  if (backing === "segment") {
    return listSegments(home).reduce((total, path) => total + safeSize(path), 0);
  }
  if (backing === "index") return safeSize(indexPath(home));
  return 0;
}

function safeSize(path: string): number {
  try {
    return existsSync(path) ? statSync(path).size : 0;
  } catch {
    return 0;
  }
}

export interface RetentionPreview {
  readonly dataClass: DataClass;
  readonly mode: RetentionMode;
  readonly retainDays?: number;
  readonly backing: "index" | "segment" | "absent";
  /** Rows or whole files that would go. */
  readonly eligible: number;
  /** Segment file names that would be unlinked, for a `segment` class. */
  readonly segments: string[];
  readonly applied: boolean;
  /** Why nothing would be removed, when nothing would. */
  readonly note?: string;
}

export interface RetentionOptions {
  readonly home: string;
  readonly dataClass: DataClass;
  /** Retain this many days. Absent means `forever`, which prunes nothing. */
  readonly days?: number;
  readonly apply?: boolean;
  readonly now?: Date;
}

function cutoffIso(days: number, now: Date): string {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Resolve, preview, and — only with `apply` — prune one class.
 *
 * Preview and apply share this one body, so what `--apply` removes is exactly
 * what the preview named. A separate apply path is how a tool ends up deleting
 * something its own preview did not mention.
 */
export function runRetention(options: RetentionOptions): RetentionPreview {
  const now = options.now ?? new Date();
  const backing = CLASS_BACKING[options.dataClass];
  const mode: RetentionMode = options.days === undefined ? "forever" : "days";
  const base = {
    dataClass: options.dataClass,
    mode,
    ...(options.days === undefined ? {} : { retainDays: options.days }),
    backing,
    applied: false,
    segments: [] as string[],
  };

  if (mode === "forever") {
    return { ...base, eligible: 0, note: "retention is `forever` for this class; pass --days to evaluate a window" };
  }
  if (backing === "absent") {
    // Honest rather than convenient: "we do not store this locally" and
    // "we store it and there is none" look identical as a zero.
    return { ...base, eligible: 0, note: `${options.dataClass} has no local store in this build` };
  }

  const cutoff = cutoffIso(options.days!, now);

  if (backing === "segment") {
    // A segment is a UTC day. Its name carries that day, so eligibility is
    // decided from the name and never from mtime — a file touched by a backup
    // or a copy would otherwise look younger than the records inside it.
    const stale = listSegments(options.home).filter((path) => segmentDay(path) !== "" && segmentDay(path) < cutoff.slice(0, 10));
    if (options.apply) for (const path of stale) rmSync(path, { force: true });
    return { ...base, eligible: stale.length, segments: stale.map((path) => basename(path)), applied: !!options.apply };
  }

  const kinds = CLASS_KINDS[options.dataClass] ?? [];
  if (kinds.length === 0) return { ...base, eligible: 0, note: `${options.dataClass} maps to no indexed fact kind` };
  if (!existsSync(indexPath(options.home))) {
    return { ...base, eligible: 0, note: "no analytics index exists, so there is nothing to prune" };
  }

  const database = openIndex(options.home);
  try {
    const placeholders = kinds.map(() => "?").join(", ");
    const eligible = Number(
      database
        .prepare(`SELECT COUNT(*) AS n FROM facts WHERE kind IN (${placeholders}) AND occurred_at < ?`)
        .get(...kinds, cutoff)?.n ?? 0,
    );
    if (options.apply && eligible > 0) {
      database.transaction(() => {
        database.prepare(`DELETE FROM facts WHERE kind IN (${placeholders}) AND occurred_at < ?`).run(...kinds, cutoff);
      });
    }
    return { ...base, eligible, applied: !!options.apply };
  } finally {
    database.close();
  }
}

/** `activity-YYYYMMDD.jsonl` → `YYYY-MM-DD`, or `""` when the name is not one. */
function segmentDay(path: string): string {
  const match = /^activity-(\d{4})(\d{2})(\d{2})\.jsonl$/.exec(basename(path));
  return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
}
