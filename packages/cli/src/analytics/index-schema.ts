// The derived index's shape, and how it moves forward.
//
// A VERSION AND A MIGRATION PATH, NOT JUST A VERSION. A schema that can only be
// recognised as wrong forces a delete-and-rebuild on every upgrade. That is
// survivable for a cache — nothing is lost — but it means every release makes
// the tool slow once for no reason the user can see. Migrations that can be
// applied are applied; the rest fall back to rebuild, which is always correct
// because nothing here is authoritative.
//
// ONE TABLE, DELIBERATELY. `facts` holds one row per countable event with its
// dimensions denormalised. A star schema would be the textbook answer and the
// wrong one at this size: the whole index is rebuildable in seconds from files
// on the same disk, so join-time savings buy nothing and every extra table is
// another thing a migration has to keep consistent.
//
// NO CONTENT. Columns hold identifiers, categories and counts. Message text,
// file paths and tool arguments are not indexed — the sources hold those, and a
// derived copy of the user's prose is a second place for it to leak from.

import type { StorageDatabase } from "../storage/driver.js";

/** Bumped whenever the DDL below changes in a way a reader would notice. */
export const INDEX_SCHEMA_VERSION = 1;

/**
 * `user_version` rather than a metadata table.
 *
 * It is a header field SQLite maintains itself, so it cannot disagree with the
 * file it describes, and it is readable on a database whose tables are missing
 * — which is exactly the situation a corrupt-index probe is in.
 */
export function readSchemaVersion(database: StorageDatabase): number {
  try {
    const row = database.prepare("PRAGMA user_version").get();
    return Number(row?.user_version ?? 0);
  } catch {
    return 0;
  }
}

function setSchemaVersion(database: StorageDatabase, version: number): void {
  // PRAGMA does not accept a bound parameter, and the value is a module
  // constant rather than anything a caller supplies.
  database.exec(`PRAGMA user_version = ${Math.trunc(version)}`);
}

/**
 * One row per countable event.
 *
 * `source` and `source_id` together identify where the row came from, which is
 * what makes incremental ingest idempotent: re-ingesting a file replaces its
 * rows instead of doubling them. Without that pair, `refresh` run twice would
 * report twice the activity.
 */
const DDL = `
CREATE TABLE IF NOT EXISTS facts (
  source        TEXT NOT NULL,
  source_id     TEXT NOT NULL,
  kind          TEXT NOT NULL,
  runtime       TEXT NOT NULL DEFAULT '',
  project       TEXT NOT NULL DEFAULT '',
  model         TEXT NOT NULL DEFAULT '',
  occurred_at   TEXT NOT NULL DEFAULT '',
  count         INTEGER NOT NULL DEFAULT 1,
  value         INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS facts_by_source ON facts (source, source_id);
CREATE INDEX IF NOT EXISTS facts_by_kind ON facts (kind, runtime);
CREATE INDEX IF NOT EXISTS facts_by_time ON facts (occurred_at);

CREATE TABLE IF NOT EXISTS ingested (
  source        TEXT NOT NULL,
  source_id     TEXT NOT NULL,
  fingerprint   TEXT NOT NULL,
  ingested_at   TEXT NOT NULL,
  PRIMARY KEY (source, source_id)
);
`;

export interface FactRow {
  readonly source: string;
  readonly source_id: string;
  readonly kind: string;
  readonly runtime: string;
  readonly project: string;
  readonly model: string;
  readonly occurred_at: string;
  readonly count: number;
  readonly value: number;
}

/** Create the schema on a fresh database, or migrate an older one forward. */
export function applySchema(database: StorageDatabase): void {
  const current = readSchemaVersion(database);
  if (current > INDEX_SCHEMA_VERSION) {
    // A newer build wrote this. Refusing is right: the columns this build would
    // read may mean something else now, and a derived file is never worth
    // guessing about when rebuilding it costs seconds.
    throw new Error(
      `analytics index schema ${current} is newer than this build understands (${INDEX_SCHEMA_VERSION}) — ` +
        "run `av analytics rebuild` to replace it",
    );
  }
  database.exec(DDL);
  if (current !== INDEX_SCHEMA_VERSION) setSchemaVersion(database, INDEX_SCHEMA_VERSION);
}

/** Remove every row, keeping the schema. What a full rebuild starts from. */
export function truncate(database: StorageDatabase): void {
  database.exec("DELETE FROM facts; DELETE FROM ingested;");
}
