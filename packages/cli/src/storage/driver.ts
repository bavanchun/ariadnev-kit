// The storage contract both drivers implement. Deliberately the intersection of
// `bun:sqlite` and `node:sqlite` rather than the union: the binary ships on Bun
// and the test suite runs on Node, so anything only one of them can do is a
// behaviour difference waiting to be discovered in a release.
//
// Two divergences are normalised here rather than left to callers:
//   - node:sqlite returns rows with a NULL prototype, bun:sqlite returns plain
//     objects. `toEqual`, spread, and `Object.prototype` lookups all disagree
//     across that line. Every row leaves a driver as a plain object.
//   - named parameters use `$name` on Bun and bare names on Node. The contract
//     is positional-only, which both bind identically.
//
// Derived state is never authoritative (ADR 0014). Nothing behind this
// interface may be the only copy of anything.

/** What SQLite can actually hold. */
export type SqlValue = string | number | bigint | boolean | null | Uint8Array;

/** One row, already detached from its driver's prototype. */
export type SqlRow = Record<string, SqlValue>;

export interface WriteResult {
  readonly changes: number;
  /** Normalised to `number`; Bun can hand back a bigint under safeIntegers. */
  readonly lastInsertRowid: number;
}

/**
 * Statements are cached by SQL text and reused (see either driver's `open`).
 * That is safe only because every method here materialises its whole result
 * synchronously before returning — no cursor is ever left open on a shared
 * statement. Adding an `iterate()` to this interface would turn the cache into a
 * shared-cursor bug, so it would need per-call statements instead.
 */
export interface StorageStatement {
  all(...params: SqlValue[]): SqlRow[];
  get(...params: SqlValue[]): SqlRow | undefined;
  run(...params: SqlValue[]): WriteResult;
}

export interface StorageDatabase {
  /** Statements with no bound parameters and no result — DDL and PRAGMA. */
  exec(sql: string): void;
  prepare(sql: string): StorageStatement;
  /** BEGIN/COMMIT around `body`, rolling back if it throws. Not reentrant. */
  transaction<T>(body: () => T): T;
  close(): void;
}

export interface StorageDriver {
  readonly name: DriverName;
  /**
   * `:memory:` or an absolute path. The caller owns directory creation.
   *
   * Synchronous because both underlying APIs are (`Database`, `DatabaseSync`)
   * and the module load behind them is a `require` of a builtin. An async
   * signature here would be a promise that never waits for anything, paid for
   * at every call site.
   */
  open(path: string): StorageDatabase;
}

export type DriverName = "bun" | "node";

/** A row as the driver handed it over, before normalisation. */
export type RawRow = Record<string, unknown>;

/**
 * Detach a row from whatever prototype its driver gave it.
 *
 * `{ ...row }` is enough and is why this is one line: both drivers return own
 * enumerable properties, so the spread copies every column and lands the result
 * on `Object.prototype`. It exists as a named function because the reason is not
 * visible at the call site, and because both drivers must do it identically.
 */
export function plainRow(row: RawRow): SqlRow {
  const plain: SqlRow = {};
  for (const [column, value] of Object.entries(row)) plain[column] = narrowInteger(value as SqlValue);
  return plain;
}

/**
 * SQLite's INTEGER is 64-bit and JavaScript's number is not.
 *
 * MEASURED, because the two drivers disagreed in the worst possible direction.
 * Reading a column holding 9007199254740993:
 *
 *   node:sqlite  throws "Value is too large to be represented as a JavaScript number"
 *   bun:sqlite   silently returns 9007199254740992
 *
 * So the dev runtime crashed loudly and the SHIPPED runtime corrupted the data
 * quietly. Both drivers now read integers as bigint and narrow here: a value
 * that fits comes back as a number, and one that does not stays a bigint rather
 * than being rounded. `SqlValue` already declared bigint, so nothing about the
 * contract changes — it just stops being a promise neither driver kept.
 *
 * A bigint that reaches `JSON.stringify` throws, which is the right place for a
 * value that genuinely does not fit to become someone's problem.
 */
export function narrowInteger(value: SqlValue): SqlValue {
  if (typeof value !== "bigint") return value;
  return value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : value;
}

/**
 * What a driver will actually accept as a bound parameter.
 *
 * Also measured: `run(true)` throws "Provided value cannot be bound" on
 * node:sqlite and stores 1 on bun:sqlite. `SqlValue` includes boolean, so the
 * type system was approving code half the implementations reject. SQLite has no
 * boolean type; 1 and 0 is what it stores either way.
 */
export function bindable(value: SqlValue): Exclude<SqlValue, boolean> {
  return typeof value === "boolean" ? (value ? 1 : 0) : value;
}

/** Same, for a result that may be absent. */
export function plainRowOrUndefined(row: RawRow | undefined | null): SqlRow | undefined {
  return row == null ? undefined : plainRow(row);
}

/** Bun may report a bigint rowid; the contract says number. */
export function normalizeWriteResult(result: { changes: number | bigint; lastInsertRowid: number | bigint }): WriteResult {
  return { changes: Number(result.changes), lastInsertRowid: Number(result.lastInsertRowid) };
}

/** Row ids and change counts stay numbers — both are far below 2^53 in practice. */

/**
 * Fold the write-ahead log back into the database before closing.
 *
 * Bounds WAL growth on a long-lived index, and on Windows it is what lets the
 * `-wal` and `-shm` sidecars go away with the database rather than outliving it
 * — the difference between "delete the derived index" working and returning
 * EBUSY. Best-effort in a stronger sense than the `catch` suggests: a busy
 * checkpoint does not throw, it returns a `busy=1` row that `exec` discards. So
 * with a second live connection to the same file the sidecars survive the close
 * silently. Single-connection use is the assumption everywhere today; the day
 * that stops being true, this is where to look.
 */
export function checkpointAndClose(database: { exec(sql: string): void; close(): void }): void {
  try {
    database.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  } catch {
    /* not in WAL, read-only, or nothing to fold back */
  }
  database.close();
}

/**
 * BEGIN/COMMIT/ROLLBACK written once, over `exec`.
 *
 * Bun has `db.transaction(fn)` and Node does not, so implementing this per
 * driver would mean two different rollback semantics behind one interface.
 */
export function execTransaction<T>(database: Pick<StorageDatabase, "exec">, body: () => T): T {
  database.exec("BEGIN");
  try {
    const value = body();
    database.exec("COMMIT");
    return value;
  } catch (error) {
    // A failed ROLLBACK must not replace the error that caused it.
    try {
      database.exec("ROLLBACK");
    } catch {
      /* the original error is the one worth reporting */
    }
    throw error;
  }
}

/**
 * WAL applies to file-backed databases only; on `:memory:` SQLite silently
 * stays in `memory` journal mode and answering "wal" would be a lie.
 */
export function wantsWal(path: string): boolean {
  return path !== ":memory:" && !path.startsWith("file::memory:");
}
