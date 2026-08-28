// The storage conformance suite, written once and run twice.
//
// It carries no test-framework import on purpose. vitest runs it under Node
// against `node:sqlite` (`conformance.test.ts`); `scripts/run-storage-conformance.ts`
// runs the same array under Bun against `bun:sqlite`. Two copies of these
// assertions would drift, and the drift would be invisible until a release —
// which is the exact failure the dual driver exists to prevent.

import type { SqlRow, StorageDatabase } from "./driver.js";

export interface ConformanceContext {
  open(path: string): StorageDatabase;
  /** An absolute path inside a directory the runner owns and cleans up. */
  tempFile(name: string): string;
}

export interface ConformanceCase {
  readonly name: string;
  run(context: ConformanceContext): void;
}

/** Framework-free assertion: throws an Error the caller reports as-is. */
function check(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function checkEqual(actual: unknown, expected: unknown, label: string): void {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  check(a === b, `${label}: got ${a}, expected ${b}`);
}

function withDatabase(context: ConformanceContext, path: string, body: (db: StorageDatabase) => void): void {
  const database = context.open(path);
  try {
    body(database);
  } finally {
    database.close();
  }
}

function journalMode(database: StorageDatabase): string {
  const row = database.prepare("PRAGMA journal_mode").get();
  return String(row?.journal_mode ?? "");
}

export const storageConformanceCases: readonly ConformanceCase[] = [
  {
    name: "round-trips rows through exec and prepare",
    run: (context) => withDatabase(context, ":memory:", (db) => {
      db.exec("CREATE TABLE note(id INTEGER PRIMARY KEY, body TEXT)");
      db.prepare("INSERT INTO note(body) VALUES (?)").run("first");
      db.prepare("INSERT INTO note(body) VALUES (?)").run("second");
      checkEqual(db.prepare("SELECT body FROM note ORDER BY id").all(), [{ body: "first" }, { body: "second" }], "rows");
    }),
  },
  {
    name: "hands back plain objects, not the driver's own prototype",
    run: (context) => withDatabase(context, ":memory:", (db) => {
      db.exec("CREATE TABLE note(body TEXT)");
      db.prepare("INSERT INTO note(body) VALUES (?)").run("x");
      const row = db.prepare("SELECT body FROM note").all()[0] as SqlRow;
      // node:sqlite returns NULL-prototype rows and bun:sqlite does not. Left
      // unnormalised, `toEqual`, `in`, and `hasOwnProperty` all answer
      // differently depending on which runtime is executing.
      check(Object.getPrototypeOf(row) === Object.prototype, "row does not sit on Object.prototype");
      check(Object.prototype.hasOwnProperty.call(row, "body"), "row lost its own column");
    }),
  },
  {
    name: "get returns undefined when nothing matches",
    run: (context) => withDatabase(context, ":memory:", (db) => {
      db.exec("CREATE TABLE note(body TEXT)");
      check(db.prepare("SELECT body FROM note WHERE body = ?").get("absent") === undefined, "get did not return undefined");
    }),
  },
  {
    name: "reports changes and lastInsertRowid as numbers",
    run: (context) => withDatabase(context, ":memory:", (db) => {
      db.exec("CREATE TABLE note(id INTEGER PRIMARY KEY, body TEXT)");
      const result = db.prepare("INSERT INTO note(body) VALUES (?)").run("only");
      checkEqual(result, { changes: 1, lastInsertRowid: 1 }, "write result");
      check(typeof result.lastInsertRowid === "number", "lastInsertRowid is not a number");
    }),
  },
  {
    name: "binds positional parameters in order",
    run: (context) => withDatabase(context, ":memory:", (db) => {
      db.exec("CREATE TABLE pair(a TEXT, b INTEGER)");
      db.prepare("INSERT INTO pair(a, b) VALUES (?, ?)").run("left", 42);
      checkEqual(db.prepare("SELECT a, b FROM pair WHERE a = ? AND b = ?").get("left", 42), { a: "left", b: 42 }, "bound row");
    }),
  },
  {
    name: "round-trips NULL and binary values",
    run: (context) => withDatabase(context, ":memory:", (db) => {
      db.exec("CREATE TABLE blobby(label TEXT, payload BLOB)");
      db.prepare("INSERT INTO blobby(label, payload) VALUES (?, ?)").run(null, new Uint8Array([0, 1, 255]));
      const row = db.prepare("SELECT label, payload FROM blobby").get();
      check(row?.label === null, "NULL did not survive the round trip");
      checkEqual(Array.from(row?.payload as Uint8Array), [0, 1, 255], "blob bytes");
    }),
  },
  {
    name: "matches through an FTS5 virtual table",
    run: (context) => withDatabase(context, ":memory:", (db) => {
      // FTS5 is a compile-time SQLite option. Bun bundles its own SQLite off
      // macOS, so this is the assertion that makes the compiled-binary smoke
      // worth running on Linux and Windows rather than assuming.
      db.exec("CREATE VIRTUAL TABLE doc USING fts5(body)");
      db.prepare("INSERT INTO doc(body) VALUES (?)").run("the operational data plane");
      db.prepare("INSERT INTO doc(body) VALUES (?)").run("something else entirely");
      checkEqual(db.prepare("SELECT body FROM doc WHERE doc MATCH ?").all("operational"), [{ body: "the operational data plane" }], "fts5 match");
    }),
  },
  {
    name: "opens a file-backed database in WAL mode",
    run: (context) => {
      const path = context.tempFile("wal.db");
      withDatabase(context, path, (db) => {
        checkEqual(journalMode(db), "wal", "journal mode");
      });
    },
  },
  {
    name: "leaves an in-memory database in its own journal mode",
    run: (context) => withDatabase(context, ":memory:", (db) => {
      // Asking for WAL on `:memory:` is silently ignored by SQLite, so claiming
      // it would make the mode report a fiction.
      check(journalMode(db) !== "wal", "an in-memory database reported WAL");
    }),
  },
  {
    name: "commits a transaction that returns",
    run: (context) => withDatabase(context, ":memory:", (db) => {
      db.exec("CREATE TABLE note(body TEXT)");
      const value = db.transaction(() => {
        db.prepare("INSERT INTO note(body) VALUES (?)").run("kept");
        return "returned";
      });
      check(value === "returned", "transaction did not return the body's value");
      checkEqual(db.prepare("SELECT count(*) AS n FROM note").get(), { n: 1 }, "committed rows");
    }),
  },
  {
    name: "rolls a transaction back when the body throws",
    run: (context) => withDatabase(context, ":memory:", (db) => {
      db.exec("CREATE TABLE note(body TEXT)");
      db.prepare("INSERT INTO note(body) VALUES (?)").run("before");
      let raised: unknown;
      try {
        db.transaction(() => {
          db.prepare("INSERT INTO note(body) VALUES (?)").run("doomed");
          throw new Error("deliberate");
        });
      } catch (error) {
        raised = error;
      }
      check(raised instanceof Error && raised.message === "deliberate", "the body's error did not reach the caller");
      checkEqual(db.prepare("SELECT count(*) AS n FROM note").get(), { n: 1 }, "row count after rollback");
    }),
  },
  {
    name: "persists across close and reopen",
    run: (context) => {
      const path = context.tempFile("persist.db");
      withDatabase(context, path, (db) => {
        db.exec("CREATE TABLE note(body TEXT)");
        db.prepare("INSERT INTO note(body) VALUES (?)").run("durable");
      });
      withDatabase(context, path, (db) => {
        checkEqual(db.prepare("SELECT body FROM note").all(), [{ body: "durable" }], "reopened rows");
      });
    },
  },
];
