import { mkdirSync, writeFileSync, renameSync, existsSync, rmSync, statSync } from "node:fs";
import { join, dirname, resolve, relative, isAbsolute } from "node:path";
import type { Kit } from "../kit/kit-types.js";
import type { ProviderId } from "../providers/spec-verified.js";
import { getResolver } from "../providers/index.js";
import type { ResolverCtx } from "../providers/resolver.js";
import { planInstall } from "./install-plan.js";
import { backupPath, rotateBackups } from "./backup.js";
import { mergeAgentsBlock, readAgentsMd } from "./agents-md.js";
import type { InstallOp, ProviderInstallResult } from "./install-types.js";

export interface ExecuteOpts {
  dryRun: boolean;
  /** Injected timestamp for the backup dir (never Date.now() in lib code). */
  timestamp: string;
  /** Roots every write must stay within (path-traversal guard). */
  allowedRoots: string[];
}

function assertWithinRoots(dest: string, roots: string[]): void {
  const abs = resolve(dest);
  // Cross-platform containment check: dest must sit strictly under a root.
  // `path.relative` handles separators on every OS and rejects sibling-dir
  // escapes (`/home/user-evil`) and writes to the root itself.
  const within = roots.some((root) => {
    const rel = relative(resolve(root), abs);
    return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
  });
  if (!within) throw new Error(`refusing to write outside allowed roots: ${dest}`);
}

function atomicWrite(dest: string, content: string): void {
  mkdirSync(dirname(dest), { recursive: true });
  const tmp = `${dest}.vcskill-tmp`;
  writeFileSync(tmp, content, "utf8");
  // renameSync atomically replaces an existing FILE — no pre-delete needed
  // (deleting first would open a crash window where dest is neither old nor
  // new). Only a pre-existing DIRECTORY must be removed, since rename onto a
  // non-empty dir fails.
  if (existsSync(dest) && statSync(dest).isDirectory()) {
    rmSync(dest, { recursive: true, force: true });
  }
  renameSync(tmp, dest);
}

function applyOp(op: InstallOp, backupRoot: string, opts: ExecuteOpts): { wrote: boolean; backedUp: boolean } {
  if (op.action === "skip") return { wrote: false, backedUp: false };
  assertWithinRoots(op.dest, opts.allowedRoots);
  const existed = existsSync(op.dest);
  const content = op.action === "agents-md" ? mergeAgentsBlock(readAgentsMd(op.dest), op.block) : op.content;
  if (opts.dryRun) return { wrote: true, backedUp: existed };
  if (existed) backupPath(op.dest, backupRoot, op.kind);
  atomicWrite(op.dest, content);
  return { wrote: true, backedUp: existed };
}

export function executeInstall(
  ops: InstallOp[],
  provider: ProviderId,
  backupRoot: string,
  opts: ExecuteOpts,
): ProviderInstallResult {
  const result: ProviderInstallResult = { provider, written: 0, backedUp: 0, skipped: [], ops };
  for (const op of ops) {
    if (op.action === "skip") {
      result.skipped.push(op);
      continue;
    }
    const { wrote, backedUp } = applyOp(op, backupRoot, opts);
    if (wrote) result.written++;
    if (backedUp) result.backedUp++;
  }
  return result;
}

export interface InstallKitOpts {
  dryRun?: boolean;
  timestamp: string;
}

/** Install the kit to every requested provider; returns per-provider results. */
export function installKit(
  kit: Kit,
  providers: ProviderId[],
  ctx: ResolverCtx,
  opts: InstallKitOpts,
): ProviderInstallResult[] {
  const baseRoot = ctx.scope === "global" ? ctx.home : ctx.cwd;
  const backupsParent = join(baseRoot, ".vcskill", "backups");
  const backupRoot = join(backupsParent, opts.timestamp);
  const allowedRoots = [ctx.home, ctx.cwd];
  const results: ProviderInstallResult[] = [];
  for (const id of providers) {
    const resolver = getResolver(id);
    const ops = planInstall(kit, resolver, ctx);
    results.push(executeInstall(ops, id, backupRoot, { dryRun: opts.dryRun ?? false, timestamp: opts.timestamp, allowedRoots }));
  }
  if (!opts.dryRun) rotateBackups(backupsParent, 3);
  return results;
}

export { planInstall } from "./install-plan.js";
