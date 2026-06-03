import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Manifest, Migration } from "./manifest.js";
import { migrationKey } from "./manifest.js";

export interface MigrateOp {
  migration: Migration;
  fromAbs: string;
  toAbs: string;
  key: string;
}

export interface MigrateCtx {
  /** Root the relative `from`/`to` paths resolve under (cwd or home). */
  root: string;
  /** Existence probe — injectable for tests; defaults to fs.existsSync. */
  exists?: (path: string) => boolean;
}

/**
 * Pure planner. Emit a move op only when the migration's `from` path exists AND
 * it has not already been applied. Optionally filter by provider.
 */
export function planMigrations(
  manifest: Manifest,
  applied: Set<string>,
  ctx: MigrateCtx,
  providerFilter?: string,
): MigrateOp[] {
  const exists = ctx.exists ?? existsSync;
  const ops: MigrateOp[] = [];
  for (const m of manifest.providerPathMigrations) {
    if (providerFilter && m.provider !== providerFilter) continue;
    const key = migrationKey(m);
    if (applied.has(key)) continue;
    const fromAbs = join(ctx.root, m.from);
    if (!exists(fromAbs)) continue;
    ops.push({ migration: m, fromAbs, toAbs: join(ctx.root, m.to), key });
  }
  return ops;
}
