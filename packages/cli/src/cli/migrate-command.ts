import { homedir } from "node:os";
import { lifecycleRoots, withLifecycleLock } from "../install/lifecycle-lock.js";
import { jsonEnvelope } from "./json-envelope.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Command } from "commander";
import { emit } from "./emit.js";
import { loadManifest } from "../migrate/manifest.js";
import { readAppliedState } from "../migrate/applied-state.js";
import { planMigrations } from "../migrate/plan-migrations.js";
import { executeMigrations } from "../migrate/execute-migrations.js";
import { nowStamp } from "./timestamp.js";

function defaultManifestPath(): string {
  // dist/index.js and portable-manifest.json are siblings in the published pkg;
  // in dev, walk up from this module to the repo root.
  const here = dirname(fileURLToPath(import.meta.url));
  for (let dir = here; ; ) {
    const candidate = join(dir, "portable-manifest.json");
    try {
      loadManifest(candidate);
      return candidate;
    } catch {
      /* not here */
    }
    const parent = join(dir, "..");
    if (parent === dir) return join(here, "..", "portable-manifest.json");
    dir = parent;
  }
}

export interface MigrateHandlerOpts {
  root: string;
  manifestPath: string;
  provider?: string;
  dryRun: boolean;
  timestamp: string;
  json?: boolean;
}

export const MIGRATE_SCHEMA_VERSION = 1;

export function runMigrate(opts: MigrateHandlerOpts): { moved: number; dryRun: boolean; summary: string } {
  const manifest = loadManifest(opts.manifestPath);
  const applied = readAppliedState(opts.root);
  const ops = planMigrations(manifest, applied, { root: opts.root }, opts.provider);
  const res = executeMigrations(ops, opts.root, { dryRun: opts.dryRun, timestamp: opts.timestamp });
  const moves = res.moved.map((op) => ({ from: op.migration.from, to: op.migration.to }));
  if (opts.json) {
    return {
      moved: moves.length,
      dryRun: res.dryRun,
      summary: jsonEnvelope(MIGRATE_SCHEMA_VERSION, "migrate.run", { dryRun: res.dryRun, moved: moves }),
    };
  }
  const lines = [opts.dryRun ? "ariadnev migrate — DRY RUN" : "ariadnev migrate — complete"];
  for (const move of moves) lines.push(`  move ${move.from} -> ${move.to}`);
  if (moves.length === 0) lines.push("  nothing to migrate");
  return { moved: moves.length, dryRun: res.dryRun, summary: lines.join("\n") };
}

export function registerMigrate(program: Command): void {
  program
    .command("migrate")
    .description("Relocate installed files when provider path conventions change")
    .option("--provider <id>", "limit to one provider")
    .option("--global", "operate on ~/ instead of ./", false)
    .option("--json", "emit the machine envelope instead of the text report", false)
    .action(async (opts: { provider?: string; global?: boolean; json?: boolean }) => {
      const g = program.opts<{ home: string; cwd: string; dryRun?: boolean }>();
      const root = opts.global ? (g.home ?? homedir()) : (g.cwd ?? process.cwd());
      const { summary } = await withLifecycleLock(
        g.dryRun ? [] : lifecycleRoots({ home: g.home ?? homedir(), cwd: g.cwd ?? process.cwd() }),
        "migrate",
        () => runMigrate({
          root,
          manifestPath: defaultManifestPath(),
          provider: opts.provider,
          dryRun: !!g.dryRun,
          timestamp: nowStamp(),
          json: !!opts.json,
        }),
      );
      emit(summary);
    });
}
