import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  activitySegments,
  isExcludedFromSnapshot,
  planSnapshot,
  readSourceForSnapshot,
  snapshotSources,
} from "./snapshot-operational.js";
import { runBackupsCreate } from "../cli/backups-create.js";
import { readBackupManifest } from "../install/backup.js";
import { activityRoot, derivedPath, ensureOperationalDirectory } from "../storage/operational-paths.js";
import { registryPath } from "../projects/registry.js";
import { enableAnalytics, indexPath } from "../analytics/lifecycle.js";
import { enableProject } from "../content-search/lifecycle.js";
import { shardPath } from "../content-search/shard.js";

const dirs: string[] = [];
const mk = () => {
  const dir = mkdtempSync(join(tmpdir(), "ariadnev-snapshot-"));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const NOW = "2026-08-28T00:00:00.000Z";
const STAMP = "20260828-120000";

const event = (kind: string) => `${JSON.stringify({ v: 1, id: kind, ts: NOW, kind, runtime: "claude-code" })}\n`;

/** A home carrying every authoritative source, plus both derived ones. */
function populated(): { home: string; cwd: string } {
  const home = mk();
  const cwd = join(home, "project");
  mkdirSync(cwd, { recursive: true });

  mkdirSync(activityRoot(home), { recursive: true });
  writeFileSync(join(activityRoot(home), "activity-20260827.jsonl"), event("install.completed"));
  writeFileSync(join(activityRoot(home), "activity-20260828.jsonl"), event("workflow.completed"));

  mkdirSync(join(home, ".ariadnev"), { recursive: true });
  writeFileSync(
    registryPath(home),
    JSON.stringify({ version: 1, projects: [{ name: "p", dir: cwd, registered_at: NOW, updated_at: NOW }] }),
  );
  enableAnalytics(home, NOW);
  enableProject(home, cwd, "p", NOW);

  // Both receipts, so a snapshot that carried only one is visible.
  for (const root of [cwd, home]) {
    mkdirSync(join(root, ".ariadnev"), { recursive: true });
    writeFileSync(join(root, ".ariadnev", "receipt.json"), JSON.stringify({ schemaVersion: 1, installs: {} }));
  }

  // Derived state, which must never be captured.
  ensureOperationalDirectory(home, derivedPath(home));
  writeFileSync(indexPath(home), "pretend analytics index");
  mkdirSync(join(derivedPath(home), "content"), { recursive: true });
  writeFileSync(shardPath(home, cwd), "pretend content shard");

  return { home, cwd };
}

describe("what a snapshot takes", () => {
  it("takes every authoritative source", () => {
    const { home, cwd } = populated();
    const kinds = snapshotSources(home, cwd).map((source) => source.relPath).sort();
    expect(kinds).toEqual([
      "activity/activity-20260827.jsonl",
      "activity/activity-20260828.jsonl",
      "analytics-state.json",
      "content-search-state.json",
      "projects.json",
      "receipt-global.json",
      "receipt-project.json",
    ]);
  });

  it("takes no derived file", () => {
    // Asserted in both directions on purpose: a snapshot quietly growing to
    // include the index is the exact failure this design exists to prevent, and
    // "the list looks right" is not the same claim as "nothing derived is in it".
    const { home, cwd } = populated();
    for (const source of snapshotSources(home, cwd)) {
      expect(isExcludedFromSnapshot(home, source.path), source.path).toBe(false);
    }
  });

  it("would exclude a derived path if one were ever added to the list", () => {
    // The exclusion is one predicate rather than a roster of filenames, so it
    // covers an index that does not exist yet.
    const { home } = populated();
    expect(isExcludedFromSnapshot(home, indexPath(home))).toBe(true);
    expect(isExcludedFromSnapshot(home, derivedPath(home, "some-future-index.db"))).toBe(true);
  });

  it("reports nothing to take on a machine that has never run anything", () => {
    const home = mk();
    expect(planSnapshot(home, join(home, "p")).sources).toEqual([]);
  });
});

describe("a snapshot taken during an append", () => {
  it("stores a whole number of records, never a partial one", () => {
    // Copying an append-only file mid-write is how a restored log ends up with
    // half a trailing line. A prefix of an append-only file is itself a valid
    // append-only file; a torn one is not.
    const home = mk();
    mkdirSync(activityRoot(home), { recursive: true });
    const path = join(activityRoot(home), "activity-20260828.jsonl");
    writeFileSync(path, `${event("a")}${event("b")}{"v":1,"id":"c","partial`);

    const live = { path, kind: "activity-segment", relPath: "x", live: true } as const;
    const { content, truncatedBytes } = readSourceForSnapshot(live);

    expect(truncatedBytes).toBeGreaterThan(0);
    const lines = content.toString("utf8").split("\n").filter(Boolean);
    expect(lines).toHaveLength(2);
    for (const line of lines) expect(() => JSON.parse(line)).not.toThrow();
  });

  it("keeps a complete file byte-for-byte", () => {
    const home = mk();
    mkdirSync(activityRoot(home), { recursive: true });
    const path = join(activityRoot(home), "activity-20260828.jsonl");
    const body = `${event("a")}${event("b")}`;
    writeFileSync(path, body);

    const result = readSourceForSnapshot({ path, kind: "activity-segment", relPath: "x", live: true });

    expect(result.truncatedBytes).toBe(0);
    expect(result.content.toString("utf8")).toBe(body);
  });

  it("stores nothing rather than half a record when the file has no complete one", () => {
    const home = mk();
    mkdirSync(activityRoot(home), { recursive: true });
    const path = join(activityRoot(home), "activity-20260828.jsonl");
    writeFileSync(path, '{"v":1,"id":"only-a-fragment');

    expect(readSourceForSnapshot({ path, kind: "activity-segment", relPath: "x", live: true }).content).toHaveLength(0);
  });

  it("treats only the newest segment as live", () => {
    // Every earlier day is closed and will never be appended to again, so
    // trimming one would drop a real record for no reason.
    const { home, cwd } = populated();
    const segments = snapshotSources(home, cwd).filter((source) => source.kind === "activity-segment");
    expect(segments.map((source) => source.live)).toEqual([false, true]);
  });

  it("finds the segments in order", () => {
    const { home } = populated();
    expect(activitySegments(home).map((path) => path.split("/").pop())).toEqual([
      "activity-20260827.jsonl",
      "activity-20260828.jsonl",
    ]);
  });
});

describe("backups create", () => {
  const base = (home: string, cwd: string) => ({ home, cwd, scope: "project" as const, timestamp: STAMP });

  it("writes an ordinary backup that the existing manifest reader understands", () => {
    // A snapshot goes through the same writer as an install-time backup, so
    // list, show, verify, restore and prune all work on it with no new code —
    // and cannot drift from it later.
    const { home, cwd } = populated();

    const result = runBackupsCreate(base(home, cwd));

    expect(result.exitCode).toBe(0);
    const root = join(cwd, ".ariadnev", "backups", STAMP);
    const manifest = readBackupManifest(root);
    expect(manifest.length).toBe(7);
    for (const entry of manifest) {
      expect(entry.sha256, `${entry.originalPath} is hashed`).toBeTruthy();
      expect(existsSync(join(root, entry.relPath)), entry.relPath).toBe(true);
    }
  });

  it("puts no derived file in the backup directory", () => {
    const { home, cwd } = populated();
    runBackupsCreate(base(home, cwd));

    const root = join(cwd, ".ariadnev", "backups", STAMP);
    const stored = readdirSync(root, { recursive: true }).map(String).join("|");

    expect(stored).not.toContain("analytics.db");
    expect(stored).not.toContain("derived");
  });

  it("says what it left out, because a listing months later cannot", () => {
    const { home, cwd } = populated();
    expect(runBackupsCreate(base(home, cwd)).output).toMatch(/derived state .* is excluded/);
  });

  it("a dry run writes nothing but names everything", () => {
    const { home, cwd } = populated();
    const result = runBackupsCreate({ ...base(home, cwd), dryRun: true });

    expect(result.output).toContain("would snapshot 7");
    expect(existsSync(join(cwd, ".ariadnev", "backups", STAMP))).toBe(false);
  });

  it("stores the live segment trimmed to its last complete record", () => {
    const { home, cwd } = populated();
    const live = join(activityRoot(home), "activity-20260828.jsonl");
    writeFileSync(live, `${event("a")}{"v":1,"id":"torn`);

    runBackupsCreate(base(home, cwd));

    const root = join(cwd, ".ariadnev", "backups", STAMP);
    const entry = readBackupManifest(root).find((e) => e.originalPath === live)!;
    const stored = readFileSync(join(root, entry.relPath), "utf8");
    expect(stored.endsWith("\n")).toBe(true);
    expect(stored).not.toContain("torn");
  });

  it("says so plainly when there is nothing to snapshot", () => {
    const home = mk();
    expect(runBackupsCreate({ home, cwd: join(home, "p"), scope: "project", timestamp: STAMP }).output)
      .toMatch(/no operational state/);
  });
});
