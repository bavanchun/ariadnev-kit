// `av backups create` and `av backups verify --rebuild`.
//
// `create` SNAPSHOTS AUTHORITATIVE STATE ONLY. What that means and why is in
// `backups/snapshot-operational.ts`; what matters here is that this command
// never decides the question itself — it asks `snapshotSources` what to take
// and `isExcludedFromSnapshot` what to refuse, so the rule lives in one place
// and can be asserted in both directions.
//
// IT WRITES THROUGH `backupPath`, WHICH IS THE POINT. A snapshot that invented
// its own manifest format would be a second thing `restore` and `verify` have
// to understand, and the day they drift is the day a snapshot stops being
// restorable. Going through the same writer means a snapshot IS an ordinary
// backup — `list`, `show`, `verify`, `restore` and `prune` all work on it
// already, with no new code and no new failure mode.
//
// `verify --rebuild` ANSWERS THE OTHER HALF. A snapshot deliberately omits
// derived state, so "is this backup intact" leaves open "and can the part it
// omitted be regenerated". That is exactly the invariant phase 6 already
// encoded, so this reuses that machinery rather than writing a second
// comparison that could disagree with the first.

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { backupPath } from "../install/backup.js";
import {
  isExcludedFromSnapshot,
  planSnapshot,
  readSourceForSnapshot,
  type SnapshotSource,
} from "../backups/snapshot-operational.js";
import { rebuildEquivalenceCases } from "../storage/rebuild-equivalence.js";
import { backupsParentDir, BACKUPS_SCHEMA_VERSION, type BackupsResult } from "./backups-inspect.js";
import { EXIT } from "./exit-codes.js";
import { jsonEnvelope } from "./json-envelope.js";

export interface BackupsCreateOpts {
  home: string;
  cwd: string;
  scope: "project" | "global";
  /** The directory name for this snapshot: `YYYYMMDD-HHMMSS`. */
  timestamp: string;
  dryRun?: boolean;
  json?: boolean;
}

export interface CreatedEntry {
  readonly originalPath: string;
  readonly kind: SnapshotSource["kind"];
  readonly bytes: number;
  /** Bytes dropped from the tail of a live file to land on a record boundary. */
  readonly truncatedBytes: number;
}

/**
 * Take a snapshot of the operational state.
 *
 * The exclusion is asserted here rather than assumed of the source list. It is
 * cheap, and it means a future source added to `snapshotSources` that happened
 * to point under `derived/` is refused at the moment it would be written rather
 * than discovered in a restore.
 */
export function runBackupsCreate(opts: BackupsCreateOpts): BackupsResult {
  const plan = planSnapshot(opts.home, opts.cwd);
  if (plan.sources.length === 0) {
    const message = "ariadnev backups create — no operational state to snapshot yet";
    return opts.json
      ? { output: jsonEnvelope(BACKUPS_SCHEMA_VERSION, "backups.create", { timestamp: opts.timestamp, entries: [], created: false }), exitCode: EXIT.ok }
      : { output: message, exitCode: EXIT.ok };
  }

  for (const source of plan.sources) {
    if (!isExcludedFromSnapshot(opts.home, source.path)) continue;
    // Refusing rather than skipping: a snapshot that silently dropped something
    // it was asked to take would be a backup that is missing a file nobody
    // knows about, which is worse than no backup.
    return {
      output: `ariadnev backups create — refusing to snapshot derived state: ${source.path}`,
      exitCode: EXIT.failed,
    };
  }

  const backupRoot = join(backupsParentDir(opts), opts.timestamp);
  const scopeRoot = opts.scope === "global" ? opts.home : opts.cwd;
  const entries: CreatedEntry[] = [];

  if (!opts.dryRun) mkdirSync(backupRoot, { recursive: true });
  for (const source of plan.sources) {
    const { content, truncatedBytes } = readSourceForSnapshot(source);
    entries.push({ originalPath: source.path, kind: source.kind, bytes: content.length, truncatedBytes });
    if (opts.dryRun) continue;
    // A closed file is copied; only the live segment passes its own bytes.
    backupPath(source.path, backupRoot, source.kind, scopeRoot, source.live ? content : undefined);
  }

  const totalBytes = entries.reduce((sum, entry) => sum + entry.bytes, 0);
  if (opts.json) {
    return {
      output: jsonEnvelope(BACKUPS_SCHEMA_VERSION, "backups.create", {
        timestamp: opts.timestamp,
        created: !opts.dryRun,
        dryRun: !!opts.dryRun,
        entries,
        totalBytes,
      }),
      exitCode: EXIT.ok,
    };
  }
  const verb = opts.dryRun ? "would snapshot" : "snapshot";
  const lines = [`ariadnev backups create — ${verb} ${entries.length} authoritative file(s), ${totalBytes} bytes`];
  for (const entry of entries) {
    const note = entry.truncatedBytes > 0 ? `  (trimmed ${entry.truncatedBytes} B of a partial record)` : "";
    lines.push(`  ${entry.kind.padEnd(17)} ${entry.originalPath}${note}`);
  }
  // Said every time, because someone reading a backup listing months later has
  // no way to know what a snapshot deliberately left out.
  lines.push("  derived state (analytics index, content shards) is excluded — rebuild it rather than restoring it");
  if (!opts.dryRun) lines.push(`  at ${backupRoot}`);
  return { output: lines.join("\n"), exitCode: EXIT.ok };
}

export interface RebuildCheckResult {
  readonly command: string;
  readonly note: string;
  readonly equivalent: boolean;
  readonly detail?: string;
}

/**
 * Prove the derived half is reconstructible, in a throwaway home.
 *
 * Never against the live one. This runs on a machine whose index someone may be
 * using, and a check that rebuilt live state to reassure you about it would be
 * a diagnostic with a side effect — the same reason `status` never repairs.
 */
export function runRebuildCheck(scratchHome: string): RebuildCheckResult[] {
  return rebuildEquivalenceCases.map((entry) => {
    const home = join(scratchHome, entry.command);
    mkdirSync(home, { recursive: true });
    try {
      entry.seed(home);
      entry.rebuild(home);
      const before = JSON.stringify(entry.observe(home));
      entry.rebuild(home);
      const after = JSON.stringify(entry.observe(home));
      return { command: entry.command, note: entry.note, equivalent: before === after };
    } catch (error) {
      return {
        command: entry.command,
        note: entry.note,
        equivalent: false,
        detail: error instanceof Error ? error.message : String(error),
      };
    }
  });
}

export function renderRebuildCheck(results: readonly RebuildCheckResult[]): { lines: string[]; ok: boolean } {
  const ok = results.every((result) => result.equivalent);
  const lines = results.map(
    (result) => `  ${result.equivalent ? "ok         " : "NOT REBUILT"} ${result.command}: ${result.note}${result.detail ? ` — ${result.detail}` : ""}`,
  );
  lines.push(
    ok
      ? "  every derived index rebuilt to the same answer — the snapshot is complete without them"
      : "  a derived index did NOT rebuild to the same answer — the snapshot alone may not restore this machine",
  );
  return { lines, ok };
}
