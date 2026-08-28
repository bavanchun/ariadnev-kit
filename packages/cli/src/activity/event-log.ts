// The activity log on disk: append-only JSONL, one file per UTC day.
//
// WHY FILES AND NOT SQLITE. This is the authoritative source — everything the
// later phases index is derived from here, and nothing can rebuild it. ADR 0014
// puts authoritative state in files for exactly that reason, and a file also
// stays readable when the CLI cannot run, which is when a user most needs it.
//
// WHY ONE FILE PER DAY. Retention has to be a file unlink. A single growing log
// can only be pruned by rewriting it, and a log that must be rewritten to prune
// is not append-only — the rewrite is a window where a crash loses everything.
// The day is **UTC**, so the segment a user sees does not depend on where they
// are sitting.
//
// WHAT THE ATOMICITY CLAIM ACTUALLY IS. Appends open with `O_APPEND`, which
// makes the offset advance atomically, so two writers never overwrite each
// other. It does not make an arbitrarily large write atomic — past a
// filesystem-dependent size two appends can interleave and tear a line — which
// is why `serializeEvent` caps the record. On a **local** filesystem that
// combination is what makes "concurrent appends never tear a line" true. On NFS
// it guarantees nothing, and this module does not pretend otherwise.

import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { appendLineSafe, readLines } from "../log/jsonl-log.js";
import { activityRoot } from "../storage/operational-paths.js";
import { serializeEvent, type ActivityEventV1 } from "./event-types.js";

const SEGMENT_PATTERN = /^activity-\d{8}\.jsonl$/;

/** Marker beside the log, so an empty log stays distinct from a broken one. */
export function activityDegradedMarkerPath(home: string): string {
  return join(activityRoot(home), "activity.degraded");
}

/** The segment a given moment belongs to. UTC, always. */
export function segmentPath(home: string, when: Date = new Date()): string {
  const day = when.toISOString().slice(0, 10).split("-").join("");
  return join(activityRoot(home), `activity-${day}.jsonl`);
}

/** Every segment, oldest first. Reading never creates the directory. */
export function listSegments(home: string): string[] {
  const root = activityRoot(home);
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((name) => SEGMENT_PATTERN.test(name))
    .sort()
    .map((name) => join(root, name));
}

/**
 * Record one event. Never throws — not for a full disk, not for an oversized
 * record, not for a home directory that turned out to be a file.
 *
 * This is the property the whole log is subordinate to: an install must not
 * fail because a log write failed. Emission is fire-and-forget, always.
 */
export function appendActivityEvent(home: string, event: ActivityEventV1, when: Date = new Date()): void {
  let line: string;
  try {
    line = serializeEvent(event);
  } catch {
    // Past the atomic-append ceiling. Dropping the event is the lesser harm:
    // writing it would risk tearing a line and corrupting its neighbours too.
    return;
  }
  appendLineSafe({ path: segmentPath(home, when), line, markerPath: activityDegradedMarkerPath(home) });
}

/** True when an append failed at some point and events were lost. */
export function isActivityDegraded(home: string): boolean {
  return existsSync(activityDegradedMarkerPath(home));
}

export interface ReadActivityOptions {
  /** Return only events with an ID strictly greater than this cursor. */
  readonly since?: string;
  /** Stop after this many. Newest are kept. */
  readonly limit?: number;
}

/**
 * Read events, newest first.
 *
 * Bounded by reading segments newest-first and stopping once `limit` is
 * satisfied, so the common `list` call touches one day's file rather than the
 * whole history. A `since` cursor still stops early: IDs sort in emission
 * order, so once a segment's newest event is below the cursor, every older
 * segment is too.
 */
export function readActivity(home: string, options: ReadActivityOptions = {}): ActivityEventV1[] {
  const limit = options.limit ?? Number.POSITIVE_INFINITY;
  const found: ActivityEventV1[] = [];
  for (const path of listSegments(home).reverse()) {
    if (found.length >= limit) break;
    const segment = readLines<ActivityEventV1>(path);
    for (let index = segment.length - 1; index >= 0; index -= 1) {
      const event = segment[index];
      if (options.since !== undefined && event.id <= options.since) {
        // Segments are ordered, so nothing older can be above the cursor.
        return found;
      }
      found.push(event);
      if (found.length >= limit) break;
    }
  }
  return found;
}

/** Guard against a stray file in a directory users are invited to read. */
export function isSegment(name: string): boolean {
  return SEGMENT_PATTERN.test(name);
}

/** Bytes currently held by the log, for `doctor` and the retention sweep. */
export function activityBytes(home: string): number {
  return listSegments(home).reduce((total, path) => total + statSync(path).size, 0);
}
