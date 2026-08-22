import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { backupPath } from "../install/backup.js";
import { runBackupsList, runBackupsRestore } from "./backups-command.js";

let sandbox: string;
let root: string;
beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), "ariadnev-backups-cmd-"));
  root = join(sandbox, "proj");
  mkdirSync(root, { recursive: true });
});
afterEach(() => rmSync(sandbox, { recursive: true, force: true }));

function makeBackup(timestamp: string, originalRel: string, content: string): string {
  const original = join(root, originalRel);
  mkdirSync(join(original, ".."), { recursive: true });
  writeFileSync(original, content);
  const backupRoot = join(root, ".ariadnev", "backups", timestamp);
  backupPath(original, backupRoot, "settings", root);
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
    const backupRoot = join(root, ".ariadnev", "backups", "20260601-000000");
    const a = join(root, "a.json");
    const b = join(root, "b.json");
    writeFileSync(a, "orig-a");
    writeFileSync(b, "orig-b");
    backupPath(a, backupRoot, "settings", root);
    backupPath(b, backupRoot, "settings", root);
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
    const backupRoot = join(root, ".ariadnev", "backups", "20260101-000000");
    mkdirSync(join(backupRoot, "settings"), { recursive: true });
    writeFileSync(join(backupRoot, "settings", "settings.json"), "{}");

    const res = runBackupsRestore({ home: sandbox, cwd: root, scope: "project", timestamp: "20260101-000000", dryRun: false, preRestoreTimestamp: "20260603-000000" });

    expect(res.restored).toEqual([]);
    expect(res.summary).toMatch(/no manifest|cannot.*restore/i);
  });

  it("errors clearly when the timestamp doesn't exist", () => {
    const res = runBackupsRestore({ home: sandbox, cwd: root, scope: "project", timestamp: "20260505-000000", dryRun: false, preRestoreTimestamp: "20260603-000000" });
    expect(res.restored).toEqual([]);
    expect(res.summary).toMatch(/not found/i);
  });
});

/**
 * The manifest is attacker-reachable data. For project scope the backups parent
 * is `<cwd>/.ariadnev/backups/` — inside a cloned repository — so a clone can
 * ship one, and restore used to `cpSync` an absolute `originalPath` read
 * straight out of it, parsed by a bare cast.
 */
describe("runBackupsRestore: the manifest is untrusted input", () => {
  /** Write a hand-crafted manifest into a well-formed backup dir. */
  function plantManifest(timestamp: string, manifest: unknown): void {
    const dir = join(root, ".ariadnev", "backups", timestamp);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest));
  }

  const restore = (timestamp: string, dryRun = false) =>
    runBackupsRestore({
      home: sandbox,
      cwd: root,
      scope: "project",
      timestamp,
      dryRun,
      preRestoreTimestamp: "20260603-000000",
    });

  it("refuses an originalPath outside the roots install could write", () => {
    const outside = join(sandbox, "..", "escaped.txt");
    plantManifest("20260701-000000", [{ originalPath: outside, relPath: "scope/a.json", label: "settings" }]);
    expect(() => restore("20260701-000000")).toThrow(/outside allowed roots/i);
  });

  // Reported by --dry-run too. A dry run that promises a restore the real run
  // refuses is worse than no dry run at all.
  it("refuses the same path in a dry run", () => {
    const outside = join(sandbox, "..", "escaped.txt");
    plantManifest("20260702-000000", [{ originalPath: outside, relPath: "scope/a.json", label: "settings" }]);
    expect(() => restore("20260702-000000", true)).toThrow(/outside allowed roots/i);
  });

  // A project-scope install still writes home-scoped provider dirs, recorded
  // under `abs/`. Guarding on the scope root alone would refuse to restore them
  // — the guard has to allow exactly what install was allowed to write.
  it("still restores a home-scoped path backed up by a project-scope install", () => {
    const homeTarget = join(sandbox, ".claude", "settings.json");
    mkdirSync(join(sandbox, ".claude"), { recursive: true });
    writeFileSync(homeTarget, '{"v":1}');
    const backupRoot = join(root, ".ariadnev", "backups", "20260703-000000");
    backupPath(homeTarget, backupRoot, "settings", root);
    writeFileSync(homeTarget, '{"v":2}');

    const res = restore("20260703-000000");
    expect(res.restored).toEqual([homeTarget]);
    expect(readFileSync(homeTarget, "utf8")).toBe('{"v":1}');
  });

  for (const relPath of ["../../../etc/passwd", "scope/../../../etc/passwd", "/etc/passwd"]) {
    it(`rejects the manifest outright when relPath is ${JSON.stringify(relPath)}`, () => {
      plantManifest("20260704-000000", [{ originalPath: join(root, "a.json"), relPath, label: "settings" }]);
      expect(() => restore("20260704-000000")).toThrow(/invalid backup manifest/i);
    });
  }

  it("rejects a manifest whose shape is wrong rather than casting it", () => {
    plantManifest("20260705-000000", [{ originalPath: 42, relPath: "scope/a.json", label: "settings" }]);
    expect(() => restore("20260705-000000")).toThrow(/invalid backup manifest/i);
  });

  it("rejects a truncated manifest instead of calling it pre-manifest", () => {
    const dir = join(root, ".ariadnev", "backups", "20260706-000000");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "manifest.json"), '[{"originalPath":');
    expect(() => restore("20260706-000000")).toThrow(/invalid backup manifest/i);
  });

  for (const timestamp of ["../../../etc", "9999-evil", "", "20260101-00000"]) {
    it(`refuses a timestamp that is not a backup name: ${JSON.stringify(timestamp)}`, () => {
      const res = restore(timestamp);
      expect(res.restored).toEqual([]);
      expect(res.summary).toMatch(/not a backup timestamp/i);
    });
  }

  it("keeps a damaged manifest listable so it can be found", () => {
    const dir = join(root, ".ariadnev", "backups", "20260707-000000");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "manifest.json"), "not json");
    expect(runBackupsList({ home: sandbox, cwd: root, scope: "project" })).toContain("invalid manifest");
  });
});
