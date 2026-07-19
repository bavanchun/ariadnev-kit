import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { backupPath } from "../install/backup.js";
import { runBackupsList, runBackupsRestore } from "./backups-command.js";

let sandbox: string;
let root: string;
beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), "vcskill-backups-cmd-"));
  root = join(sandbox, "proj");
  mkdirSync(root, { recursive: true });
});
afterEach(() => rmSync(sandbox, { recursive: true, force: true }));

function makeBackup(timestamp: string, originalRel: string, content: string): string {
  const original = join(root, originalRel);
  mkdirSync(join(original, ".."), { recursive: true });
  writeFileSync(original, content);
  const backupRoot = join(root, ".vcskill", "backups", timestamp);
  backupPath(original, backupRoot, "settings");
  return original;
}

describe("runBackupsList", () => {
  it("reports no backups when the dir is empty", () => {
    const out = runBackupsList({ home: sandbox, cwd: root, scope: "project" });
    expect(out).toContain("no backups");
  });

  it("lists each timestamped backup with a file count", () => {
    makeBackup("20260601-000000", ".claude/settings.json", "{}");
    makeBackup("20260602-000000", "AGENTS.md", "notes");
    const out = runBackupsList({ home: sandbox, cwd: root, scope: "project" });
    expect(out).toContain("20260601-000000");
    expect(out).toContain("20260602-000000");
  });
});

describe("runBackupsRestore", () => {
  it("restores a file to its original path, backing up the current state first", () => {
    const original = makeBackup("20260601-000000", ".claude/settings.json", '{"a":1}');
    writeFileSync(original, '{"a":2}'); // current state diverges from the backup

    const res = runBackupsRestore({
      home: sandbox,
      cwd: root,
      scope: "project",
      timestamp: "20260601-000000",
      dryRun: false,
      preRestoreTimestamp: "20260603-000000",
    });

    expect(readFileSync(original, "utf8")).toBe('{"a":1}');
    expect(res.restored.length).toBe(1);
  });

  it("restores only the file matching --file when given", () => {
    const backupRoot = join(root, ".vcskill", "backups", "20260601-000000");
    const a = join(root, "a.json");
    const b = join(root, "b.json");
    writeFileSync(a, "orig-a");
    writeFileSync(b, "orig-b");
    backupPath(a, backupRoot, "settings");
    backupPath(b, backupRoot, "settings");
    writeFileSync(a, "changed-a");
    writeFileSync(b, "changed-b");

    runBackupsRestore({ home: sandbox, cwd: root, scope: "project", timestamp: "20260601-000000", dryRun: false, file: "a.json", preRestoreTimestamp: "20260603-000000" });

    expect(readFileSync(a, "utf8")).toBe("orig-a");
    expect(readFileSync(b, "utf8")).toBe("changed-b"); // untouched
  });

  it("dry-run makes no changes", () => {
    const original = makeBackup("20260601-000000", ".claude/settings.json", '{"a":1}');
    writeFileSync(original, '{"a":2}');

    runBackupsRestore({ home: sandbox, cwd: root, scope: "project", timestamp: "20260601-000000", dryRun: true, preRestoreTimestamp: "20260603-000000" });

    expect(readFileSync(original, "utf8")).toBe('{"a":2}');
  });

  it("refuses to restore a pre-manifest backup, reporting list-only", () => {
    const backupRoot = join(root, ".vcskill", "backups", "old-t0");
    mkdirSync(join(backupRoot, "settings"), { recursive: true });
    writeFileSync(join(backupRoot, "settings", "settings.json"), "{}");

    const res = runBackupsRestore({ home: sandbox, cwd: root, scope: "project", timestamp: "old-t0", dryRun: false, preRestoreTimestamp: "20260603-000000" });

    expect(res.restored).toEqual([]);
    expect(res.summary).toMatch(/no manifest|cannot.*restore/i);
  });

  it("errors clearly when the timestamp doesn't exist", () => {
    const res = runBackupsRestore({ home: sandbox, cwd: root, scope: "project", timestamp: "nope", dryRun: false, preRestoreTimestamp: "20260603-000000" });
    expect(res.restored).toEqual([]);
    expect(res.summary).toMatch(/not found/i);
  });
});
