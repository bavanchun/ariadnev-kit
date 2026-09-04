import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { assertWithinRoots } from "../install/path-guard.js";
import { cleanEmptyDirsUpward } from "../install/dir-cleanup.js";
import { atomicWrite } from "../install/fs-atomic.js";
import { realClassifyDeps } from "../install/file-classification.js";
import { backupPath, rotateBackups } from "../install/backup.js";
import { removeStorageTree } from "../storage/operational-paths.js";
import { withoutServer } from "../mcp/mcp-config.js";
import { unmergeHooksConfig } from "../install/hook-settings-merge.js";
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
      // Copied out before it is unlinked, always. `--force` widens which files
      // reach this branch; it never decides whether the copy is taken, because
      // nothing else recovers a deletion. Settings and AGENTS.md have been
      // backed up before rewrite since the beginning — a rewrite is reversible
      // from the backup and a deletion is reversible from nothing, so the file
      // that most needed the copy was the one not getting it.
      if (existsSync(op.path)) {
        backupPath(op.path, opts.backupRoot, "removed", opts.scopeRoot);
        unlinkSync(op.path);
      }
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
      // Dispatched on the format the install wrote with, because a config that
      // is not settings.json-shaped is not made safe by being edited as if it
      // were. The statusline comes out in the same pass where the provider has
      // one, and only if it is ours: a bar the user configured themselves must
      // survive an uninstall.
      atomicWrite(op.path, unmergeHooksConfig(op.format, existing, op.bindings, op.ownedDir));
      result.settingsUnmerged = true;
      continue;
    }

    // Purge-only ops below. Each is separate from `remove-file` for a reason
    // the type already states: a tree is not backed up because the backup
    // directory is inside it, a binary lives outside every scope root, and an
    // MCP key is removed while its file stays.
    if (op.action === "remove-tree") {
      result.removed.push(op.path);
      if (opts.dryRun) continue;
      // No backup. The state directory *contains* `backups/`, so copying it
      // into itself before deleting it would be a slower way of deleting it.
      removeStorageTree(op.path);
      continue;
    }

    if (op.action === "remove-binary") {
      result.removed.push(op.path);
      if (opts.dryRun) continue;
      // Unlinking a running executable is fine on POSIX — the inode survives
      // until this process exits. The planner never emits this op on Windows,
      // where it would not be.
      if (existsSync(op.path)) unlinkSync(op.path);
      continue;
    }

    if (op.action === "remove-mcp-server") {
      result.removed.push(`${op.path}#${op.name}`);
      if (opts.dryRun) continue;
      if (!existsSync(op.path)) continue;
      // This file belongs to the user and holds a great deal besides servers,
      // so it is backed up and rewritten rather than deleted — the same
      // treatment settings.json gets, for the same reason.
      backupPath(op.path, opts.backupRoot, "mcp", opts.scopeRoot);
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(readFileSync(op.path, "utf8"));
      } catch {
        // Unparseable now, though it parsed when the plan was built. Rewriting
        // it from a failed parse would replace the user's file with `{}`.
        result.preserved.push({ path: op.path, reason: "config became unreadable between plan and apply" });
        continue;
      }
      const { config } = withoutServer(parsed, op.name);
      atomicWrite(op.path, `${JSON.stringify(config, null, 2)}\n`);
      continue;
    }

    if (op.action === "report-kept") {
      result.preserved.push({ path: op.path, reason: op.reason });
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

// The same filesystem reads install classifies with. One definition of "is this
// file there, and is it still ours" for both directions: an install and an
// uninstall disagreeing about that is the drift this design exists to prevent.
const realPlanDeps: PlanUninstallDeps = realClassifyDeps;

export interface UninstallKitOpts {
  dryRun?: boolean;
  timestamp: string;
  /** Extend deletion to files the user has edited since install. Never to orphans. */
  force?: boolean;
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
    const ops = planUninstall(receipt, providerId, ctx.home, ctx.cwd, realPlanDeps, { force: opts.force });
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
