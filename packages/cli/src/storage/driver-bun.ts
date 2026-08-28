// `bun:sqlite` — the driver the shipped binary uses. Bun bundles SQLite with
// FTS5 compiled in, so there is no native addon and nothing to resolve at
// install time, which is the whole reason the single-binary distribution
// survives contact with a database.
//
// The module is loaded through `loadSqlite`, never a literal import; that file
// carries the measurements explaining why.

import {
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

/** The slice of `bun:sqlite` this driver uses, declared rather than imported —
 *  the repo carries `@types/node` and deliberately not `@types/bun`. */
interface BunStatement {
  all(...params: SqlValue[]): RawRow[];
  get(...params: SqlValue[]): RawRow | undefined | null;
  run(...params: SqlValue[]): { changes: number | bigint; lastInsertRowid: number | bigint };
}

interface BunDatabase {
  exec(sql: string): void;
  prepare(sql: string): BunStatement;
  close(): void;
}

interface BunSqliteModule {
  Database: new (path: string, options?: { create?: boolean }) => BunDatabase;
}

const BUN_SQLITE = "bun:sqlite";

function wrapStatement(statement: BunStatement): StorageStatement {
  return {
    all: (...params) => statement.all(...params).map(plainRow),
    get: (...params) => plainRowOrUndefined(statement.get(...params)),
    run: (...params) => normalizeWriteResult(statement.run(...params)),
  };
}

export const bunDriver: StorageDriver = {
  name: "bun",
  open(path: string): StorageDatabase {
    const { Database } = loadSqlite<BunSqliteModule>(BUN_SQLITE);
    const database = new Database(path, { create: true });
    if (wantsWal(path)) database.exec("PRAGMA journal_mode = WAL");
    return {
      exec: (sql) => database.exec(sql),
      prepare: (sql) => wrapStatement(database.prepare(sql)),
      transaction: (body) => execTransaction({ exec: (sql) => database.exec(sql) }, body),
      close: () => database.close(),
    };
  },
};
