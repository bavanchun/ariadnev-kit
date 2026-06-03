import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Command } from "commander";
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
}

export function runMigrate(opts: MigrateHandlerOpts): { moved: number; dryRun: boolean; summary: string } {
  const manifest = loadManifest(opts.manifestPath);
  const applied = readAppliedState(opts.root);
  const ops = planMigrations(manifest, applied, { root: opts.root }, opts.provider);
  const res = executeMigrations(ops, opts.root, { dryRun: opts.dryRun, timestamp: opts.timestamp });
  const lines = [opts.dryRun ? "vcskill migrate — DRY RUN" : "vcskill migrate — complete"];
  for (const op of res.moved) lines.push(`  move ${op.migration.from} -> ${op.migration.to}`);
  if (res.moved.length === 0) lines.push("  nothing to migrate");
  return { moved: res.moved.length, dryRun: res.dryRun, summary: lines.join("\n") };
}

export function registerMigrate(program: Command): void {
  program
    .command("migrate")
    .description("Relocate installed files when provider path conventions change")
    .option("--provider <id>", "limit to one provider")
    .option("--global", "operate on ~/ instead of ./", false)
    .action((opts: { provider?: string; global?: boolean }) => {
      const g = program.opts<{ home: string; cwd: string; dryRun?: boolean }>();
      const root = opts.global ? (g.home ?? homedir()) : (g.cwd ?? process.cwd());
      const { summary } = runMigrate({
        root,
        manifestPath: defaultManifestPath(),
        provider: opts.provider,
        dryRun: !!g.dryRun,
        timestamp: nowStamp(),
      });
      console.log(summary);
    });
}
