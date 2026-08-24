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
import { mergeHookSettings, mergeStatusLine } from "./hook-settings-merge.js";
import { buildReceipt, type ProviderResultForReceipt, type Receipt, type ReceiptSkillSelection } from "./install-receipt.js";
import { writeAdapterArtifactsSafe } from "../adapters/write-adapter-artifacts.js";
import type { InstallOp, ProviderInstallResult } from "./install-types.js";
import { JOURNAL_SCHEMA_VERSION, clearJournal, plannedEntries, readJournal, writeJournal } from "./intent-journal.js";
import {
  EMPTY_HEAL,
  assertPriorReceiptSafe,
  backupHeal,
  executeHeal,
  planHeal,
  previewHeal,
  type HealReport,
} from "./install-heal.js";

export interface ExecuteOpts {
  dryRun: boolean;
  /** Injected timestamp for the backup dir (never Date.now() in lib code). */
  timestamp: string;
  /** Roots every write must stay within (path-traversal guard). */
  allowedRoots: string[];
  /** Scope root (ctx.home for global, ctx.cwd for project); backups mirror
   *  each target's path relative to it. */
  scopeRoot: string;
  /** User confirmed merging hook bindings into settings.json (default: no). */
  applyHookSettings?: boolean;
}

function opContent(op: Exclude<InstallOp, { action: "skip" }>): string | Buffer {
  if (op.action === "agents-md") return mergeAgentsBlock(readAgentsMd(op.dest), op.block);
  if (op.action === "hook-settings") return mergeHookSettings(readAgentsMd(op.dest), op.bindings);
  if (op.action === "statusline-settings") {
    // `applied: false` means the user already has a statusline of their own.
    // Returning the file unchanged writes it back byte-identical, which the
    // receipt and the audit both read as "present and unmodified".
    return mergeStatusLine(readAgentsMd(op.dest), op.command, op.ownedDir).json;
  }
  return op.content;
}

function applyOp(op: InstallOp, backupRoot: string, opts: ExecuteOpts): { wrote: boolean; backedUp: boolean } {
  if (op.action === "skip") return { wrote: false, backedUp: false };
  assertWithinRoots(op.dest, opts.allowedRoots);
  const existed = existsSync(op.dest);
  const content = opContent(op);
  if (opts.dryRun) return { wrote: true, backedUp: existed };
  if (existed) backupPath(op.dest, backupRoot, op.kind, opts.scopeRoot);
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
    // Both of these edit settings.json, so both wait for the same confirmation.
    // The statusline is what the user looks at all session; taking it over
    // because they installed a kit is the kind of change noticed as "my terminal
    // looks different now" with nothing to explain it.
    if ((op.action === "hook-settings" || op.action === "statusline-settings") && !opts.applyHookSettings) {
      result.skipped.push({
        action: "skip",
        kind: op.kind,
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

/** Two heal reports from one run: the recovered pending set, then this run's. */
function mergeHeal(a: HealReport, b: HealReport): HealReport {
  return {
    removed: [...a.removed, ...b.removed],
    // Only a dry run fills this, and a dry run never reaches a merge.
    wouldRemove: [],
    preserved: [...a.preserved, ...b.preserved],
    survivingDirs: [...new Set([...a.survivingDirs, ...b.survivingDirs])].sort(),
  };
}

function receiptPath(root: string): string {
  return join(root, ".ariadnev", "receipt.json");
}

export interface InstallKitResult {
  results: ProviderInstallResult[];
  /** What the install removed because this build no longer writes it there. */
  heal: HealReport;
}

/** Install the kit to every requested provider; returns per-provider results. */
export function installKit(
  kit: Kit,
  providers: ProviderId[],
  ctx: ResolverCtx,
  opts: InstallKitOpts,
): InstallKitResult {
  const baseRoot = ctx.scope === "global" ? ctx.home : ctx.cwd;
  const backupsParent = join(baseRoot, ".ariadnev", "backups");
  const backupRoot = join(backupsParent, opts.timestamp);
  const allowedRoots = [ctx.home, ctx.cwd];
  const applyHookSettings = opts.applyHookSettings ?? false;
  const results: ProviderInstallResult[] = [];
  const receiptEntries: ProviderResultForReceipt[] = [];

  // Read and vet the prior receipt before a single byte is written. It is what
  // drives the deletions below, and for project scope it lives inside whatever
  // repository was cloned — refusing it after the install has run would leave a
  // half-applied upgrade with no record tying the two halves together.
  const rPath = receiptPath(baseRoot);
  const prevJson = existsSync(rPath) ? readFileSync(rPath, "utf8") : "";
  const prevReceipt: Receipt | null = prevJson.trim().length ? (JSON.parse(prevJson) as Receipt) : null;
  if (prevReceipt !== null) assertPriorReceiptSafe(prevReceipt, ctx.home, ctx.cwd, allowedRoots);

  // Finish a heal a previous run was killed partway through, before the journal
  // below overwrites the record of it. Those files were already backed up by
  // the run that journalled them.
  let heal: HealReport = EMPTY_HEAL;
  if (!opts.dryRun) {
    const pending = readJournal(baseRoot)?.healRemovals ?? [];
    if (pending.length > 0) {
      heal = executeHeal(pending, { home: ctx.home, cwd: ctx.cwd, allowedRoots, scopeRoot: baseRoot });
    }
  }

  // Plan every provider before writing anything, so the journal can name all
  // planned destinations up front. Planning is pure, so a planning error here
  // leaves the disk untouched.
  const planned = providers.map((id) => ({ id, ops: planInstall(kit, getResolver(id), ctx) }));
  // Every skill in the kit, until selective install narrows it (phase 6).
  const skillSelection: ReceiptSkillSelection = {
    mode: "all",
    skills: kit.skills.map((s) => s.name),
    selectedCount: kit.skills.length,
    totalCount: kit.skills.length,
  };
  const journalProviders = planned.map(({ id, ops }) => ({
    provider: id,
    planned: plannedEntries(ops, ctx.home, ctx.cwd),
  }));
  if (!opts.dryRun) {
    writeJournal(baseRoot, {
      schemaVersion: JOURNAL_SCHEMA_VERSION,
      timestamp: opts.timestamp,
      scope: ctx.scope,
      providers: journalProviders,
    });
  }

  for (const { id, ops } of planned) {
    const result = executeInstall(ops, id, backupRoot, {
      dryRun: opts.dryRun ?? false,
      timestamp: opts.timestamp,
      allowedRoots,
      scopeRoot: baseRoot,
      applyHookSettings,
    });
    results.push(result);
    receiptEntries.push({ providerId: id, scope: ctx.scope, applyHookSettings, result, skillSelection });
  }
  // Built in a dry run too. It writes nothing, and it is the only way the run
  // can say which files the real one would delete — the advice for an upgrade
  // that removes things from a home directory is to try it with `--dry-run`
  // first, and that has to be worth doing.
  const receiptJson = buildReceipt(prevJson, receiptEntries, {
    ariadnevVersion: opts.ariadnevVersion ?? "0.0.0",
    timestamp: opts.timestamp,
    home: ctx.home,
    cwd: ctx.cwd,
  });
  const removals = planHeal(prevReceipt, JSON.parse(receiptJson) as Receipt, ctx.home, ctx.cwd);
  if (opts.dryRun) return { results, heal: previewHeal(removals, ctx.home, ctx.cwd) };

  {
    // Before rotation, or the copy would be pruned by the very run that made it
    // the only copy.
    if (removals.length > 0) {
      backupHeal(removals, join(backupsParent, `heal-${opts.timestamp}`), baseRoot, ctx.home, ctx.cwd);
    }
    rotateBackups(backupsParent, 3);

    // Journal the intent, write the receipt, then delete. Deleting first would
    // leave the on-disk receipt describing files that no longer exist; the
    // journal covers the window where the reverse is true.
    if (removals.length > 0) {
      writeJournal(baseRoot, {
        schemaVersion: JOURNAL_SCHEMA_VERSION,
        timestamp: opts.timestamp,
        scope: ctx.scope,
        providers: journalProviders,
        healRemovals: removals,
      });
    }
    atomicWrite(rPath, receiptJson);
    if (removals.length > 0) {
      heal = mergeHeal(
        heal,
        executeHeal(removals, { home: ctx.home, cwd: ctx.cwd, allowedRoots, scopeRoot: baseRoot }),
      );
    }
    // The receipt is now the ownership record; the crash-window journal has
    // nothing left to describe.
    clearJournal(baseRoot);

    // Project the receipt onto the adapter tree, for tools that read that
    // format. Strictly downstream and strictly best-effort: an install that
    // succeeded is not a failure because a side record could not be written.
    for (const { id } of planned) {
      writeAdapterArtifactsSafe({
        receipt: JSON.parse(receiptJson) as Receipt,
        provider: id,
        kit: "engineer",
        kitVersion: opts.ariadnevVersion ?? "0.0.0",
        home: ctx.home,
        cwd: ctx.cwd,
      });
    }
  }
  return { results, heal };
}

export { planInstall } from "./install-plan.js";
