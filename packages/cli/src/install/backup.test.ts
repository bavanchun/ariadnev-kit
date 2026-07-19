import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { backupPath, rotateBackups, readBackupManifest } from "./backup.js";

let sandbox: string;
beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), "vcskill-backup-"));
});
afterEach(() => rmSync(sandbox, { recursive: true, force: true }));

describe("backupPath + manifest", () => {
  it("copies the target and records its original path in a manifest", () => {
    const target = join(sandbox, "settings.json");
    writeFileSync(target, '{"a":1}');
    const backupRoot = join(sandbox, "backups", "t1");

    backupPath(target, backupRoot, "settings");

    const manifest = readBackupManifest(backupRoot);
    expect(manifest).toHaveLength(1);
    expect(manifest[0].originalPath).toBe(target);
    expect(manifest[0].label).toBe("settings");
    expect(existsSync(join(backupRoot, manifest[0].relPath))).toBe(true);
    expect(readFileSync(join(backupRoot, manifest[0].relPath), "utf8")).toBe('{"a":1}');
  });

  it("accumulates multiple entries under the same backup root", () => {
    const a = join(sandbox, "a.json");
    const b = join(sandbox, "AGENTS.md");
    writeFileSync(a, "a");
    writeFileSync(b, "b");
    const backupRoot = join(sandbox, "backups", "t1");

    backupPath(a, backupRoot, "settings");
    backupPath(b, backupRoot, "agents-md");

    const manifest = readBackupManifest(backupRoot);
    expect(manifest.map((e) => e.label).sort()).toEqual(["agents-md", "settings"]);
  });

  it("is a no-op (and adds no manifest entry) when the target doesn't exist", () => {
    const backupRoot = join(sandbox, "backups", "t1");
    backupPath(join(sandbox, "missing.json"), backupRoot, "settings");
    expect(readBackupManifest(backupRoot)).toEqual([]);
  });

  it("returns an empty manifest for a pre-existing backup dir with no manifest.json (old layout)", () => {
    const backupRoot = join(sandbox, "backups", "old-t0");
    mkdirSync(join(backupRoot, "settings"), { recursive: true });
    writeFileSync(join(backupRoot, "settings", "settings.json"), "{}");
    expect(readBackupManifest(backupRoot)).toEqual([]);
  });
});

describe("rotateBackups", () => {
  it("keeps only the most recent N backup dirs", () => {
    const parent = join(sandbox, "backups");
    for (let i = 0; i < 5; i++) mkdirSync(join(parent, `2026060${i}-000000`), { recursive: true });
    rotateBackups(parent, 3);
    expect(readdirSync(parent).length).toBe(3);
  });
});
