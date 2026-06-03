import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { backupPath } from "../install/backup.js";
import { readAppliedState, writeAppliedState } from "./applied-state.js";
import type { MigrateOp } from "./plan-migrations.js";

export interface MigrateExecOpts {
  dryRun: boolean;
  timestamp: string;
}

export interface MigrateResult {
  moved: MigrateOp[];
  dryRun: boolean;
}

/**
 * Execute migration ops: back up the source, move `from` → `to`, record the
 * applied key. Idempotent at the planning layer (applied keys skip next time).
 */
export function executeMigrations(ops: MigrateOp[], root: string, opts: MigrateExecOpts): MigrateResult {
  if (opts.dryRun) return { moved: ops, dryRun: true };
  const backupRoot = join(root, ".vcskill", "backups", opts.timestamp);
  const applied = readAppliedState(root);
  for (const op of ops) {
    backupPath(op.fromAbs, backupRoot, "migrate");
    mkdirSync(dirname(op.toAbs), { recursive: true });
    if (existsSync(op.toAbs)) rmSync(op.toAbs, { recursive: true, force: true });
    renameSync(op.fromAbs, op.toAbs);
    applied.add(op.key);
  }
  writeAppliedState(root, applied);
  return { moved: ops, dryRun: false };
}
