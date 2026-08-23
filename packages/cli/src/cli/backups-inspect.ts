// `backups show` and `backups verify` — the two verbs that read a manifest
// rather than act on it.
//
// Both exist only because manifest v2 records a digest. `verify` against a
// schema-1 manifest cannot answer the question at all, and answering `ok`
// anyway would be the worst outcome available: a check that is trusted and
// always passes. It reports `unverifiable` instead, per entry.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { BACKUP_DIR_NAME, hashTarget, readBackupManifest, type BackupManifestEntry } from "../install/backup.js";
import { EXIT, type ExitCode } from "./exit-codes.js";
import { jsonEnvelope } from "./json-envelope.js";

export const BACKUPS_SCHEMA_VERSION = 1;

export interface BackupsInspectOpts {
  home: string;
  cwd: string;
  scope: "project" | "global";
  timestamp: string;
  json?: boolean;
}

export interface BackupsResult {
  output: string;
  exitCode: ExitCode;
}

/** `ok` — the copy still hashes to what was recorded.
 *  `corrupt` — it is there and it does not.
 *  `missing` — the manifest names a copy that is not in the backup.
 *  `unverifiable` — a schema-1 entry, recorded before digests existed. */
export type EntryStatus = "ok" | "corrupt" | "missing" | "unverifiable";

export interface VerifiedEntry {
  originalPath: string;
  relPath: string;
  label: string;
  status: EntryStatus;
}

export function backupsParentDir(opts: { home: string; cwd: string; scope: "project" | "global" }): string {
  return join(opts.scope === "global" ? opts.home : opts.cwd, ".ariadnev", "backups");
}

/** The backup root for `timestamp`, or an error result when it cannot be used. */
function resolveRoot(opts: BackupsInspectOpts, verb: string): { root: string } | { fail: BackupsResult } {
  if (!BACKUP_DIR_NAME.test(opts.timestamp)) {
    return {
      fail: {
        output: `ariadnev backups ${verb} — "${opts.timestamp}" is not a backup timestamp (expected YYYYMMDD-HHMMSS)`,
        exitCode: EXIT.usage,
      },
    };
  }
  const root = join(backupsParentDir(opts), opts.timestamp);
  if (!existsSync(root)) {
    return { fail: { output: `ariadnev backups ${verb} — backup "${opts.timestamp}" not found`, exitCode: EXIT.failed } };
  }
  return { root };
}

/** Re-hash one entry's copy and compare it with what the manifest recorded. */
export function verifyEntry(root: string, entry: BackupManifestEntry): EntryStatus {
  const copy = join(root, entry.relPath);
  if (!existsSync(copy)) return "missing";
  if (entry.sha256 === undefined) return "unverifiable";
  // Hashing the copy, not the original: this answers "is the backup intact",
  // not "has the installed file changed since". The second question is
  // `av audit`'s, and conflating them makes a normal edit look like corruption.
  return hashTarget(copy).sha256 === entry.sha256 ? "ok" : "corrupt";
}

export function runBackupsVerify(opts: BackupsInspectOpts): BackupsResult {
  const resolved = resolveRoot(opts, "verify");
  if ("fail" in resolved) return resolved.fail;

  const entries = readBackupManifest(resolved.root);
  const verified: VerifiedEntry[] = entries.map((entry) => ({
    originalPath: entry.originalPath,
    relPath: entry.relPath,
    label: entry.label,
    status: verifyEntry(resolved.root, entry),
  }));
  const counts = tally(verified);
  // An unverifiable entry is not a pass. A schema-1 backup is exactly as
  // restorable as it ever was, and exactly as unproven — saying so in the exit
  // code is the difference between "checked" and "checkable".
  const clean = counts.corrupt === 0 && counts.missing === 0 && counts.unverifiable === 0;
  const exitCode = entries.length === 0 || !clean ? EXIT.failed : EXIT.ok;

  if (opts.json) {
    return {
      output: jsonEnvelope(BACKUPS_SCHEMA_VERSION, "backups.verify", {
        timestamp: opts.timestamp,
        entries: verified,
        counts,
      }),
      exitCode,
    };
  }
  if (entries.length === 0) {
    return {
      output: `ariadnev backups verify ${opts.timestamp} — no manifest; nothing can be verified`,
      exitCode,
    };
  }
  const lines = [`ariadnev backups verify ${opts.timestamp}`];
  for (const entry of verified.filter((e) => e.status !== "ok")) {
    lines.push(`  ${entry.status.padEnd(12)} ${entry.originalPath}`);
  }
  lines.push(
    `  ${counts.ok} ok, ${counts.corrupt} corrupt, ${counts.missing} missing, ${counts.unverifiable} unverifiable`,
  );
  if (counts.unverifiable > 0) {
    lines.push("  unverifiable entries predate manifest digests — restorable, but not provable");
  }
  return { output: lines.join("\n"), exitCode };
}

function tally(entries: VerifiedEntry[]): Record<EntryStatus, number> {
  const counts: Record<EntryStatus, number> = { ok: 0, corrupt: 0, missing: 0, unverifiable: 0 };
  for (const entry of entries) counts[entry.status]++;
  return counts;
}

/** What one backup holds, entry by entry — what `list` only counts. */
export function runBackupsShow(opts: BackupsInspectOpts): BackupsResult {
  const resolved = resolveRoot(opts, "show");
  if ("fail" in resolved) return resolved.fail;

  const entries = readBackupManifest(resolved.root);
  if (opts.json) {
    return {
      output: jsonEnvelope(BACKUPS_SCHEMA_VERSION, "backups.show", { timestamp: opts.timestamp, entries }),
      exitCode: EXIT.ok,
    };
  }
  if (entries.length === 0) {
    return {
      output: `ariadnev backups show ${opts.timestamp} — no manifest; files are at ${resolved.root}`,
      exitCode: EXIT.ok,
    };
  }
  const lines = [`ariadnev backups show ${opts.timestamp} — ${entries.length} entr${entries.length === 1 ? "y" : "ies"}`];
  for (const entry of entries) {
    const size = entry.size === undefined ? "" : `  ${entry.size} B`;
    lines.push(`  ${(entry.kind ?? "?").padEnd(4)} ${entry.label.padEnd(10)} ${entry.originalPath}${size}`);
  }
  return { output: lines.join("\n"), exitCode: EXIT.ok };
}
