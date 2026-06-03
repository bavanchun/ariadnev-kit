import { existsSync, mkdirSync, cpSync, readdirSync, rmSync, statSync } from "node:fs";
import { join, basename, dirname } from "node:path";

/**
 * Copy an existing target (file or dir) into `<backupRoot>/<label>/<name>`
 * before it gets overwritten. No-op when the target does not exist.
 */
export function backupPath(target: string, backupRoot: string, label: string): void {
  if (!existsSync(target)) return;
  const dest = join(backupRoot, label, basename(target));
  mkdirSync(dirname(dest), { recursive: true });
  if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
  cpSync(target, dest, { recursive: true });
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
