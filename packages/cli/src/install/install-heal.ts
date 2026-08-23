// Removing what an older build installed, when this build no longer writes it.
//
// Each provider's receipt record is replaced wholesale, so after an install
// whose resolver produces different paths, the old files leave the record with
// nothing referencing them. Every diagnostic is then structurally blind:
// uninstall iterates `install.files`, audit builds its owned dirs from the
// dirnames of *tracked* files, and doctor only checks that recorded files
// exist. None of them can see a path the receipt stopped mentioning, so
// orphaning is the default outcome of any path change, not a risk of one.
//
// This is the codebase's first receipt-driven *deletion*, and the receipt is
// not a trusted input: for project scope it lives at `<cwd>/.ariadnev/`, inside
// whatever repository was cloned, and `fromPortablePath` passes an absolute
// path through verbatim. Hence `assertPriorReceiptSafe`, which runs before the
// install writes anything.

import { createHash } from "node:crypto";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";
import { assertWithinRoots } from "./path-guard.js";
import { backupPath } from "./backup.js";
import { cleanEmptyDirsUpward } from "./dir-cleanup.js";
import {
  fromPortablePath,
  SUPPORTED_RECEIPT_SCHEMA_VERSIONS,
  type Receipt,
} from "./install-receipt.js";

/** A file the previous receipt claimed and the new one does not. */
export interface HealRemoval {
  /** Portable path, same grammar as the receipt's — the journal carries these. */
  path: string;
  /** The hash the old receipt recorded, so a user's later edit is still detectable. */
  sha256: string;
}

export interface HealReport {
  removed: string[];
  preserved: { path: string; reason: string }[];
  /**
   * Directories that still exist after their recorded files were removed.
   * Skills write into their own installed trees — one skill's installer
   * git-clones a vendor dir, another builds a venv under `references/` — and
   * nothing in any receipt knows about those. Reported rather than deleted,
   * and rather than silently left.
   */
  survivingDirs: string[];
}

export const EMPTY_HEAL: HealReport = { removed: [], preserved: [], survivingDirs: [] };

/**
 * Reject a prior receipt this build must not act on, **before** the install
 * writes anything.
 *
 * Refusing later would leave the new files on disk, the old receipt in place,
 * and no record connecting them. `buildReceipt` parses the prior receipt with a
 * bare cast; nothing validated it until it started driving deletions.
 */
export function assertPriorReceiptSafe(
  prev: Receipt,
  home: string,
  cwd: string,
  roots: string[],
): void {
  if (!SUPPORTED_RECEIPT_SCHEMA_VERSIONS.includes(prev.schemaVersion)) {
    throw new Error(
      `unsupported receipt schemaVersion ${prev.schemaVersion} ` +
        `(supported: ${SUPPORTED_RECEIPT_SCHEMA_VERSIONS.join(", ")}) — refusing to install over it`,
    );
  }
  for (const install of Object.values(prev.installs)) {
    for (const file of install?.files ?? []) {
      assertWithinRoots(fromPortablePath(file.path, home, cwd), roots);
    }
  }
}

function claimed(receipt: Receipt | null, home: string, cwd: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const install of Object.values(receipt?.installs ?? {})) {
    for (const file of install?.files ?? []) {
      // Keyed by resolved absolute path: two records can spell the same file
      // differently (a project-scope record uses a relative path where a
      // global-scope one uses `~/…`), and they must still collide here.
      out.set(fromPortablePath(file.path, home, cwd), file.path);
    }
  }
  return out;
}

/**
 * Files the previous receipt claimed that the new one no longer does.
 *
 * Computed against the union of **all** records on both sides, never just the
 * providers being reinstalled. Under global scope codex, cursor, antigravity
 * and generic write the same physical `~/.agents/skills`, so a file dropped
 * from the cursor record may still be the codex record's live install —
 * removing it would make every codex diagnostic report missing files.
 */
export function planHeal(
  prev: Receipt | null,
  next: Receipt,
  home: string,
  cwd: string,
): HealRemoval[] {
  if (prev === null) return [];
  const before = claimed(prev, home, cwd);
  const after = claimed(next, home, cwd);
  const hashes = new Map<string, string>();
  for (const install of Object.values(prev.installs)) {
    for (const file of install?.files ?? []) {
      hashes.set(fromPortablePath(file.path, home, cwd), file.sha256);
    }
  }

  const removals: HealRemoval[] = [];
  for (const [abs, portable] of before) {
    if (after.has(abs)) continue;
    removals.push({ path: portable, sha256: hashes.get(abs)! });
  }
  return removals;
}

/**
 * Copy every file a heal is about to delete into `backupRoot`.
 *
 * Must run before `rotateBackups`. The only moment the prior receipt is still
 * readable is after rotation, and `applyOp` backs up only files that already
 * exist *at the destination* — a brand-new `av-cook/SKILL.md` backs up nothing.
 * Without this the pre-prefix tree would be deleted with no recoverable copy at
 * all.
 */
export function backupHeal(
  removals: HealRemoval[],
  backupRoot: string,
  scopeRoot: string,
  home: string,
  cwd: string,
): void {
  for (const removal of removals) {
    backupPath(fromPortablePath(removal.path, home, cwd), backupRoot, "heal", scopeRoot);
  }
}

export interface ExecuteHealOpts {
  home: string;
  cwd: string;
  /** Roots every removal must stay within — the same guard install writes under. */
  allowedRoots: string[];
  /** Scope root; the empty-directory walk stops two levels below it. */
  scopeRoot: string;
}

/** Delete the planned removals. Backups and the journal are the caller's job. */
export function executeHeal(removals: HealRemoval[], opts: ExecuteHealOpts): HealReport {
  const report: HealReport = { removed: [], preserved: [], survivingDirs: [] };
  const touchedDirs = new Set<string>();

  for (const removal of removals) {
    const abs = fromPortablePath(removal.path, opts.home, opts.cwd);
    assertWithinRoots(abs, opts.allowedRoots);
    if (!existsSync(abs)) continue; // already gone — a re-run, or the user removed it
    const current = createHash("sha256").update(readFileSync(abs)).digest("hex");
    if (current !== removal.sha256) {
      report.preserved.push({ path: abs, reason: "modified since install — not removed" });
      continue;
    }
    unlinkSync(abs);
    report.removed.push(abs);
    touchedDirs.add(dirname(abs));
  }

  for (const dir of touchedDirs) cleanEmptyDirsUpward(dir, opts.scopeRoot);
  // Report the outermost survivor per tree, not every nested directory: one
  // line naming `…/skills/cook` is actionable, twelve naming its subdirectories
  // are noise.
  const surviving = [...touchedDirs].filter((dir) => existsSync(dir));
  report.survivingDirs = surviving
    .filter((dir) => !surviving.some((other) => other !== dir && dir.startsWith(`${other}/`)))
    .sort();
  return report;
}
