// The text report for a purge.
//
// One block per pass, in execution order, because the order is the thing a
// reader most needs to understand: what goes first, and what the last block
// takes away that the earlier ones relied on.
//
// Kept apart from `uninstall-command.ts` for the ordinary reason — that module
// orchestrates, this one renders — and for one specific to purge: the preview
// is the entire safety mechanism here. It is the only thing standing between a
// user and an irreversible deletion, so it gets a file where it can be read.
import type { PurgeExecution } from "./purge-execute.js";
import type { UninstallResult } from "./uninstall-execute.js";

function section(title: string, result: UninstallResult): string[] {
  if (result.removed.length === 0 && result.preserved.length === 0) return [`  ${title}: nothing to do`];
  const lines = [`  ${title}: removed=${result.removed.length} kept=${result.preserved.length}`];
  for (const path of result.removed) lines.push(`      - ${path}`);
  for (const { path, reason } of result.preserved) lines.push(`      - kept (${reason}): ${path}`);
  return lines;
}

/**
 * The purge blocks, to be appended to the ordinary uninstall summary.
 *
 * Every removed path is listed in full rather than counted. A count is the
 * right density for provider files — there are 1570 of them and they are all
 * the same kind of thing — but these are a handful of paths that each mean
 * something different, and the whole point of the preview is that the user
 * recognises them.
 */
export function renderPurgeSummary(execution: PurgeExecution, dryRun: boolean): string[] {
  const lines: string[] = ["", dryRun ? "  purge plan (nothing applied):" : "  purge:"];

  if (execution.projects.length === 0) {
    lines.push("  registered projects: none");
  } else {
    for (const { target, outcomes, residue } of execution.projects) {
      if (target.status === "missing") {
        lines.push(`  project ${target.name} (${target.dir}): skipped — directory no longer exists`);
        continue;
      }
      const files = outcomes.reduce((n, o) => n + o.result.removed.length, 0);
      lines.push(`  project ${target.name} (${target.dir}): provider files removed=${files}`);
      for (const line of section("state", residue)) lines.push(`  ${line}`);
    }
  }

  lines.push(...section("mcp residue", execution.mcp));
  lines.push(...section("state directory", execution.state));
  lines.push(...section("binary", execution.binary));
  return lines;
}

/**
 * The warning that has to be impossible to miss.
 *
 * Plain uninstall is reversible: every file it removes is copied into
 * `.ariadnev/backups` first. Purge deletes that directory, which means it
 * deletes the copies its own earlier passes just made. Saying "this cannot be
 * undone" is not caution here, it is the accurate description.
 */
export function purgeWarning(): string[] {
  return [
    "  purge is IRREVERSIBLE — it deletes .ariadnev/backups, including the copies",
    "  taken by this same run. Plain uninstall (without --purge) keeps them.",
  ];
}
