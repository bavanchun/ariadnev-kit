// Whether this build can actually run the operational data plane.
//
// The same shape as `ed25519SelfTest`, and for the same reason: the capability
// is a property of the binary and the platform it was cross-compiled for, not
// of anything the user has installed, and it cannot be inferred from silence.
//
// It matters most where nobody can run it by hand. Bun bundles its own SQLite
// on Linux and Windows and uses the system one on macOS, so a probe that passes
// on a developer's Mac says nothing about the artifacts most users download.
// `smoke-binary.mjs` asserts this line on every target CI executes, which is
// what turns "should work" into a measured fact per release.
//
// A real file rather than `:memory:`, because WAL is silently ignored on an
// in-memory database — asking there would only ever confirm the question.

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { removeStorageTree } from "./operational-paths.js";
import { selectDriver } from "./select-driver.js";
import type { DriverName } from "./driver.js";

export interface SqliteSelfTestResult {
  readonly ok: boolean;
  readonly driver: DriverName;
  /** Full-text search — a compile-time SQLite option, so not a given. */
  readonly fts5: boolean;
  /** Write-ahead logging, which every concurrent reader depends on. */
  readonly wal: boolean;
  readonly error?: string;
}

export function sqliteSelfTest(): SqliteSelfTestResult {
  const driver = selectDriver();
  let root: string | undefined;
  try {
    root = mkdtempSync(join(tmpdir(), "ariadnev-sqlite-probe-"));
    const database = driver.open(join(root, "probe.db"));
    try {
      const wal = String(database.prepare("PRAGMA journal_mode").get()?.journal_mode ?? "") === "wal";
      database.exec("CREATE VIRTUAL TABLE probe USING fts5(body)");
      database.prepare("INSERT INTO probe(body) VALUES (?)").run("ariadnev sqlite self test");
      const matched = database.prepare("SELECT body FROM probe WHERE probe MATCH ?").all("sqlite");
      const fts5 = matched.length === 1 && matched[0].body === "ariadnev sqlite self test";
      return { ok: fts5 && wal, driver: driver.name, fts5, wal };
    } finally {
      database.close();
    }
  } catch (error) {
    return { ok: false, driver: driver.name, fts5: false, wal: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    if (root) removeStorageTree(root);
  }
}

/** One line, in the shape `doctor` prints its other capability lines. */
export function sqliteSelfTestSummary(result: SqliteSelfTestResult = sqliteSelfTest()): string {
  if (result.ok) return `sqlite: available (${result.driver}, fts5, wal)`;
  const missing = [!result.fts5 && "fts5", !result.wal && "wal"].filter(Boolean).join(", ");
  const detail = result.error ?? `missing ${missing}`;
  return `sqlite: UNAVAILABLE — ${detail}`;
}
