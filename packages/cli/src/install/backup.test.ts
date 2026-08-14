import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, basename, dirname } from "node:path";
import { backupPath, rotateBackups, readBackupManifest } from "./backup.js";

let sandbox: string;
beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), "ariadnev-backup-"));
});
afterEach(() => rmSync(sandbox, { recursive: true, force: true }));

describe("backupPath + manifest", () => {
  it("copies the target and records its original path in a manifest", () => {
    const target = join(sandbox, "settings.json");
    writeFileSync(target, '{"a":1}');
    const backupRoot = join(sandbox, "backups", "t1");

    backupPath(target, backupRoot, "settings", sandbox);

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

    backupPath(a, backupRoot, "settings", sandbox);
    backupPath(b, backupRoot, "agents-md", sandbox);

    const manifest = readBackupManifest(backupRoot);
    expect(manifest.map((e) => e.label).sort()).toEqual(["agents-md", "settings"]);
  });

  it("keeps one entry per file when many share a basename", () => {
    // Every skill ships a file called SKILL.md. Keying the copy by
    // `<label>/<basename>` collapsed all of them onto one path, so the second
    // skill's backup overwrote the first and the manifest kept a single entry —
    // a 103-skill kit would leave ~1 recoverable file per artifact kind.
    const scopeRoot = join(sandbox, "proj");
    const names = ["cook", "plan", "ship"];
    for (const n of names) {
      mkdirSync(join(scopeRoot, ".claude", "skills", n), { recursive: true });
      writeFileSync(join(scopeRoot, ".claude", "skills", n, "SKILL.md"), `old ${n}`);
    }
    const backupRoot = join(sandbox, "backups", "t1");

    for (const n of names) {
      backupPath(join(scopeRoot, ".claude", "skills", n, "SKILL.md"), backupRoot, "skill", scopeRoot);
    }

    const manifest = readBackupManifest(backupRoot);
    expect(manifest).toHaveLength(3);
    for (const entry of manifest) {
      const name = basename(dirname(entry.originalPath));
      expect(readFileSync(join(backupRoot, entry.relPath), "utf8")).toBe(`old ${name}`);
    }
  });

  it("does not collide for a target outside the scope root", () => {
    // A project-scope install still writes home-scoped provider dirs, so the
    // path cannot always be expressed relative to the scope root.
    const scopeRoot = join(sandbox, "proj");
    const home = join(sandbox, "home");
    mkdirSync(join(scopeRoot, ".claude", "skills", "cook"), { recursive: true });
    mkdirSync(join(home, ".agents", "skills", "cook"), { recursive: true });
    writeFileSync(join(scopeRoot, ".claude", "skills", "cook", "SKILL.md"), "in scope");
    writeFileSync(join(home, ".agents", "skills", "cook", "SKILL.md"), "outside scope");
    const backupRoot = join(sandbox, "backups", "t1");

    backupPath(join(scopeRoot, ".claude", "skills", "cook", "SKILL.md"), backupRoot, "skill", scopeRoot);
    backupPath(join(home, ".agents", "skills", "cook", "SKILL.md"), backupRoot, "skill", scopeRoot);

    const manifest = readBackupManifest(backupRoot);
    expect(manifest).toHaveLength(2);
    expect(new Set(manifest.map((e) => e.relPath)).size).toBe(2);
    const contents = manifest.map((e) => readFileSync(join(backupRoot, e.relPath), "utf8")).sort();
    expect(contents).toEqual(["in scope", "outside scope"]);
  });

  it("re-backing up the same target in one run replaces its copy, not a sibling's", () => {
    const scopeRoot = join(sandbox, "proj");
    mkdirSync(join(scopeRoot, "a"), { recursive: true });
    const target = join(scopeRoot, "a", "f.md");
    writeFileSync(target, "v1");
    const backupRoot = join(sandbox, "backups", "t1");

    backupPath(target, backupRoot, "skill", scopeRoot);
    writeFileSync(target, "v2");
    backupPath(target, backupRoot, "skill", scopeRoot);

    const manifest = readBackupManifest(backupRoot);
    expect(manifest).toHaveLength(1);
    expect(readFileSync(join(backupRoot, manifest[0].relPath), "utf8")).toBe("v2");
  });

  it("is a no-op (and adds no manifest entry) when the target doesn't exist", () => {
    const backupRoot = join(sandbox, "backups", "t1");
    backupPath(join(sandbox, "missing.json"), backupRoot, "settings", sandbox);
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
