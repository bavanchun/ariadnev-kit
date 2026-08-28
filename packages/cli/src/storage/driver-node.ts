// `node:sqlite` — the driver vitest and local development use. Node is the
// established test runtime here (143 suites), and moving the whole suite to Bun
// to avoid a second driver would be a far larger change than the driver is.
//
// The floor is Node 22.13, not 22.5: the module landed in 22.5 but stayed behind
// `--experimental-sqlite` until 22.13.0, so below that this resolves to the same
// "No such built-in module" Bun gives. `engines.node` says so, and CI pins 24.
//
// The module is loaded through `loadSqlite`, never a literal import; that file
// carries the measurements explaining why.

import {
  checkpointAndClose,
  bindable,
  execTransaction,
  normalizeWriteResult,
  plainRow,
  plainRowOrUndefined,
  wantsWal,
  type RawRow,
  type SqlValue,
  type StorageDatabase,
  type StorageDriver,
  type StorageStatement,
} from "./driver.js";
import { loadSqlite } from "./load-sqlite.js";

/** The slice of `node:sqlite` this driver uses. Declared rather than imported so
 *  the driver does not depend on which `@types/node` minor is installed. */
interface NodeStatement {
  all(...params: SqlValue[]): RawRow[];
  get(...params: SqlValue[]): RawRow | undefined | null;
  run(...params: SqlValue[]): { changes: number | bigint; lastInsertRowid: number | bigint };
  /** Releases the native statement. Present on bun:sqlite; absent on some node:sqlite minors. */
  finalize?(): void;
  /** Return 64-bit integers as bigint rather than throwing on large ones. */
  setReadBigInts?(enabled: boolean): void;
}

interface NodeDatabase {
  exec(sql: string): void;
  prepare(sql: string): NodeStatement;
  close(): void;
}

interface NodeSqliteModule {
  DatabaseSync: new (path: string) => NodeDatabase;
}

const NODE_SQLITE = "node:sqlite";

function wrapStatement(statement: NodeStatement): StorageStatement {
  // Lossless integer reads. The narrowing back to `number` happens once, in
  // `plainRow`, so both drivers answer identically at the far end.
  statement.setReadBigInts?.(true);
  return {
    all: (...params) => statement.all(...params.map(bindable)).map(plainRow),
    get: (...params) => plainRowOrUndefined(statement.get(...params.map(bindable))),
    run: (...params) => normalizeWriteResult(statement.run(...params.map(bindable))),
  };
}

export const nodeDriver: StorageDriver = {
  name: "node",
  open(path: string): StorageDatabase {
    const { DatabaseSync } = loadSqlite<NodeSqliteModule>(NODE_SQLITE);
    const database = new DatabaseSync(path);
    if (wantsWal(path)) database.exec("PRAGMA journal_mode = WAL");
    // Prepared statements are a native resource, and one left unfinalised keeps
    // a handle on the database file. On Windows that makes the file
    // undeletable, which breaks the one operation ADR 0014 rests on. Caching by
    // SQL text both bounds the set and avoids re-preparing the same query.
    let closed = false;
    const prepared = new Map<string, NodeStatement>();
    return {
      exec: (sql) => database.exec(sql),
      prepare: (sql) => {
        let statement = prepared.get(sql);
        if (!statement) {
          statement = database.prepare(sql);
          prepared.set(sql, statement);
        }
        return wrapStatement(statement);
      },
      transaction: (body) => execTransaction({ exec: (sql) => database.exec(sql) }, body),
      close: () => {
        // node:sqlite throws "database is not open" on a second close and
        // bun:sqlite no-ops, so a `finally { close() }` after an explicit close
        // crashes under vitest and not in the binary. Measured; the flag is what
        // stops the wrapper from having two behaviours.
        if (closed) return;
        closed = true;
        for (const statement of prepared.values()) {
          try {
            statement.finalize?.();
          } catch {
            /* already finalised, or a driver that does not expose it */
          }
        }
        prepared.clear();
        checkpointAndClose(database);
      },
    };
  },
};
