// Whether the analytics index is on, and whether it is usable.
//
// THE STATE FILE IS AUTHORITATIVE AND LIVES OUTSIDE `derived/`. That is the one
// structural decision in this module. "The user turned analytics off" is a
// choice, not a cached fact — if it lived under `derived/` then deleting the
// index, which ADR 0014 says must always be safe, would silently switch
// analytics back on. Someone who disabled it for privacy would have it
// re-enabled by an operation the tool advertises as harmless.
//
// So: the index goes under `derived/` and can be deleted at will; the decision
// about it sits beside it and survives.
//
// ABSENT, DISABLED AND CORRUPT ARE THREE STATES, NOT ONE. They need three
// different fixes — enable it, re-enable it, delete and rebuild it — so
// collapsing them into "not working" makes `status` useless exactly when
// someone is trying to work out what to do.

import { existsSync, readFileSync, rmSync, statSync } from "node:fs";
import { dirname } from "node:path";
import { atomicWritePrivate } from "../install/fs-atomic.js";
import { openDatabase } from "../storage/select-driver.js";
import { derivedPath, ensureOperationalDirectory, operationalPath } from "../storage/operational-paths.js";
import { INDEX_SCHEMA_VERSION, readSchemaVersion } from "./index-schema.js";

/** `~/.ariadnev/operational/analytics-state.json`. Authoritative, not derived. */
export function statePath(home: string): string {
  return operationalPath(home, "analytics-state.json");
}

/** `~/.ariadnev/operational/derived/analytics.db`. Deletable at any moment. */
export function indexPath(home: string): string {
  return derivedPath(home, "analytics.db");
}

export interface AnalyticsState {
  readonly enabled: boolean;
  /** When the user last changed the setting. */
  readonly updated_at?: string;
  /** Last completed ingest or rebuild. */
  readonly last_successful_at?: string;
  /** Rows in the index at that point, for `status` to report without opening it. */
  readonly fact_count?: number;
}

const DEFAULT_STATE: AnalyticsState = { enabled: false };

/**
 * Read the state. Missing means disabled, because the index is opt-in.
 *
 * A malformed file also reads as disabled rather than throwing. The safe
 * default for "should this tool index the user's work" is no, and a corrupt
 * preference file is not a reason to refuse every other command.
 */
export function readState(home: string): AnalyticsState {
  const path = statePath(home);
  if (!existsSync(path)) return DEFAULT_STATE;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as AnalyticsState;
    return typeof parsed?.enabled === "boolean" ? parsed : DEFAULT_STATE;
  } catch {
    return DEFAULT_STATE;
  }
}

export function writeState(home: string, state: AnalyticsState): void {
  const path = statePath(home);
  // The parent directory, 0700; the file itself is written 0600 below. Passing
  // the file path here would create it as a directory.
  ensureOperationalDirectory(home, dirname(path));
  // 0600: this records what the user chose about indexing their own work.
  atomicWritePrivate(path, `${JSON.stringify(state, null, 2)}\n`);
}

/** Health of the index file itself, independent of whether reads are enabled. */
export type IndexHealth = "absent" | "ready" | "stale" | "corrupt";

export interface AnalyticsStatus {
  readonly enabled: boolean;
  /** `index` when reads use it, `sources` when they scan the files instead. */
  readonly serving_mode: "index" | "sources";
  readonly health: IndexHealth;
  readonly fact_count: number;
  /**
   * The INDEX's schema version, not the envelope's.
   *
   * Named apart on purpose: inside a `data` payload, a bare `schema_version`
   * reads as a duplicate of the envelope's own, and the two are unrelated
   * numbers that would drift independently.
   */
  readonly index_schema_version: number;
  readonly last_successful_at?: string;
  /** Why the index is not being served, when it is not. */
  readonly staleness_reason?: string;
}

/**
 * Probe the index without repairing it.
 *
 * `status` is the command someone runs when something is wrong, so it must
 * never be the command that changes things. It opens read-only, answers, and
 * closes.
 */
export function probeHealth(home: string): { health: IndexHealth; facts: number; schema: number } {
  const path = indexPath(home);
  if (!existsSync(path)) return { health: "absent", facts: 0, schema: 0 };
  let database;
  try {
    database = openDatabase(path);
  } catch {
    return { health: "corrupt", facts: 0, schema: 0 };
  }
  try {
    const schema = readSchemaVersion(database);
    if (schema === 0) return { health: "corrupt", facts: 0, schema: 0 };
    const row = database.prepare("SELECT COUNT(*) AS n FROM facts").get();
    const facts = Number(row?.n ?? 0);
    // A schema older than this build's is stale, not broken: the data is
    // readable and a rebuild fixes it. Reporting it as corrupt would send
    // someone to delete a file that only needed refreshing.
    return { health: schema === INDEX_SCHEMA_VERSION ? "ready" : "stale", facts, schema };
  } catch {
    return { health: "corrupt", facts: 0, schema: 0 };
  } finally {
    database?.close();
  }
}

export function analyticsStatus(home: string): AnalyticsStatus {
  const state = readState(home);
  const { health, facts, schema } = probeHealth(home);
  // Reads use the index only when the user enabled it AND it is actually
  // usable. Every other combination falls back to scanning the sources, which
  // is the reference implementation rather than a degraded one.
  const serving = state.enabled && health === "ready";
  const reason =
    !state.enabled ? "analytics is disabled"
    : health === "absent" ? "no index has been built yet"
    : health === "stale" ? `index schema ${schema} predates this build's ${INDEX_SCHEMA_VERSION}`
    : health === "corrupt" ? "the index could not be read"
    : undefined;

  return {
    enabled: state.enabled,
    serving_mode: serving ? "index" : "sources",
    health,
    fact_count: facts,
    index_schema_version: INDEX_SCHEMA_VERSION,
    ...(state.last_successful_at ? { last_successful_at: state.last_successful_at } : {}),
    ...(reason ? { staleness_reason: reason } : {}),
  };
}

/** True when a read should go through the index rather than scanning sources. */
export function servingFromIndex(home: string): boolean {
  return analyticsStatus(home).serving_mode === "index";
}

export function enableAnalytics(home: string, now: string): AnalyticsState {
  const next = { ...readState(home), enabled: true, updated_at: now };
  writeState(home, next);
  return next;
}

/**
 * Stop serving from the index, keeping the index.
 *
 * Distinct from `delete` on purpose, and the distinction is the user's intent:
 * "stop using this" and "get rid of this" are different requests, and answering
 * the first with the second destroys work that a re-enable would have restored
 * for free.
 */
export function disableAnalytics(home: string, now: string): AnalyticsState {
  const next = { ...readState(home), enabled: false, updated_at: now };
  writeState(home, next);
  return next;
}

export interface DeleteResult {
  readonly removed: boolean;
  readonly bytesFreed: number;
}

/**
 * Remove the index. The enable/disable setting is untouched.
 *
 * Deleting derived state never changes a decision the user made — that is the
 * whole reason the state file lives outside `derived/`.
 */
export function deleteIndex(home: string): DeleteResult {
  const path = indexPath(home);
  if (!existsSync(path)) return { removed: false, bytesFreed: 0 };
  const bytes = statSync(path).size;
  rmSync(path, { force: true });
  // SQLite's WAL companions are part of the database, not separate files a user
  // would think to remove. Leaving them behind makes the next open see a
  // journal for a database that no longer exists.
  for (const suffix of ["-wal", "-shm"]) rmSync(`${path}${suffix}`, { force: true });
  return { removed: true, bytesFreed: bytes };
}

/** Record a completed ingest or rebuild, for `status` to report. */
export function recordSuccess(home: string, now: string, factCount: number): void {
  writeState(home, { ...readState(home), last_successful_at: now, fact_count: factCount });
}
