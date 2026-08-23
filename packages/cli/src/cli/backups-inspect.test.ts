import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { backupPath } from "../install/backup.js";
import { runBackupsShow, runBackupsVerify } from "./backups-inspect.js";
import { runBackupsPrune, runBackupsList } from "./backups-command.js";
import { EXIT } from "./exit-codes.js";

let sandbox: string;
let base: { home: string; cwd: string; scope: "project" };

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), "ariadnev-bkinspect-"));
  base = { home: join(sandbox, "home"), cwd: join(sandbox, "proj"), scope: "project" };
  mkdirSync(base.home, { recursive: true });
  mkdirSync(base.cwd, { recursive: true });
});
afterEach(() => rmSync(sandbox, { recursive: true, force: true }));

const parent = () => join(base.cwd, ".ariadnev", "backups");

/** A backup holding one file and one directory with a file nested two deep. */
function seedBackup(stamp: string): { root: string; nested: string } {
  const skill = join(base.cwd, ".claude", "skills", "av-cook");
  mkdirSync(join(skill, "references", "deep"), { recursive: true });
  writeFileSync(join(skill, "SKILL.md"), "# Cook\n");
  writeFileSync(join(skill, "references", "deep", "detail.md"), "nested detail\n");
  const settings = join(base.cwd, ".claude", "settings.json");
  writeFileSync(settings, "{}\n");

  const root = join(parent(), stamp);
  backupPath(skill, root, "skill", base.cwd);
  backupPath(settings, root, "settings", base.cwd);
  return { root, nested: join(root, "scope", ".claude", "skills", "av-cook", "references", "deep", "detail.md") };
}

describe("backups verify", () => {
  it("passes a backup nothing has touched", () => {
    seedBackup("20260101-000000");
    const result = runBackupsVerify({ ...base, timestamp: "20260101-000000" });
    expect(result.exitCode).toBe(EXIT.ok);
    expect(result.output).toContain("2 ok, 0 corrupt, 0 missing, 0 unverifiable");
  });

  /**
   * The tamper is a file **nested inside** a backed-up directory, not the
   * top-level entry. A digest that covers only the entry itself would call this
   * backup intact, which is the failure mode that makes `verify` worse than
   * having none: it is trusted, and it always passes.
   */
  it("catches a file tampered with deep inside a backed-up directory", () => {
    const { nested } = seedBackup("20260101-000000");
    writeFileSync(nested, "tampered\n");

    const result = runBackupsVerify({ ...base, timestamp: "20260101-000000" });
    expect(result.exitCode).toBe(EXIT.failed);
    expect(result.output).toContain("corrupt");
    expect(result.output).toContain("1 ok, 1 corrupt");
  });

  // The tree digest folds in each file's path, so moving a file without editing
  // any bytes still changes the answer.
  it("catches a file moved inside the tree without its bytes changing", () => {
    const { root, nested } = seedBackup("20260101-000000");
    const moved = join(root, "scope", ".claude", "skills", "av-cook", "references", "moved.md");
    writeFileSync(moved, "nested detail\n");
    rmSync(nested);

    expect(runBackupsVerify({ ...base, timestamp: "20260101-000000" }).exitCode).toBe(EXIT.failed);
  });

  it("reports a schema-1 entry as unverifiable rather than ok", () => {
    seedBackup("20260101-000000");
    // A manifest as it was written before digests existed: a bare array, no
    // `sha256`. It still restores; it cannot be proven.
    const root = join(parent(), "20260101-000000");
    writeFileSync(
      join(root, "manifest.json"),
      `${JSON.stringify([{ originalPath: join(base.cwd, ".claude", "settings.json"), relPath: join("scope", ".claude", "settings.json"), label: "settings" }], null, 2)}\n`,
    );

    const result = runBackupsVerify({ ...base, timestamp: "20260101-000000" });
    expect(result.output).toContain("unverifiable");
    expect(result.exitCode).toBe(EXIT.failed);
  });

  it("reports a copy the manifest names but the backup no longer holds", () => {
    const { root } = seedBackup("20260101-000000");
    rmSync(join(root, "scope", ".claude", "settings.json"));
    const result = runBackupsVerify({ ...base, timestamp: "20260101-000000" });
    expect(result.output).toContain("missing");
    expect(result.exitCode).toBe(EXIT.failed);
  });

  it("refuses a timestamp that is not one, without touching the filesystem", () => {
    expect(runBackupsVerify({ ...base, timestamp: "../../etc" }).exitCode).toBe(EXIT.usage);
  });

  it("emits the envelope under --json", () => {
    seedBackup("20260101-000000");
    const parsed = JSON.parse(runBackupsVerify({ ...base, timestamp: "20260101-000000", json: true }).output);
    expect(parsed.kind).toBe("backups.verify");
    expect(parsed.data.counts).toEqual({ ok: 2, corrupt: 0, missing: 0, unverifiable: 0 });
  });
});

describe("backups show", () => {
  it("names every entry with its kind and size, which list only counts", () => {
    seedBackup("20260101-000000");
    const result = runBackupsShow({ ...base, timestamp: "20260101-000000" });
    expect(result.output).toContain("2 entries");
    expect(result.output).toContain("dir ");
    expect(result.output).toContain("file");
    expect(runBackupsList({ ...base })).toContain("2 file(s)");
  });
});

describe("backups prune", () => {
  function seedMany(): void {
    for (const stamp of ["20260101-000000", "20260102-000000", "20260103-000000", "20260104-000000"]) {
      seedBackup(stamp);
    }
    // Age the two oldest past any plausible --older-than.
    const old = new Date("2020-01-01T00:00:00Z");
    for (const stamp of ["20260101-000000", "20260102-000000"]) {
      utimesSync(join(parent(), stamp), old, old);
    }
  }

  it("removes by age", () => {
    seedMany();
    const result = runBackupsPrune({ ...base, olderThanDays: 30, dryRun: false, now: Date.parse("2026-01-05T00:00:00Z") });
    expect(result.output).toContain("removed 2 backup(s)");
    expect(runBackupsList({ ...base })).not.toContain("20260101-000000");
    expect(runBackupsList({ ...base })).toContain("20260104-000000");
  });

  it("removes by count", () => {
    seedMany();
    runBackupsPrune({ ...base, keepLast: 1, dryRun: false, now: Date.now() });
    const listed = runBackupsList({ ...base });
    expect(listed).toContain("20260104-000000");
    expect(listed).not.toContain("20260103-000000");
  });

  /**
   * Most protective wins. Removing anything either rule condemns would make
   * passing both flags strictly more destructive than passing them one at a
   * time — the opposite of what reaching for both implies.
   */
  it("keeps a backup either rule wants to keep, when both are given", () => {
    seedMany();
    // By age alone this removes two; by count alone it removes three. The
    // intersection is the two that are both old and outside the keep window.
    const result = runBackupsPrune({
      ...base,
      olderThanDays: 30,
      keepLast: 1,
      dryRun: false,
      now: Date.parse("2026-01-05T00:00:00Z"),
    });
    expect(result.output).toContain("removed 2 backup(s)");
    expect(runBackupsList({ ...base })).toContain("20260103-000000");
  });

  it("never prunes a heal backup, which is the only copy of what an upgrade removed", () => {
    seedBackup("heal-20260101-000000");
    seedBackup("20260104-000000");
    runBackupsPrune({ ...base, keepLast: 0, dryRun: false, now: Date.now() });
    expect(runBackupsList({ ...base })).toContain("heal-20260101-000000");
  });

  it("refuses to run with neither flag rather than guessing a policy", () => {
    seedMany();
    const result = runBackupsPrune({ ...base, dryRun: false, now: Date.now() });
    expect(result.exitCode).toBe(EXIT.usage);
    expect(runBackupsList({ ...base })).toContain("20260101-000000");
  });

  it("removes nothing on a dry run", () => {
    seedMany();
    const result = runBackupsPrune({ ...base, keepLast: 1, dryRun: true, now: Date.now() });
    expect(result.output).toContain("would remove 3 backup(s)");
    expect(runBackupsList({ ...base })).toContain("20260101-000000");
  });
});
