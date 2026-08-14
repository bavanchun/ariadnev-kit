import { existsSync, readFileSync, readdirSync, rmdirSync, unlinkSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { assertWithinRoots } from "../install/path-guard.js";
import { atomicWrite } from "../install/fs-atomic.js";
import { backupPath, rotateBackups } from "../install/backup.js";
import { unmergeHookSettings } from "../install/hook-settings-merge.js";
import { removeAgentsBlock, readAgentsMd } from "../install/agents-md.js";
import { planUninstall, planUninstallFromJournal, type PlanUninstallDeps, type UninstallOp } from "./uninstall-plan.js";
import type { InstallJournal } from "../install/intent-journal.js";
import type { Receipt } from "../install/install-receipt.js";
import type { ProviderId } from "../providers/spec-verified.js";

export interface ExecuteUninstallOpts {
  dryRun: boolean;
  /** Roots every remove/rewrite must stay within (same guard as install). */
  allowedRoots: string[];
  /** Where settings.json/AGENTS.md backups land before rewrite. */
  backupRoot: string;
  /** Scope root (ctx.home for global, ctx.cwd for project) — the directory-
   *  cleanup walk stops one level below this and never removes it. */
  scopeRoot: string;
}

export interface UninstallResult {
  removed: string[];
  preserved: { path: string; reason: string }[];
  settingsUnmerged: boolean;
  agentsMdCleaned: boolean;
}

/**
 * Remove now-empty directories walking up from `startDir`, stopping before
 * ever deleting a "kind root" — a provider dir (e.g. `.claude`) or the
 * artifact-kind dir beneath it (e.g. `.claude/skills`), depth <= 2 below
 * `scopeRoot`. Only the artifact's own directory and anything nested deeper
 * gets cleaned. Bounded and conservative on purpose — this is the
 * highest-risk operation in the CLI.
 */
function cleanEmptyDirsUpward(startDir: string, scopeRoot: string): void {
  let current = resolve(startDir);
  const root = resolve(scopeRoot);
  for (;;) {
    const rel = relative(root, current);
    if (rel === "" || rel.startsWith("..")) return; // at or above scope root
    const depth = rel.split(/[/\\]/).filter(Boolean).length;
    if (depth <= 2) return; // kind root (e.g. .claude/skills) or provider root — never remove
    if (!existsSync(current)) return;
    let entries: string[];
    try {
      entries = readdirSync(current);
    } catch {
      return;
    }
    if (entries.length > 0) return;
    rmdirSync(current);
    current = dirname(current);
  }
}

/** Apply an uninstall plan. Pure ops are already decided — this only executes. */
export function executeUninstall(ops: UninstallOp[], opts: ExecuteUninstallOpts): UninstallResult {
  const result: UninstallResult = { removed: [], preserved: [], settingsUnmerged: false, agentsMdCleaned: false };

  for (const op of ops) {
    assertWithinRoots(op.path, opts.allowedRoots);

    if (op.action === "preserve-file") {
      result.preserved.push({ path: op.path, reason: op.reason });
      continue;
    }

    if (op.action === "remove-file") {
      result.removed.push(op.path);
      if (opts.dryRun) continue;
      if (existsSync(op.path)) unlinkSync(op.path);
      cleanEmptyDirsUpward(dirname(op.path), opts.scopeRoot);
      continue;
    }

    if (op.action === "unmerge-settings") {
      if (opts.dryRun) {
        result.settingsUnmerged = true;
        continue;
      }
      if (existsSync(op.path)) backupPath(op.path, opts.backupRoot, "settings", opts.scopeRoot);
      const existing = existsSync(op.path) ? readFileSync(op.path, "utf8") : "";
      atomicWrite(op.path, unmergeHookSettings(existing, op.bindings));
      result.settingsUnmerged = true;
      continue;
    }

    if (op.action === "remove-agents-block") {
      if (opts.dryRun) {
        result.agentsMdCleaned = true;
        continue;
      }
      if (existsSync(op.path)) backupPath(op.path, opts.backupRoot, "agents-md", opts.scopeRoot);
      atomicWrite(op.path, removeAgentsBlock(readAgentsMd(op.path)));
      result.agentsMdCleaned = true;
    }
  }

  return result;
}

const realPlanDeps: PlanUninstallDeps = {
  fileExists: (p) => existsSync(p),
  readFileContent: (p) => readFileSync(p, "utf8"),
};

export interface UninstallKitOpts {
  dryRun?: boolean;
  timestamp: string;
}

export interface UninstallKitOutcome {
  providerId: ProviderId;
  result: UninstallResult;
}

export interface UninstallKitReturn {
  outcomes: UninstallKitOutcome[];
  /** Receipt with the uninstalled providers' records removed. */
  receipt: Receipt;
}

/**
 * Uninstall one or more providers recorded in `receipt`. Each provider's own
 * recorded scope decides its root (not the caller's current scope flag) —
 * uninstall must trust what was actually installed, not what the user
 * happens to pass today.
 */
export function uninstallKit(
  receipt: Receipt,
  providerIds: ProviderId[],
  ctx: { home: string; cwd: string },
  opts: UninstallKitOpts,
): UninstallKitReturn {
  const dryRun = opts.dryRun ?? false;
  const nextInstalls = { ...receipt.installs };
  const outcomes: UninstallKitOutcome[] = [];

  for (const providerId of providerIds) {
    const install = receipt.installs[providerId];
    if (!install) continue;
    const root = install.scope === "global" ? ctx.home : ctx.cwd;
    const ops = planUninstall(receipt, providerId, ctx.home, ctx.cwd, realPlanDeps);
    const backupsParent = join(root, ".ariadnev", "backups");
    const result = executeUninstall(ops, {
      dryRun,
      allowedRoots: [ctx.home, ctx.cwd],
      backupRoot: join(backupsParent, opts.timestamp),
      scopeRoot: root,
    });
    outcomes.push({ providerId, result });
    if (!dryRun) {
      rotateBackups(backupsParent, 3);
      delete nextInstalls[providerId];
    }
  }

  return { outcomes, receipt: { ...receipt, installs: nextInstalls } };
}

/**
 * Clean up after an install that was interrupted before it wrote a receipt.
 * Same executor as the receipt path — only the source of the plan differs.
 */
export function recoverFromJournal(
  journal: InstallJournal,
  providerIds: ProviderId[],
  ctx: { home: string; cwd: string },
  opts: UninstallKitOpts,
): UninstallKitOutcome[] {
  const dryRun = opts.dryRun ?? false;
  const root = journal.scope === "global" ? ctx.home : ctx.cwd;
  const outcomes: UninstallKitOutcome[] = [];

  for (const providerId of providerIds) {
    const ops = planUninstallFromJournal(journal, providerId, ctx.home, ctx.cwd, realPlanDeps);
    if (ops.length === 0) continue;
    const backupsParent = join(root, ".ariadnev", "backups");
    const result = executeUninstall(ops, {
      dryRun,
      allowedRoots: [ctx.home, ctx.cwd],
      backupRoot: join(backupsParent, opts.timestamp),
      scopeRoot: root,
    });
    outcomes.push({ providerId, result });
    if (!dryRun) rotateBackups(backupsParent, 3);
  }

  return outcomes;
}
