import { existsSync, cpSync } from "node:fs";
import { join, basename } from "node:path";
import { readBackupManifest, backupPath, backupDirNames, BACKUP_DIR_NAME } from "../install/backup.js";
import { assertWithinRoots } from "../install/path-guard.js";

export interface BackupsListOpts {
  home: string;
  cwd: string;
  scope: "project" | "global";
}

function backupsParentDir(opts: { home: string; cwd: string; scope: "project" | "global" }): string {
  const root = opts.scope === "global" ? opts.home : opts.cwd;
  return join(root, ".ariadnev", "backups");
}

/** List timestamped backup dirs with a file count (manifest-based when available). */
export function runBackupsList(opts: BackupsListOpts): string {
  const parent = backupsParentDir(opts);
  const dirs = backupDirNames(parent).reverse();
  if (dirs.length === 0) return "ariadnev backups — no backups found";
  const lines = ["ariadnev backups"];
  for (const dir of dirs) {
    // A broken manifest is a status, not a crash: listing is how someone finds
    // out which backup is damaged, so it has to survive reading a damaged one.
    let count: string;
    try {
      const manifest = readBackupManifest(join(parent, dir));
      count = manifest.length > 0 ? `${manifest.length} file(s)` : "no manifest — list only";
    } catch {
      count = "invalid manifest — cannot restore";
    }
    lines.push(`  ${dir}  ${count}`);
  }
  return lines.join("\n");
}

export interface BackupsRestoreOpts {
  home: string;
  cwd: string;
  scope: "project" | "global";
  timestamp: string;
  dryRun: boolean;
  /** Restore only the entry whose original path ends with this (basename match by default). */
  file?: string;
  /** Injected timestamp for the pre-restore safety backup (never Date.now() in lib code). */
  preRestoreTimestamp: string;
}

export interface BackupsRestoreResult {
  restored: string[];
  summary: string;
}

/** Restore one or all files from a timestamped backup, backing up current state first. */
export function runBackupsRestore(opts: BackupsRestoreOpts): BackupsRestoreResult {
  // `timestamp` reaches here straight from argv and is joined into a path. A
  // shape check keeps it from naming anything but a backup directory.
  if (!BACKUP_DIR_NAME.test(opts.timestamp)) {
    return {
      restored: [],
      summary: `ariadnev backups restore — "${opts.timestamp}" is not a backup timestamp (expected YYYYMMDD-HHMMSS)`,
    };
  }
  const backupRoot = join(backupsParentDir(opts), opts.timestamp);
  if (!existsSync(backupRoot)) {
    return { restored: [], summary: `ariadnev backups restore — backup "${opts.timestamp}" not found` };
  }

  const manifest = readBackupManifest(backupRoot);
  if (manifest.length === 0) {
    return {
      restored: [],
      summary: `ariadnev backups restore — no manifest for "${opts.timestamp}" (created before backup manifests were added); cannot auto-restore. Files are at: ${backupRoot}`,
    };
  }

  const targets = opts.file
    ? manifest.filter((e) => basename(e.originalPath) === basename(opts.file!) || e.originalPath.endsWith(opts.file!))
    : manifest;

  // The roots install itself was allowed to write, and for the same reason:
  // restore may only put back what install could have put there. NOT the scope
  // root alone — a project-scope install legitimately writes home-scoped
  // provider directories, which `backupRelPath` records under `abs/`, and
  // guarding on the scope root would refuse to restore them.
  const allowedRoots = [opts.home, opts.cwd];

  const restored: string[] = [];
  for (const entry of targets) {
    // Before the dry-run check: a dry run that reports a restore the real run
    // would refuse is worse than no dry run.
    assertWithinRoots(entry.originalPath, allowedRoots);
    restored.push(entry.originalPath);
    if (opts.dryRun) continue;
    // Protect current state before overwriting it, same discipline as install/uninstall.
    backupPath(
      entry.originalPath,
      join(backupsParentDir(opts), `pre-restore-${opts.preRestoreTimestamp}`),
      entry.label,
      opts.scope === "global" ? opts.home : opts.cwd,
    );
    cpSync(join(backupRoot, entry.relPath), entry.originalPath, { recursive: true, force: true });
  }

  const summary = opts.dryRun
    ? `ariadnev backups restore — DRY RUN: would restore ${restored.length} file(s) from ${opts.timestamp}`
    : `ariadnev backups restore — restored ${restored.length} file(s) from ${opts.timestamp}`;
  return { restored, summary };
}
