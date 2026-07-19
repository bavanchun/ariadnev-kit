import { existsSync, mkdirSync, cpSync, readdirSync, rmSync, statSync, readFileSync, writeFileSync } from "node:fs";
import { join, basename, dirname, resolve } from "node:path";

export interface BackupManifestEntry {
  /** Absolute path the file was copied from, at backup time. */
  originalPath: string;
  /** Path of the copy, relative to the backup root. */
  relPath: string;
  label: string;
}

function manifestPath(backupRoot: string): string {
  return join(backupRoot, "manifest.json");
}

/** Entries recorded for this backup root; [] for pre-manifest backups (old layout) or missing dirs. */
export function readBackupManifest(backupRoot: string): BackupManifestEntry[] {
  const p = manifestPath(backupRoot);
  if (!existsSync(p)) return [];
  try {
    return JSON.parse(readFileSync(p, "utf8")) as BackupManifestEntry[];
  } catch {
    return [];
  }
}

/**
 * Copy an existing target (file or dir) into `<backupRoot>/<label>/<name>`
 * before it gets overwritten, and record the original path in a manifest so
 * `vcskill backups restore` knows where to copy it back. No-op when the
 * target does not exist.
 */
export function backupPath(target: string, backupRoot: string, label: string): void {
  if (!existsSync(target)) return;
  const relPath = join(label, basename(target));
  const dest = join(backupRoot, relPath);
  mkdirSync(dirname(dest), { recursive: true });
  if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
  cpSync(target, dest, { recursive: true });

  const manifest = readBackupManifest(backupRoot).filter((e) => e.relPath !== relPath);
  manifest.push({ originalPath: resolve(target), relPath, label });
  writeFileSync(manifestPath(backupRoot), `${JSON.stringify(manifest, null, 2)}\n`);
}

/**
 * Keep only the most recent `keep` timestamped backup dirs under `backupsParent`,
 * pruning older ones. Dir names are sortable timestamps (lexicographic order).
 */
export function rotateBackups(backupsParent: string, keep = 3): void {
  if (!existsSync(backupsParent)) return;
  const dirs = readdirSync(backupsParent)
    .map((n) => join(backupsParent, n))
    .filter((p) => statSync(p).isDirectory())
    .sort();
  const stale = dirs.slice(0, Math.max(0, dirs.length - keep));
  for (const dir of stale) rmSync(dir, { recursive: true, force: true });
}
