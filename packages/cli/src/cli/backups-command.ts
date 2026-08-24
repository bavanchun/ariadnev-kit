import { existsSync, rmSync, statSync } from "node:fs";
import { cpSync } from "node:fs";
import { join, basename } from "node:path";
import { readBackupManifest, backupPath, backupDirNames, BACKUP_DIR_NAME } from "../install/backup.js";
import { assertWithinRoots } from "../install/path-guard.js";
import { assertInstallSurfacePath } from "../install/install-surface.js";
import { BACKUPS_SCHEMA_VERSION, backupsParentDir, type BackupsResult } from "./backups-inspect.js";
import { EXIT } from "./exit-codes.js";
import { jsonEnvelope } from "./json-envelope.js";

export interface BackupsListOpts {
  home: string;
  cwd: string;
  scope: "project" | "global";
  json?: boolean;
}

/** List timestamped backup dirs with a file count (manifest-based when available). */
export function runBackupsList(opts: BackupsListOpts): string {
  const parent = backupsParentDir(opts);
  const dirs = backupDirNames(parent).reverse();
  if (opts.json) {
    return jsonEnvelope(BACKUPS_SCHEMA_VERSION, "backups.list", {
      backups: dirs.map((dir) => {
        // A broken manifest is a status, not a crash: listing is how someone
        // finds out which backup is damaged, so it has to survive reading a
        // damaged one.
        try {
          return { timestamp: dir, entries: readBackupManifest(join(parent, dir)).length, manifest: "ok" };
        } catch {
          return { timestamp: dir, entries: null, manifest: "invalid" };
        }
      }),
    });
  }
  if (dirs.length === 0) return "ariadnev backups — no backups found";
  const lines = ["ariadnev backups"];
  for (const dir of dirs) {
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

export interface BackupsPruneOpts {
  home: string;
  cwd: string;
  scope: "project" | "global";
  /** Remove backups older than this many days. */
  olderThanDays?: number;
  /** Keep this many newest backups, remove the rest. */
  keepLast?: number;
  dryRun: boolean;
  /** Reference point for `--older-than`; injected, never `Date.now()` here. */
  now: number;
  json?: boolean;
}

/**
 * Remove backups by age, by count, or both.
 *
 * `rotateBackups` already caps the set at three after every mutating run, but
 * only then and only at three. This is the manual door: reclaim space now, or
 * keep more than the automatic cap while working through something.
 *
 * A heal backup is never pruned here for the same reason rotation skips it —
 * it is the only copy of a tree an upgrade deleted. `backupDirNames` includes
 * it so `list`, `show` and `verify` can reach it; removing it stays a
 * deliberate `rm` by the user.
 */
export function runBackupsPrune(opts: BackupsPruneOpts): BackupsResult {
  if (opts.olderThanDays === undefined && opts.keepLast === undefined) {
    return {
      output: "usage: ariadnev backups prune [--older-than <days>] [--keep-last <n>]",
      exitCode: EXIT.usage,
    };
  }
  const parent = backupsParentDir(opts);
  const names = backupDirNames(parent).filter((name) => !name.startsWith("heal-"));

  const byAge = new Set<string>();
  if (opts.olderThanDays !== undefined) {
    const cutoff = opts.now - opts.olderThanDays * 86_400_000;
    for (const name of names) {
      if (statSync(join(parent, name)).mtimeMs < cutoff) byAge.add(name);
    }
  }
  const byCount = new Set<string>(
    opts.keepLast === undefined ? [] : names.slice(0, Math.max(0, names.length - opts.keepLast)),
  );

  // Most protective wins: a backup survives if either rule wants to keep it.
  // The alternative — removing anything either rule condemns — makes combining
  // the flags strictly more destructive than passing them one at a time, which
  // is the opposite of what someone reaching for both expects.
  const removable =
    opts.olderThanDays !== undefined && opts.keepLast !== undefined
      ? names.filter((name) => byAge.has(name) && byCount.has(name))
      : names.filter((name) => byAge.has(name) || byCount.has(name));

  if (!opts.dryRun) {
    for (const name of removable) rmSync(join(parent, name), { recursive: true, force: true });
  }
  if (opts.json) {
    return {
      output: jsonEnvelope(BACKUPS_SCHEMA_VERSION, "backups.prune", {
        dryRun: opts.dryRun,
        removed: removable,
        kept: names.filter((name) => !removable.includes(name)),
      }),
      exitCode: EXIT.ok,
    };
  }
  const verb = opts.dryRun ? "would remove" : "removed";
  const lines = [`ariadnev backups prune — ${verb} ${removable.length} backup(s)`];
  for (const name of removable) lines.push(`  ${name}`);
  return { output: lines.join("\n"), exitCode: EXIT.ok };
}

export interface BackupsRestoreOpts {
  home: string;
  cwd: string;
  scope: "project" | "global";
  /** Exact backup to restore. Ignored when `latest` is set. */
  timestamp: string;
  /** Restore the newest backup instead of a named one. */
  latest?: boolean;
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
  if (opts.latest) {
    // `backupDirNames` sorts oldest first and the names are fixed-width
    // timestamps, so the last one is the newest. A `heal-` copy is excluded:
    // it holds a tree an upgrade deliberately removed, and quietly making
    // "restore the latest" mean "undo the upgrade" is not what anyone typing
    // that asked for.
    const candidates = backupDirNames(backupsParentDir(opts)).filter((name) => !name.startsWith("heal-"));
    const newest = candidates.at(-1);
    if (newest === undefined) {
      return { restored: [], summary: "ariadnev backups restore — no backups found" };
    }
    return runBackupsRestore({ ...opts, latest: false, timestamp: newest });
  }
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

  // Both roots, not the scope root alone — a project-scope install legitimately
  // writes home-scoped provider directories, which `backupRelPath` records under
  // `abs/`, and guarding on the scope root would refuse to restore them.
  const allowedRoots = [opts.home, opts.cwd];

  // Validated as a set, before anything is written. Throwing from inside the
  // copy loop would leave some entries restored, some not, and no summary saying
  // which — a half-applied restore is worse than a refused one.
  //
  // `assertWithinRoots` alone is not enough here, and that distinction is the
  // whole point: it answers "may install write here", and the answer for
  // `~/.ssh/authorized_keys` is yes. The manifest is untrusted, so the question
  // has to be "does ariadnev install *this path*".
  for (const entry of targets) {
    assertWithinRoots(entry.originalPath, allowedRoots);
    assertInstallSurfacePath(entry.originalPath, allowedRoots);
  }

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
