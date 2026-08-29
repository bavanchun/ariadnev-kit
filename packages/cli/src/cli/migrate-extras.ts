// `av migrate prefs` and `av migrate rollback`.
//
// BOTH HAVE A REAL SUBJECT HERE, WHICH IS NOT OBVIOUS FROM UPSTREAM'S NAMES.
// Upstream's `migrate prefs` imports a predecessor tool's preference file, and
// its `rollback` undoes a migration against a store this project does not have.
// The ariadnev equivalents are:
//
//   prefs     this project was renamed, and a 0.x install left its config under
//             the old directory name. That file is still on disk and is not
//             being read by anything. Importing it is the same job.
//   rollback  `av migrate` already backs up every file it moves, through the
//             same backup machinery `av backups restore` reads. Rolling back is
//             restoring that backup and forgetting the applied keys.
//
// ROLLBACK DOES NOT REIMPLEMENT RESTORE. It calls `runBackupsRestore`, which
// takes a pre-restore safety copy of the current state, verifies digests, and
// knows where each entry came from. A second restore path would be a second set
// of bugs about where files go, and this is the one command where being wrong
// means putting a file back in the wrong place.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { atomicWrite } from "../install/fs-atomic.js";
import { backupPath, readBackupManifest } from "../install/backup.js";
import { readAppliedState, writeAppliedState } from "../migrate/applied-state.js";
import { backupsParentDir } from "./backups-inspect.js";
import { runBackupsRestore } from "./backups-command.js";
import { CONFIG_DIR, CONFIG_FILE } from "../config/load-config.js";
import { EXIT, UnavailableError, UsageError } from "./exit-codes.js";
import { jsonEnvelope } from "./json-envelope.js";

export const MIGRATE_EXTRAS_SCHEMA_VERSION = 1;

/**
 * Config directories this project used before it was renamed.
 *
 * Read-only: a migration reads from here and never writes back, so a user who
 * still has the old tool installed keeps a working copy of its config.
 */
export const LEGACY_CONFIG_DIRS = [".vcskill"] as const; // brand-drift-allow: the pre-rename directory this migration exists to read

export interface MigrateExtrasOpts {
  readonly home: string;
  readonly cwd: string;
  readonly global?: boolean;
  readonly json?: boolean;
  readonly dryRun?: boolean;
  /** For the pre-restore safety copy; never `Date.now()` in library code. */
  readonly timestamp: string;
}

export interface MigrateExtrasResult {
  readonly output: string;
  readonly exitCode: number;
}

function envelope(kind: string, data: unknown): string {
  return jsonEnvelope(MIGRATE_EXTRAS_SCHEMA_VERSION, kind, data);
}

function rootFor(opts: MigrateExtrasOpts): string {
  return opts.global ? opts.home : opts.cwd;
}

export interface PrefsSource {
  readonly from: string;
  readonly to: string;
}

/** The legacy config file for this scope, when one is there and the new one is not. */
export function findLegacyPrefs(root: string): PrefsSource | null {
  const to = join(root, CONFIG_DIR, CONFIG_FILE);
  for (const dir of LEGACY_CONFIG_DIRS) {
    const from = join(root, dir, CONFIG_FILE);
    if (existsSync(from)) return { from, to };
  }
  return null;
}

/**
 * Copy a pre-rename config into ariadnev's own.
 *
 * REFUSES RATHER THAN MERGES WHEN BOTH EXIST. Merging two config files means
 * deciding, key by key, which side wins — and getting that wrong silently
 * changes settings the user believes they set. Reporting both paths lets them
 * decide in the one place where the decision is visible.
 *
 * The content is validated as JSON before anything is written: importing a
 * corrupt file would replace a working config with one the loader rejects.
 */
export function runMigratePrefs(opts: MigrateExtrasOpts): MigrateExtrasResult {
  const root = rootFor(opts);
  const found = findLegacyPrefs(root);
  if (!found) {
    const data = { imported: false, reason: "no legacy config found", searched: LEGACY_CONFIG_DIRS.map((d) => join(root, d, CONFIG_FILE)) };
    if (opts.json) return { output: envelope("migrate.prefs", data), exitCode: EXIT.ok };
    return { output: `ariadnev migrate prefs — nothing to import under ${root}`, exitCode: EXIT.ok };
  }
  if (existsSync(found.to)) {
    throw new UsageError(
      `both ${found.from} and ${found.to} exist. Merging them would silently pick a winner per key; ` +
        `copy across what you want and delete the old file.`,
    );
  }

  const raw = readFileSync(found.from, "utf8");
  try {
    JSON.parse(raw);
  } catch (error) {
    throw new UsageError(`${found.from} is not valid JSON (${(error as Error).message}) — importing it would break the config loader`);
  }

  if (!opts.dryRun) atomicWrite(found.to, raw);
  const data = { imported: !opts.dryRun, from: found.from, to: found.to, dryRun: !!opts.dryRun };
  if (opts.json) return { output: envelope("migrate.prefs", data), exitCode: EXIT.ok };
  return {
    output: `ariadnev migrate prefs — ${opts.dryRun ? "would import" : "imported"} ${found.from} → ${found.to}`,
    exitCode: EXIT.ok,
  };
}

/** Backup directories holding at least one entry `av migrate` created. */
export function migrateBackups(opts: MigrateExtrasOpts): string[] {
  const parent = backupsParentDir({ home: opts.home, cwd: opts.cwd, scope: opts.global ? "global" : "project" });
  let names: string[];
  try {
    names = readdirSync(parent).sort();
  } catch {
    return [];
  }
  return names.filter((name) => readBackupManifest(join(parent, name)).some((entry) => entry.label === "migrate"));
}

/**
 * Put back what the last `av migrate` moved, and forget that it ran.
 *
 * The applied-keys ledger is cleared *after* the restore, and only when the
 * restore actually put files back. Clearing first would mean a failed restore
 * leaves a state where the files are still moved and the ledger says they are
 * not — so the next `migrate` would move them again from a location that no
 * longer holds them.
 */
export function runMigrateRollback(opts: MigrateExtrasOpts & { timestamp: string; to?: string }): MigrateExtrasResult {
  const root = rootFor(opts);
  const candidates = migrateBackups(opts);
  if (candidates.length === 0) {
    throw new UnavailableError(`no backup from \`av migrate\` to roll back under ${root} — \`av backups list\` shows what there is`);
  }
  const target = opts.to ?? (candidates.at(-1) as string);
  if (!candidates.includes(target)) {
    throw new UsageError(`backup "${target}" holds nothing from \`av migrate\`. Migration backups: ${candidates.join(", ")}`);
  }

  const restore = runBackupsRestore({
    home: opts.home,
    cwd: opts.cwd,
    scope: opts.global ? "global" : "project",
    timestamp: target,
    dryRun: !!opts.dryRun,
    preRestoreTimestamp: opts.timestamp,
  });

  const applied = readAppliedState(root);
  const cleared = [...applied];
  if (!opts.dryRun && restore.restored.length > 0) {
    // The ledger is what makes `migrate` idempotent. Leaving it populated after
    // a rollback means the next run skips the very moves that were just undone.
    backupPath(join(root, ".ariadnev", "applied-migrations.json"), join(root, ".ariadnev", "backups", opts.timestamp), "migrate-rollback", root);
    writeAppliedState(root, new Set());
  }

  const data = { backup: target, restored: restore.restored, cleared: opts.dryRun ? [] : cleared, dryRun: !!opts.dryRun };
  if (opts.json) return { output: envelope("migrate.rollback", data), exitCode: EXIT.ok };
  return {
    output: [
      `ariadnev migrate rollback — ${opts.dryRun ? "would restore" : "restored"} ${restore.restored.length} path(s) from ${target}`,
      ...restore.restored.map((path) => `  ${path}`),
      opts.dryRun ? "" : `  forgot ${cleared.length} applied migration key(s)`,
    ]
      .filter(Boolean)
      .join("\n"),
    exitCode: EXIT.ok,
  };
}
