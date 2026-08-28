// Snapshotting the operational state built in phases 3-7.
//
// THE RED TEAM KILLED THIS COMMAND ONCE, AND IT WAS RIGHT TO. `260822-1407`'s
// review struck `backups create` because the upstream CLI snapshots a database
// and this project had none — porting it would have shipped a verb with no
// subject. That verdict was about the absence of a subject, not about the idea,
// and phases 3-7 created the subject: an activity log, a projects registry, two
// opt-in markers, and per-project install receipts. The repo's own review rules
// say a verified decision reverses on new evidence and not otherwise; this is
// the new evidence.
//
// THE REVERSAL IS NARROW, AND THE NARROWNESS IS THE DESIGN. Only authoritative
// state goes in. The analytics index and the content shards are derived, and a
// snapshot that carried a reproducible cache would be exactly the dead surface
// the red team named, merely relocated — worse, it would quietly make the cache
// load-bearing again, which is the thing ADR 0014 exists to prevent.
//
// THE EXCLUSION IS ONE PREDICATE, NOT A LIST. Everything rebuildable already
// lives under `derived/`, so "leave the derived half out" is `isDerived` rather
// than a roster of filenames that a future index could be added to without
// anyone remembering to update it.
//
// SEGMENT-WISE, BECAUSE THE LOG IS APPEND-ONLY. Closed segments are immutable
// and can be copied freely. Copying the *current* one mid-append is how a
// restored log ends up with half a trailing line, so it is read into memory once
// and truncated at its last complete record — the snapshot then holds a prefix
// of a real log, which is always a valid log, rather than a torn one.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { registryPath } from "../projects/registry.js";
import { statePath as analyticsStatePath } from "../analytics/lifecycle.js";
import { contentStatePath } from "../content-search/lifecycle.js";
import { activityRoot, isDerived, operationalRoot } from "../storage/operational-paths.js";

/** Segment names the activity log actually writes. Anything else is not ours. */
const SEGMENT_PATTERN = /^activity-\d{8}\.jsonl$/;

export type SourceKind = "activity-segment" | "registry" | "opt-in-state" | "receipt";

export interface SnapshotSource {
  /** Absolute path on this machine. */
  readonly path: string;
  readonly kind: SourceKind;
  /** Path inside the snapshot, always `/`-separated. */
  readonly relPath: string;
  /**
   * True when the file may still be appended to while the snapshot runs.
   *
   * Only the newest activity segment is. Everything else here is written
   * whole, atomically, by `atomicWritePrivate`.
   */
  readonly live: boolean;
}

/** Every activity segment, oldest first. The last one is the one being written. */
export function activitySegments(home: string): string[] {
  const root = activityRoot(home);
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((name) => SEGMENT_PATTERN.test(name))
    .sort()
    .map((name) => join(root, name));
}

/**
 * Every authoritative file a snapshot should carry.
 *
 * Receipts are included because losing one orphans an install: the receipt is
 * the only record of which files on this machine belong to the kit, and without
 * it `uninstall` cannot know what it owns and `doctor` cannot know what drifted.
 */
export function snapshotSources(home: string, cwd: string): SnapshotSource[] {
  const sources: SnapshotSource[] = [];
  const segments = activitySegments(home);
  segments.forEach((path, index) => {
    sources.push({
      path,
      kind: "activity-segment",
      relPath: `activity/${basename(path)}`,
      // Only the newest segment can still be appended to; every earlier day is
      // closed and will never be written again.
      live: index === segments.length - 1,
    });
  });

  for (const [path, kind, relPath] of [
    [registryPath(home), "registry", "projects.json"],
    [analyticsStatePath(home), "opt-in-state", "analytics-state.json"],
    [contentStatePath(home), "opt-in-state", "content-search-state.json"],
  ] as const) {
    if (existsSync(path)) sources.push({ path, kind, relPath, live: false });
  }

  // Both roots: a project-scope install and a home-scope one write different
  // receipts, and a snapshot that carried only one would silently restore half
  // an install.
  for (const [root, label] of [[cwd, "project"], [home, "global"]] as const) {
    const receipt = join(root, ".ariadnev", "receipt.json");
    if (existsSync(receipt)) sources.push({ path: receipt, kind: "receipt", relPath: `receipt-${label}.json`, live: false });
  }
  return sources;
}

/**
 * Whether a path is derived, and so must never enter a snapshot.
 *
 * Exported so the exclusion can be asserted directly rather than inferred from
 * what happens to be absent — "no derived file is in the snapshot" is a claim
 * about every derived file, not about the two that exist today.
 */
export function isExcludedFromSnapshot(home: string, path: string): boolean {
  return isDerived(home, path);
}

/**
 * The bytes to store for one source, and how many records they hold.
 *
 * A live segment is truncated at its last newline. The result is a prefix of an
 * append-only file, which is itself a valid append-only file — so a snapshot
 * taken mid-write loses at most the record being written and never contains a
 * partial one. A closed file is copied verbatim.
 */
export function readSourceForSnapshot(source: SnapshotSource): { content: Buffer; truncatedBytes: number } {
  const content = readFileSync(source.path);
  if (!source.live || content.length === 0) return { content, truncatedBytes: 0 };
  const lastNewline = content.lastIndexOf(0x0a);
  if (lastNewline === content.length - 1) return { content, truncatedBytes: 0 };
  // No newline at all means the file holds only a partial first record; the
  // honest snapshot of that is empty rather than half a record.
  const end = lastNewline + 1;
  return { content: content.subarray(0, end), truncatedBytes: content.length - end };
}

export interface SnapshotPlan {
  readonly sources: readonly SnapshotSource[];
  readonly totalBytes: number;
  /** Present so a caller can report that the operational root is empty. */
  readonly operationalRoot: string;
}

/** What `backups create` would capture, without capturing it. */
export function planSnapshot(home: string, cwd: string): SnapshotPlan {
  const sources = snapshotSources(home, cwd);
  const totalBytes = sources.reduce((sum, source) => {
    try {
      return sum + statSync(source.path).size;
    } catch {
      return sum;
    }
  }, 0);
  return { sources, totalBytes, operationalRoot: operationalRoot(home) };
}
