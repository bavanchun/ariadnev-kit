// Walking one project and writing its text into that project's shard.
//
// EVERY REFUSAL IS RECORDED, NOT JUST ACTED ON. The walk returns a count per
// reason — denied, ignored, binary, too large — because "the shard has 412
// documents" is unfalsifiable on its own. A regression that started indexing
// `.env` files would not change that number in any way a person would notice,
// whereas `denied: 0` on a project that has a `.env` is visible and is what the
// suite asserts against.
//
// THE DENYLIST IS CHECKED BEFORE THE IGNORE RULES AND BEFORE ANY READ. A file
// that is always denied is never opened, so its contents cannot reach a buffer
// this process later writes somewhere. That ordering is the difference between
// "we do not index secrets" and "we read secrets and then choose not to store
// them".
//
// BOUNDS ARE DEFAULTS. A content indexer with no file cap will eventually meet
// a repository with a 400 MB fixture, and a CLI that an agent invokes cannot be
// interrupted from the outside.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { StorageDatabase } from "../storage/driver.js";
import {
  ALWAYS_SKIPPED_DIRECTORIES,
  isAlwaysDenied,
  projectIgnoreMatcher,
  relativePath,
  type IgnoreMatcher,
  type SkipReason,
} from "./ignore-rules.js";

/** Bigger than this is a build artifact or a fixture, not something to search. */
export const MAX_FILE_BYTES = 256 * 1024;
/** A whole-repo cap, so one pathological tree cannot run unbounded. */
export const MAX_FILES = 5_000;
/** How much of a file is inspected before deciding it is not text. */
const BINARY_SNIFF_BYTES = 8 * 1024;

export interface IndexReport {
  readonly documents: number;
  readonly bytes: number;
  /** How many files each rule refused, so the refusals can be asserted on. */
  readonly skipped: Readonly<Record<SkipReason, number>>;
  /** True when the file cap stopped the walk before it ran out of files. */
  readonly truncated: boolean;
  readonly elapsedMs: number;
}

interface Candidate {
  readonly absolute: string;
  readonly relative: string;
  readonly bytes: number;
}

/**
 * A NUL byte in the first few kilobytes means this is not text.
 *
 * The same heuristic git uses, and for the same reason: an encoding-sniffing
 * library would be a dependency, and the failure mode of this test — refusing a
 * text file that happens to contain a NUL — costs a missing search result
 * rather than a corrupted shard.
 */
export function looksBinary(buffer: Buffer): boolean {
  return buffer.subarray(0, BINARY_SNIFF_BYTES).includes(0);
}

/**
 * Every file eligible for indexing under `root`, with the refusals tallied.
 *
 * Separated from the writing below so the decision about what may be read is
 * testable without a database, which is what lets the `.env` assertion be a
 * direct one rather than a search for absence after the fact.
 */
export function collectCandidates(
  root: string,
  matcher: IgnoreMatcher = projectIgnoreMatcher(root),
): { candidates: Candidate[]; skipped: Record<SkipReason, number>; truncated: boolean } {
  const skipped: Record<SkipReason, number> = {
    denied: 0, ignored: 0, binary: 0, "too-large": 0, "skipped-directory": 0,
  };
  const candidates: Candidate[] = [];
  let truncated = false;

  const walk = (directory: string): void => {
    if (truncated) return;
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      // An unreadable directory is skipped, not fatal: indexing must not fail
      // because one subtree has restrictive permissions.
      return;
    }
    for (const entry of entries) {
      if (truncated) return;
      const absolute = join(directory, entry.name);
      const relative = relativePath(root, absolute);
      if (entry.isDirectory()) {
        if (ALWAYS_SKIPPED_DIRECTORIES.includes(entry.name)) {
          skipped["skipped-directory"] += 1;
          continue;
        }
        if (matcher.ignores(relative, true)) {
          skipped.ignored += 1;
          continue;
        }
        walk(absolute);
        continue;
      }
      // Symlinks are not followed: a link out of the project would index a file
      // the project does not own and that its ignore rules never described.
      if (!entry.isFile()) continue;
      if (isAlwaysDenied(entry.name)) {
        skipped.denied += 1;
        continue;
      }
      if (matcher.ignores(relative, false)) {
        skipped.ignored += 1;
        continue;
      }
      let bytes: number;
      try {
        bytes = statSync(absolute).size;
      } catch {
        continue;
      }
      if (bytes > MAX_FILE_BYTES) {
        skipped["too-large"] += 1;
        continue;
      }
      candidates.push({ absolute, relative, bytes });
      if (candidates.length >= MAX_FILES) truncated = true;
    }
  };

  walk(root);
  return { candidates, skipped, truncated };
}

const INSERT_DOC = "INSERT OR REPLACE INTO docs (path, body, bytes, indexed_at) VALUES (?, ?, ?, ?)";
const INSERT_FTS = "INSERT INTO docs_fts (path, body) VALUES (?, ?)";

/**
 * Replace a shard's contents with a fresh read of the project.
 *
 * Always a full replacement rather than an incremental update. A content shard
 * has no fingerprint that is cheaper than reading the file, so an incremental
 * path would be a second traversal with the same cost and its own way of
 * drifting from this one — the failure phase 6 avoided by making `rebuild` be
 * `refresh` with the skip-list emptied.
 */
export function indexProject(
  shard: { database: StorageDatabase; fts5: boolean },
  root: string,
  now: string,
): IndexReport {
  const started = Date.now();
  const { candidates, skipped, truncated } = collectCandidates(root);

  let documents = 0;
  let bytes = 0;
  shard.database.transaction(() => {
    shard.database.exec("DELETE FROM docs");
    if (shard.fts5) shard.database.exec("DELETE FROM docs_fts");
    const insertDoc = shard.database.prepare(INSERT_DOC);
    const insertFts = shard.fts5 ? shard.database.prepare(INSERT_FTS) : undefined;
    for (const candidate of candidates) {
      let buffer: Buffer;
      try {
        buffer = readFileSync(candidate.absolute);
      } catch {
        continue;
      }
      if (looksBinary(buffer)) {
        skipped.binary += 1;
        continue;
      }
      const body = buffer.toString("utf8");
      insertDoc.run(candidate.relative, body, candidate.bytes, now);
      insertFts?.run(candidate.relative, body);
      documents += 1;
      bytes += candidate.bytes;
    }
  });

  return { documents, bytes, skipped, truncated, elapsedMs: Date.now() - started };
}
