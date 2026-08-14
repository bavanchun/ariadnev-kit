import { existsSync, readdirSync, statSync, cpSync } from "node:fs";
import { join, basename } from "node:path";
import { readBackupManifest, backupPath } from "../install/backup.js";

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
  if (!existsSync(parent)) return "ariadnev backups — no backups found";
  const dirs = readdirSync(parent)
    .filter((n) => statSync(join(parent, n)).isDirectory())
    .sort()
    .reverse();
  if (dirs.length === 0) return "ariadnev backups — no backups found";
  const lines = ["ariadnev backups"];
  for (const dir of dirs) {
    const manifest = readBackupManifest(join(parent, dir));
    const count = manifest.length > 0 ? `${manifest.length} file(s)` : "no manifest — list only";
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

  const restored: string[] = [];
  for (const entry of targets) {
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
