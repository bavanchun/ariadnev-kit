// One shard per project: open it, create it, delete it.
//
// ONE FILE PER PROJECT, NOT ONE TABLE FOR ALL. This follows from the opt-in
// model rather than from taste. A per-project file makes `delete` an unlink and
// `disable` a flag, and — the part that matters — it makes it structurally
// impossible for opting one project in to put another project's content
// anywhere. With a shared table that property would rest on every query
// remembering its `WHERE project = ?`, which is the kind of guarantee that
// holds until the one query that forgets.
//
// THE ROWS ARE THE SAME WITH OR WITHOUT FTS5. `docs` is an ordinary table and
// is the only place document text is stored; the FTS5 virtual table is an index
// over it, created when the runtime has FTS5 and absent when it does not. So the
// fallback is not a second storage format with a second set of bugs — it is the
// same rows read a slower way, which is what lets one suite test both paths and
// what makes "delete the shard, rebuild, same results" comparable across them.

import { chmodSync, existsSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { checkpointAndClose, type StorageDatabase } from "../storage/driver.js";
import { openDatabase } from "../storage/select-driver.js";
import { contentRoot, ensureOperationalDirectory, removeStorageTree } from "../storage/operational-paths.js";
import { sqliteSelfTest } from "../storage/sqlite-self-test.js";

export const SHARD_SCHEMA_VERSION = 1;

/**
 * A shard's filename, derived from the project's absolute directory.
 *
 * A hash rather than the path: directories contain separators and characters no
 * filesystem agrees on, and a deep path would exceed the name limit long before
 * it became unreadable. The mapping back to a directory is not lost — the
 * opt-in state file records `dir` beside it, so `status` can name the project
 * without anyone having to reverse a digest.
 */
export function shardId(dir: string): string {
  return createHash("sha256").update(dir).digest("hex").slice(0, 16);
}

export function shardPath(home: string, dir: string): string {
  return join(contentRoot(home), `${shardId(dir)}.db`);
}

/** Whether this runtime can build an FTS5 index, measured rather than assumed. */
export function hasFts5(): boolean {
  return sqliteSelfTest().fts5;
}

const DOCS_DDL = `
CREATE TABLE IF NOT EXISTS docs (
  path       TEXT PRIMARY KEY,
  body       TEXT NOT NULL,
  bytes      INTEGER NOT NULL,
  indexed_at TEXT NOT NULL
)`;

const FTS_DDL = `CREATE VIRTUAL TABLE IF NOT EXISTS docs_fts USING fts5(path UNINDEXED, body)`;

/**
 * Create the schema. Idempotent, so re-opening an existing shard is a no-op.
 *
 * The FTS5 table is attempted and its failure is swallowed on purpose: a
 * runtime without FTS5 must still get a working shard, and finding that out by
 * asking SQLite is more honest than trusting a capability probe run minutes
 * earlier against a different database.
 */
export function applyShardSchema(database: StorageDatabase): { fts5: boolean } {
  database.exec(DOCS_DDL);
  database.exec(`PRAGMA user_version = ${SHARD_SCHEMA_VERSION}`);
  try {
    database.exec(FTS_DDL);
    return { fts5: true };
  } catch {
    return { fts5: false };
  }
}

export function readShardSchemaVersion(database: StorageDatabase): number {
  return Number(database.prepare("PRAGMA user_version").get()?.user_version ?? 0);
}

/**
 * 0600 on the shard and its WAL companions.
 *
 * This file holds the user's source code as plaintext. SQLite creates the
 * sidecars itself, at whatever the umask allows — measured as 0644 — so on a
 * shared host the default would make a project world-readable. Re-applied after
 * every open because `-wal` and `-shm` come and go on SQLite's schedule.
 */
export function restrictShardToOwner(path: string): void {
  if (process.platform === "win32") return;
  for (const target of [path, `${path}-wal`, `${path}-shm`]) {
    try {
      chmodSync(target, 0o600);
    } catch {
      // A companion that does not exist yet is the ordinary case.
    }
  }
}

export interface OpenShard {
  readonly database: StorageDatabase;
  readonly path: string;
  /** Whether this shard has an FTS5 index, or only the `docs` table. */
  readonly fts5: boolean;
}

/** Open (creating if needed) one project's shard. The caller closes it. */
export function openShard(home: string, dir: string): OpenShard {
  const path = shardPath(home, dir);
  // The PARENT, not the file: `ensureOperationalDirectory` creates what it is
  // given as a directory, and a shard path handed to it becomes a directory
  // SQLite then cannot open.
  ensureOperationalDirectory(home, dirname(path));
  const database = openDatabase(path);
  let fts5: boolean;
  try {
    fts5 = applyShardSchema(database).fts5;
  } catch (error) {
    database.close();
    throw error;
  }
  restrictShardToOwner(path);
  return { database, path, fts5 };
}

export function closeShard(shard: OpenShard): void {
  // Folds the WAL back in first, which is what lets the sidecars go away with
  // the database on Windows rather than outliving it.
  checkpointAndClose(shard.database);
}

export interface ShardStats {
  readonly exists: boolean;
  readonly bytes: number;
  readonly docs: number;
  readonly fts5: boolean;
  readonly schemaVersion: number;
}

/** Size and document count without altering anything. `status` and `delete` read this. */
export function shardStats(home: string, dir: string): ShardStats {
  const path = shardPath(home, dir);
  if (!existsSync(path)) return { exists: false, bytes: 0, docs: 0, fts5: false, schemaVersion: 0 };
  const bytes = statSync(path).size;
  let database: StorageDatabase | undefined;
  try {
    database = openDatabase(path);
    const docs = Number(database.prepare("SELECT COUNT(*) AS n FROM docs").get()?.n ?? 0);
    const fts5 = Number(
      database.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='docs_fts'").get()?.n ?? 0,
    ) > 0;
    return { exists: true, bytes, docs, fts5, schemaVersion: readShardSchemaVersion(database) };
  } catch {
    // Unreadable is a state `status` must be able to report; throwing here would
    // make the command that diagnoses a corrupt shard the one that fails on it.
    return { exists: true, bytes, docs: 0, fts5: false, schemaVersion: 0 };
  } finally {
    database?.close();
  }
}

export interface ShardDeletion {
  readonly removed: boolean;
  readonly bytesFreed: number;
  readonly docs: number;
}

/** Remove one project's shard and its sidecars. Nothing else is touched. */
export function deleteShard(home: string, dir: string): ShardDeletion {
  const stats = shardStats(home, dir);
  if (!stats.exists) return { removed: false, bytesFreed: 0, docs: 0 };
  const path = shardPath(home, dir);
  for (const target of [path, `${path}-wal`, `${path}-shm`]) removeStorageTree(target);
  return { removed: true, bytesFreed: stats.bytes, docs: stats.docs };
}

/** Create the content root itself, 0700, before the first shard lands in it. */
export function ensureContentRoot(home: string): string {
  return ensureOperationalDirectory(home, contentRoot(home));
}
