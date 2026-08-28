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
  return {
    all: (...params) => statement.all(...params).map(plainRow),
    get: (...params) => plainRowOrUndefined(statement.get(...params)),
    run: (...params) => normalizeWriteResult(statement.run(...params)),
  };
}

export const nodeDriver: StorageDriver = {
  name: "node",
  open(path: string): StorageDatabase {
    const { DatabaseSync } = loadSqlite<NodeSqliteModule>(NODE_SQLITE);
    const database = new DatabaseSync(path);
    if (wantsWal(path)) database.exec("PRAGMA journal_mode = WAL");
    return {
      exec: (sql) => database.exec(sql),
      prepare: (sql) => wrapStatement(database.prepare(sql)),
      transaction: (body) => execTransaction({ exec: (sql) => database.exec(sql) }, body),
      close: () => database.close(),
    };
  },
};
