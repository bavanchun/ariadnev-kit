// Pure-ish uninstall planner: given a parsed receipt and injected fs reads,
// decide exactly what to remove/preserve/unmerge. No writes happen here —
// uninstall-execute.ts applies the plan this produces.
import { join } from "node:path";
import { classifyFiles, plannedDeletions, refusedDeletions } from "../install/file-classification.js";
import {
  fromPortablePath,
  SUPPORTED_RECEIPT_SCHEMA_VERSIONS,
  type Receipt,
} from "../install/install-receipt.js";
import type { ProviderId } from "../providers/spec-verified.js";
import type { HookBinding } from "../install/hook-settings-merge.js";
import type { InstallJournal } from "../install/intent-journal.js";
import { CLAUDE_HOOKS_DIR, CLAUDE_SETTINGS_FILE } from "../adapt/paths.js";

export class UninstallPlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UninstallPlanError";
  }
}

export interface RemoveFileOp {
  action: "remove-file";
  path: string;
}

export interface PreserveFileOp {
  action: "preserve-file";
  path: string;
  reason: string;
}

export interface UnmergeSettingsOp {
  action: "unmerge-settings";
  path: string;
  bindings: HookBinding[];
  /** Directory this install owns — how its own statusline entry is recognised. */
  ownedDir?: string;
}

export interface RemoveAgentsBlockOp {
  action: "remove-agents-block";
  path: string;
}

/**
 * A directory removed whole, without a per-file ownership check.
 *
 * The only thing that ever produces one is a `.ariadnev` state directory, and
 * that is the single wholesale removal in this tool. It is allowed there and
 * nowhere else because ariadnev owns that directory by construction — every
 * writer under it is in this repository, and nothing else puts anything there.
 * `executeUninstall` does not take that on faith: it lists the top level and
 * keeps anything outside the known layout.
 */
export interface RemoveTreeOp {
  action: "remove-tree";
  path: string;
  reason: string;
}

/**
 * The installed executable, and optionally the short alias beside it.
 *
 * Separate from `remove-file` because it is unlike every other deletion here:
 * it lives outside any scope root, it has no receipt entry, and it is not
 * backed up — the backup directory is deleted by the same run.
 */
export interface RemoveBinaryOp {
  action: "remove-binary";
  path: string;
}

/**
 * Something purge found, could not prove was ours, and therefore left alone.
 *
 * Distinct from `preserve-file`, which means "ours, but you edited it". This
 * one means "we have no evidence this is ours at all" — a foreign `av` on the
 * PATH, an MCP server someone configured by hand.
 */
export interface ReportKeptOp {
  action: "report-kept";
  path: string;
  reason: string;
}

/**
 * One server key removed from an MCP config file the tool does not own.
 *
 * Not a `remove-file`: the file stays and keeps everything else in it. The
 * distinction matters enough to be in the type, because these two ops printed
 * the same way would tell a user their whole `~/.claude.json` was about to go.
 */
export interface RemoveMcpServerOp {
  action: "remove-mcp-server";
  path: string;
  name: string;
}

export type UninstallOp =
  | RemoveFileOp
  | PreserveFileOp
  | UnmergeSettingsOp
  | RemoveAgentsBlockOp
  | RemoveTreeOp
  | RemoveBinaryOp
  | RemoveMcpServerOp
  | ReportKeptOp;

export interface PlanUninstallDeps {
  fileExists(absPath: string): boolean;
  /**
   * Read a file for hashing. Bytes, not text: the receipt's hash was taken over
   * bytes, so reading a font or an image back as utf8 produces a different
   * digest, every binary file looks user-modified, and uninstall preserves the
   * whole lot. That is what happened — 55 files survived a full uninstall.
   */
  readFileContent(absPath: string): Buffer | string;
  /**
   * The files directly inside one directory, absolute. Optional: without it the
   * plan simply carries no orphan rows. That costs the report, not the
   * guarantee — an orphan is excluded from deletion by the shape of
   * `plannedDeletions`, not by having been noticed here.
   */
  listFiles?(dir: string): string[];
}

export interface PlanUninstallOpts {
  /**
   * Widen deletion from `clean` to `clean | modified`. It cannot widen further:
   * an orphan is not in either set, so no value of this flag reaches one.
   */
  force?: boolean;
}

function scopeRoot(scope: "project" | "global", home: string, cwd: string): string {
  return scope === "global" ? home : cwd;
}

/**
 * Recovery plan for an install that died before writing its receipt. The
 * journal records intent, not outcome: a planned path may never have been
 * written, and the ones that were carry no recorded hash. So this removes only
 * files that actually exist, and — unlike the receipt path — cannot tell an
 * untouched file from one the user edited afterwards. The window it covers is
 * a single interrupted run, which makes that acceptable; it would not be for
 * the normal uninstall path.
 *
 * Merge targets (AGENTS.md, settings.json) are never removed: the install
 * rewrote them in place rather than creating them, so deleting them would
 * destroy content that was never ours.
 */
export function planUninstallFromJournal(
  journal: InstallJournal,
  providerId: ProviderId,
  home: string,
  cwd: string,
  deps: PlanUninstallDeps,
): UninstallOp[] {
  const entry = journal.providers.find((p) => p.provider === providerId);
  if (!entry) return [];

  const ops: UninstallOp[] = [];
  for (const planned of entry.planned) {
    const abs = fromPortablePath(planned.path, home, cwd);
    if (!deps.fileExists(abs)) continue; // never reached before the crash
    if (planned.action === "write") {
      ops.push({ action: "remove-file", path: abs });
    } else {
      ops.push({
        action: "preserve-file",
        path: abs,
        reason: "merged file from an interrupted install — restore from backups if needed",
      });
    }
  }
  return ops;
}

/**
 * Build the uninstall plan for one provider from its receipt record.
 *
 * The clean/modified/orphan/missing decision is **not made here.** It belongs
 * to `file-classification.ts`, and this asks it rather than re-deriving it: two
 * implementations of "has the user edited this file" is exactly the drift the
 * ownership design set out to avoid, and the moment they would disagree is the
 * moment a file gets deleted.
 */
export function planUninstall(
  receipt: Receipt,
  providerId: ProviderId,
  home: string,
  cwd: string,
  deps: PlanUninstallDeps,
  opts: PlanUninstallOpts = {},
): UninstallOp[] {
  if (!SUPPORTED_RECEIPT_SCHEMA_VERSIONS.includes(receipt.schemaVersion)) {
    throw new UninstallPlanError(
      `unsupported receipt schemaVersion ${receipt.schemaVersion} ` +
        `(supported: ${SUPPORTED_RECEIPT_SCHEMA_VERSIONS.join(", ")}) — refusing to uninstall`,
    );
  }

  const install = receipt.installs[providerId];
  if (!install) return [];

  const ops: UninstallOp[] = [];
  const root = scopeRoot(install.scope, home, cwd);
  const force = opts.force ?? false;

  // Providers can share a destination root — codex and cursor both resolve to
  // `~/.agents/skills` — so one receipt records the same absolute path under
  // each. Deleting on this provider's claim alone removes files the other
  // install still owns and still needs, and its next `doctor` reports every one
  // of them missing. Ownership is the whole receipt's, not one record's.
  // Deliberately not subject to --force: force overrides "the user edited this",
  // and this is not that.
  const claimedElsewhere = new Map<string, string>();
  for (const [otherId, other] of Object.entries(receipt.installs)) {
    if (otherId === providerId || !other) continue;
    for (const file of other.files) claimedElsewhere.set(fromPortablePath(file.path, home, cwd), otherId);
  }

  const classified = classifyFiles({ receipt, providerIds: [providerId], home, cwd }, deps);
  for (const file of plannedDeletions(classified, { force })) {
    const owner = claimedElsewhere.get(file.path);
    if (owner) {
      ops.push({ action: "preserve-file", path: file.path, reason: `still installed for ${owner}` });
      continue;
    }
    ops.push({ action: "remove-file", path: file.path });
  }
  for (const { path, reason } of refusedDeletions(classified, { force })) {
    ops.push({ action: "preserve-file", path, reason });
  }

  const applied = install.hookBindings.filter((b) => b.applied);
  if (applied.length > 0) {
    ops.push({
      action: "unmerge-settings",
      path: join(root, CLAUDE_SETTINGS_FILE),
      bindings: applied.map(({ event, matcher, command }) => ({ event, matcher, command })),
      ownedDir: join(root, CLAUDE_HOOKS_DIR),
    });
  }

  if (install.agentsMdManaged) {
    ops.push({ action: "remove-agents-block", path: join(root, "AGENTS.md") });
  }

  return ops;
}
