// Opening, refreshing and rebuilding the index.
//
// `rebuild` IS `refresh` WITH THE SKIP-LIST EMPTIED. Both call `ingest`; the
// only difference is `full`, which also lets the sweep notice sources that have
// disappeared. There is no second traversal to drift from the first, which is
// the failure the phase's convergence assertion is aimed at — and the reason it
// can be asserted at all.
//
// A REBUILD TRUNCATES FIRST. Not "delete the file": the file may be open, and
// on Windows it may not be removable while it is. Clearing the tables inside a
// transaction gets the same result and cannot leave a half-deleted database
// behind.

import { dirname } from "node:path";
import { openDatabase } from "../storage/select-driver.js";
import { ensureOperationalDirectory } from "../storage/operational-paths.js";
import type { StorageDatabase } from "../storage/driver.js";
import { applySchema, truncate } from "./index-schema.js";
import { ingest, type IngestOptions, type IngestReport } from "./ingest.js";
import { indexPath, recordSuccess } from "./lifecycle.js";

/**
 * Open the index, creating the file and schema if needed.
 *
 * The caller closes it. Nothing here opens a database as a side effect of an
 * unrelated command — `status` probes and closes, and every other verb is an
 * explicit request to touch the index.
 */
export function openIndex(home: string): StorageDatabase {
  const path = indexPath(home);
  // The PARENT, not the file: `ensureOperationalDirectory` creates the path it
  // is given as a directory, and handing it the database path made
  // `analytics.db` a directory that SQLite then could not open.
  ensureOperationalDirectory(home, dirname(path));
  const database = openDatabase(path);
  try {
    applySchema(database);
  } catch (error) {
    database.close();
    throw error;
  }
  return database;
}

export interface BuildOptions extends Omit<IngestOptions, "full"> {
  /** Discard every row first. `rebuild` does; `refresh` does not. */
  readonly fromScratch?: boolean;
}

export interface BuildResult extends IngestReport {
  readonly factCount: number;
  readonly elapsedMs: number;
}

function factCount(database: StorageDatabase): number {
  return Number(database.prepare("SELECT COUNT(*) AS n FROM facts").get()?.n ?? 0);
}

/** Shared body of `refresh` and `rebuild`. */
function build(home: string, options: BuildOptions): BuildResult {
  const started = Date.now();
  const database = openIndex(home);
  try {
    if (options.fromScratch) database.transaction(() => truncate(database));
    const report = ingest(database, { ...options, full: !!options.fromScratch });
    const count = factCount(database);
    recordSuccess(home, options.now, count);
    return { ...report, factCount: count, elapsedMs: Date.now() - started };
  } finally {
    database.close();
  }
}

/** Incremental: skip sources whose fingerprint is unchanged. */
export function refreshIndex(home: string, options: Omit<BuildOptions, "home">): BuildResult {
  return build(home, { ...options, home, fromScratch: false });
}

/** Full: discard everything and read every source again. */
export function rebuildIndex(home: string, options: Omit<BuildOptions, "home">): BuildResult {
  return build(home, { ...options, home, fromScratch: true });
}
