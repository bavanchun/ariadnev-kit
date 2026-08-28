import { readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { sqliteSelfTest, sqliteSelfTestSummary } from "./sqlite-self-test.js";

describe("sqlite self test", () => {
  it("reports the runtime's driver with FTS5 and WAL", () => {
    const result = sqliteSelfTest();
    expect(result).toEqual({ ok: true, driver: "node", fts5: true, wal: true });
  });

  it("leaves nothing behind", () => {
    // It writes a real file because WAL is silently ignored on `:memory:`, so
    // it also has to clean one up. A probe that litters the temp directory on
    // every `doctor` run is a slow leak nobody attributes to `doctor`.
    const before = readdirSync(tmpdir()).filter((name) => name.startsWith("ariadnev-sqlite-probe-"));
    sqliteSelfTest();
    const after = readdirSync(tmpdir()).filter((name) => name.startsWith("ariadnev-sqlite-probe-"));
    expect(after).toEqual(before);
  });

  it("says what is available when everything is", () => {
    expect(sqliteSelfTestSummary({ ok: true, driver: "bun", fts5: true, wal: true }))
      .toBe("sqlite: available (bun, fts5, wal)");
  });

  it("names the missing capability rather than just failing", () => {
    // "UNAVAILABLE" alone would send someone to the wrong place: a missing FTS5
    // is a Bun build question, a missing WAL is a filesystem one.
    expect(sqliteSelfTestSummary({ ok: false, driver: "bun", fts5: false, wal: true }))
      .toBe("sqlite: UNAVAILABLE — missing fts5");
    expect(sqliteSelfTestSummary({ ok: false, driver: "node", fts5: true, wal: false }))
      .toBe("sqlite: UNAVAILABLE — missing wal");
  });

  it("prefers the thrown message when the driver did not load at all", () => {
    expect(sqliteSelfTestSummary({ ok: false, driver: "node", fts5: false, wal: false, error: "No such built-in module: node:sqlite" }))
      .toBe("sqlite: UNAVAILABLE — No such built-in module: node:sqlite");
  });

  it("produces a line the release smoke's pattern accepts", () => {
    // smoke-binary.mjs greps for this exact shape on every executed target.
    // Two independent statements of one format is how a release gate quietly
    // stops asserting anything.
    expect(sqliteSelfTestSummary(sqliteSelfTest())).toMatch(/^sqlite: available \([a-z]+, fts5, wal\)$/);
  });
});
