import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { assertWithinRoots } from "./path-guard.js";
import { atomicWrite } from "./fs-atomic.js";
import type { Kit } from "../kit/kit-types.js";
import type { ProviderId } from "../providers/spec-verified.js";
import { getResolver } from "../providers/index.js";
import type { ResolverCtx } from "../providers/resolver.js";
import { planInstall } from "./install-plan.js";
import { backupPath, rotateBackups } from "./backup.js";
import { mergeAgentsBlock, readAgentsMd } from "./agents-md.js";
import { mergeHookSettings } from "./hook-settings-merge.js";
import { buildReceipt, type ProviderResultForReceipt } from "./install-receipt.js";
import type { InstallOp, ProviderInstallResult } from "./install-types.js";

export interface ExecuteOpts {
  dryRun: boolean;
  /** Injected timestamp for the backup dir (never Date.now() in lib code). */
  timestamp: string;
  /** Roots every write must stay within (path-traversal guard). */
  allowedRoots: string[];
  /** User confirmed merging hook bindings into settings.json (default: no). */
  applyHookSettings?: boolean;
}

function opContent(op: Exclude<InstallOp, { action: "skip" }>): string | Buffer {
  if (op.action === "agents-md") return mergeAgentsBlock(readAgentsMd(op.dest), op.block);
  if (op.action === "hook-settings") return mergeHookSettings(readAgentsMd(op.dest), op.bindings);
  return op.content;
}

function applyOp(op: InstallOp, backupRoot: string, opts: ExecuteOpts): { wrote: boolean; backedUp: boolean } {
  if (op.action === "skip") return { wrote: false, backedUp: false };
  assertWithinRoots(op.dest, opts.allowedRoots);
  const existed = existsSync(op.dest);
  const content = opContent(op);
  if (opts.dryRun) return { wrote: true, backedUp: existed };
  if (existed) backupPath(op.dest, backupRoot, op.kind);
  atomicWrite(op.dest, content, op.action === "write" ? op.mode : undefined);
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
    if (op.action === "hook-settings" && !opts.applyHookSettings) {
      // Prompt declined or non-interactive: never touch settings.json; the CLI
      // layer prints a copy-pasteable snippet instead.
      result.skipped.push({
        action: "skip",
        kind: "hook",
        name: op.name,
        reason: "settings.json merge not confirmed — snippet printed",
      });
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
  /** User confirmed merging hook bindings into settings.json. */
  applyHookSettings?: boolean;
  /** Installed ariadnev package version, recorded in the receipt. */
  ariadnevVersion?: string;
}

function receiptPath(root: string): string {
  return join(root, ".ariadnev", "receipt.json");
}

/** Install the kit to every requested provider; returns per-provider results. */
export function installKit(
  kit: Kit,
  providers: ProviderId[],
  ctx: ResolverCtx,
  opts: InstallKitOpts,
): ProviderInstallResult[] {
  const baseRoot = ctx.scope === "global" ? ctx.home : ctx.cwd;
  const backupsParent = join(baseRoot, ".ariadnev", "backups");
  const backupRoot = join(backupsParent, opts.timestamp);
  const allowedRoots = [ctx.home, ctx.cwd];
  const applyHookSettings = opts.applyHookSettings ?? false;
  const results: ProviderInstallResult[] = [];
  const receiptEntries: ProviderResultForReceipt[] = [];
  for (const id of providers) {
    const resolver = getResolver(id);
    const ops = planInstall(kit, resolver, ctx);
    const result = executeInstall(ops, id, backupRoot, {
      dryRun: opts.dryRun ?? false,
      timestamp: opts.timestamp,
      allowedRoots,
      applyHookSettings,
    });
    results.push(result);
    receiptEntries.push({ providerId: id, scope: ctx.scope, applyHookSettings, result });
  }
  if (!opts.dryRun) {
    rotateBackups(backupsParent, 3);
    const rPath = receiptPath(baseRoot);
    const prevJson = existsSync(rPath) ? readFileSync(rPath, "utf8") : "";
    const receiptJson = buildReceipt(prevJson, receiptEntries, {
      ariadnevVersion: opts.ariadnevVersion ?? "0.0.0",
      timestamp: opts.timestamp,
      home: ctx.home,
      cwd: ctx.cwd,
    });
    atomicWrite(rPath, receiptJson);
  }
  return results;
}

export { planInstall } from "./install-plan.js";
