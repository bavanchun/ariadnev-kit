// Runs a purge plan, in the one order that is safe.
//
//   providers → projects → mcp → state → binary
//
// Not a preference. Every pass before `state` writes its safety copies into
// `.ariadnev/backups`, which `state` deletes; and `binary` unlinks the
// executable running all of it. Reordering either one silently destroys the
// thing the earlier pass depended on, so the sequence lives here as straight
// line code rather than as a list something could iterate in the wrong
// direction.
//
// NO NEW DELETION LOGIC. Provider files in a registered project are removed by
// the same `uninstallKit` that removes them in the current one, reading that
// project's own receipt. This module sequences passes; it does not decide
// ownership.
import { existsSync, lstatSync, readFileSync, readdirSync, readlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { executeUninstall, uninstallKit, type UninstallKitOutcome, type UninstallResult } from "./uninstall-execute.js";
import { planPurge, type PurgePlan, type PurgePlanDeps, type PurgeProjectTarget } from "./purge-plan.js";
import type { ProviderId } from "../providers/spec-verified.js";
import type { Receipt } from "../install/install-receipt.js";

/** The filesystem reads `planPurge` needs, against the real filesystem. */
export const realPurgeDeps: PurgePlanDeps = {
  fileExists: (path) => existsSync(path),
  listEntries: (dir) => {
    try {
      return readdirSync(dir);
    } catch {
      return [];
    }
  },
  readJson: (path) => {
    try {
      return JSON.parse(readFileSync(path, "utf8"));
    } catch {
      return null;
    }
  },
  readLinkTarget: (path) => {
    try {
      return lstatSync(path).isSymbolicLink() ? readlinkSync(path) : null;
    } catch {
      return null;
    }
  },
  sameContent: (a, b) => {
    try {
      return readFileSync(a).equals(readFileSync(b));
    } catch {
      return false;
    }
  },
  platform: process.platform,
};

export interface PurgeProjectResult {
  target: PurgeProjectTarget;
  /** Empty for a target that was `missing` or had no receipt. */
  outcomes: UninstallKitOutcome[];
  /** That project's own `.ariadnev` and MCP residue. */
  residue: UninstallResult;
}

export interface PurgeExecution {
  projects: PurgeProjectResult[];
  mcp: UninstallResult;
  state: UninstallResult;
  binary: UninstallResult;
}

export interface PurgeExecuteOpts {
  dryRun: boolean;
  timestamp: string;
  home: string;
  cwd: string;
  scope: "project" | "global";
  execPath: string;
  /** Every root a purge op may touch: home, cwd, each project, the exec dir. */
  allowedRoots: string[];
}

const EMPTY: UninstallResult = { removed: [], preserved: [], settingsUnmerged: false, agentsMdCleaned: false };

function merge(a: UninstallResult, b: UninstallResult): UninstallResult {
  return {
    removed: [...a.removed, ...b.removed],
    preserved: [...a.preserved, ...b.preserved],
    settingsUnmerged: a.settingsUnmerged || b.settingsUnmerged,
    agentsMdCleaned: a.agentsMdCleaned || b.agentsMdCleaned,
  };
}

/** Build the plan against the real filesystem. Separated so callers can preview. */
export function purgePlanFor(opts: PurgeExecuteOpts, deps: PurgePlanDeps = realPurgeDeps): PurgePlan {
  return planPurge(deps, { home: opts.home, cwd: opts.cwd, scope: opts.scope, execPath: opts.execPath });
}

/**
 * Apply a purge plan. The provider pass for the *current* scope has already run
 * by the time this is called — `runUninstall` owns that, unchanged — so this
 * starts at the projects pass.
 */
export function executePurge(
  plan: PurgePlan,
  opts: PurgeExecuteOpts,
  deps: PurgePlanDeps = realPurgeDeps,
): PurgeExecution {
  const projects = plan.projects.map((target) => purgeProject(target, opts, deps));
  const shared = {
    dryRun: opts.dryRun,
    allowedRoots: opts.allowedRoots,
    backupRoot: join(opts.scope === "global" ? opts.home : opts.cwd, ".ariadnev", "backups", opts.timestamp),
    scopeRoot: opts.scope === "global" ? opts.home : opts.cwd,
  };
  const mcp = executeUninstall(plan.mcp, shared);
  const state = executeUninstall(plan.state, shared);
  // The executable's directory is not a scope root, so it needs its own — and
  // it is the only pass that gets one, which is why it is not folded into
  // `shared`.
  const binary = executeUninstall(plan.binary, { ...shared, scopeRoot: dirname(opts.execPath) });
  return { projects, mcp, state, binary };
}

/**
 * One registered project: its provider files from its own receipt, then its own
 * `.ariadnev` and MCP residue.
 *
 * A target that is `missing` or has no receipt still reaches the residue pass —
 * a directory can hold a stale `.ariadnev` long after its receipt is gone, and
 * that is exactly the leftover purge exists to collect.
 */
function purgeProject(target: PurgeProjectTarget, opts: PurgeExecuteOpts, deps: PurgePlanDeps): PurgeProjectResult {
  if (target.status === "missing") return { target, outcomes: [], residue: EMPTY };

  const ctx = { home: opts.home, cwd: target.dir };
  let outcomes: UninstallKitOutcome[] = [];
  if (target.status === "ready") {
    const receipt = JSON.parse(readFileSync(join(target.dir, ".ariadnev", "receipt.json"), "utf8")) as Receipt;
    const providerIds = Object.keys(receipt.installs) as ProviderId[];
    outcomes = uninstallKit(receipt, providerIds, ctx, {
      dryRun: opts.dryRun,
      timestamp: opts.timestamp,
      // `--force` is deliberately not forwarded. Widening deletion to
      // user-edited files is a judgement about files the user is looking at;
      // making it for directories they did not name in this command is not the
      // same decision, and purge does not get to make it on their behalf.
    }).outcomes;
  }

  // Plan the project's own residue at project scope: no registry recursion, no
  // second binary.
  const sub = planPurge(deps, { home: opts.home, cwd: target.dir, scope: "project", execPath: opts.execPath });
  const shared = {
    dryRun: opts.dryRun,
    allowedRoots: opts.allowedRoots,
    backupRoot: join(target.dir, ".ariadnev", "backups", opts.timestamp),
    scopeRoot: target.dir,
  };
  // No backup rotation here. `uninstallKit` already rotated, and the state pass
  // on the next line deletes the directory those backups are in — purge is
  // irreversible by construction, and pretending otherwise would be worse than
  // saying so.
  const residue = merge(executeUninstall(sub.mcp, shared), executeUninstall(sub.state, shared));
  return { target, outcomes, residue };
}
