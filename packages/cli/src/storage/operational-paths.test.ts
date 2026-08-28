import { existsSync, mkdtempSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  derivedPath,
  derivedRoot,
  ensureOperationalDirectory,
  isDerived,
  operationalPath,
  operationalRoot,
} from "./operational-paths.js";

describe("operational paths", () => {
  let home: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "ariadnev-home-"));
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
  });

  it("puts the operational root beside the other runtime roots", () => {
    expect(operationalRoot(home)).toBe(join(home, ".ariadnev", "operational"));
    expect(derivedRoot(home)).toBe(join(home, ".ariadnev", "operational", "derived"));
  });

  it("computes a path without creating anything", () => {
    // The whole point of separating computation from creation: a command that
    // merely mentions a path must not leave a directory behind.
    expect(operationalPath(home, "projects.json")).toBe(join(home, ".ariadnev", "operational", "projects.json"));
    expect(derivedPath(home, "analytics.db")).toBe(join(home, ".ariadnev", "operational", "derived", "analytics.db"));
    expect(existsSync(join(home, ".ariadnev"))).toBe(false);
  });

  it("tells authoritative paths from derived ones", () => {
    expect(isDerived(home, derivedPath(home, "analytics.db"))).toBe(true);
    expect(isDerived(home, operationalPath(home, "projects.json"))).toBe(false);
    expect(isDerived(home, derivedRoot(home))).toBe(false);
    // A traversal out of `derived/` must not be reported as safe to delete.
    expect(isDerived(home, derivedPath(home, "..", "projects.json"))).toBe(false);
  });

  it("creates a private directory on demand", () => {
    const path = ensureOperationalDirectory(home, derivedPath(home, "shards"));
    expect(existsSync(path)).toBe(true);
    if (process.platform !== "win32") {
      expect(statSync(path).mode & 0o777).toBe(0o700);
      expect(statSync(operationalRoot(home)).mode & 0o777).toBe(0o700);
    }
  });

  it("is idempotent", () => {
    const path = derivedPath(home, "shards");
    expect(ensureOperationalDirectory(home, path)).toBe(ensureOperationalDirectory(home, path));
  });

  it("accepts the root itself", () => {
    expect(() => ensureOperationalDirectory(home, operationalRoot(home))).not.toThrow();
  });

  it("refuses a path outside the operational root", () => {
    expect(() => ensureOperationalDirectory(home, join(home, ".ariadnev", "runtime"))).toThrow(/escapes/);
    expect(() => ensureOperationalDirectory(home, join(home, "elsewhere"))).toThrow(/escapes/);
    expect(() => ensureOperationalDirectory(home, operationalPath(home, "..", "runs"))).toThrow(/escapes/);
  });

  it("refuses a symlinked directory", () => {
    // A symlink here would let anything with write access to the parent redirect
    // operational state somewhere the permission check above never applied.
    const elsewhere = mkdtempSync(join(tmpdir(), "ariadnev-elsewhere-"));
    try {
      ensureOperationalDirectory(home, operationalRoot(home));
      symlinkSync(elsewhere, derivedRoot(home));
      expect(() => ensureOperationalDirectory(home, derivedRoot(home))).toThrow(/not a regular directory/);
    } finally {
      rmSync(elsewhere, { recursive: true, force: true });
    }
  });

  it("refuses a path that exists as a file", () => {
    ensureOperationalDirectory(home, operationalRoot(home));
    writeFileSync(operationalPath(home, "projects.json"), "{}");
    expect(() => ensureOperationalDirectory(home, operationalPath(home, "projects.json"))).toThrow();
  });
});
