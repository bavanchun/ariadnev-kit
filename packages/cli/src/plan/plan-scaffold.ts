// Making a new plan directory, and appending a phase to an existing one.
//
// Pure: names and text, no filesystem. The commands in `plan-command.ts` decide
// where the bytes go, which keeps every rule about *shape* — how a slug is
// formed, what a phase's frontmatter must carry, which number comes next —
// testable without a temp directory.
//
// THE TEMPLATES ARE WRITTEN TO PASS `checkPlanIntegrity`. That function is what
// `plan validate` and `plan reindex` judge a plan by, and a scaffold that
// produces something its own validator rejects is worse than no scaffold: it
// teaches the user that the validator is noise. `plan-scaffold.test.ts` asserts
// the round trip rather than trusting this comment.

import { PLAN_STATUSES, type PlanStatus } from "./plan-mutations.js";

/** A filename-safe slug. ASCII, lowercase, no runs of separators. */
export function slugify(text: string): string {
  const slug = text
    .normalize("NFKD")
    // Combining marks, spelled by codepoint: the literal range is invisible in
    // a diff and one stray byte turns it into a class that matches nothing.
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  return slug;
}

/**
 * `260829-1420` — the stamp every plan directory in this repository is named by.
 *
 * Two-digit year and no seconds, which is the convention already on disk; the
 * backup stamp elsewhere in the CLI is a different shape for a different job and
 * deriving one from the other by slicing was unreadable at the call site.
 */
export function planStamp(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${pad(date.getFullYear() % 100)}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

/** `260829-1420-my-plan`. The stamp is the caller's, so tests are not clocks. */
export function planDirName(stamp: string, title: string): string {
  const slug = slugify(title);
  return slug ? `${stamp}-${slug}` : stamp;
}

/**
 * The next free phase number in a directory.
 *
 * Reads the numbers off the filenames rather than counting files: a plan whose
 * phase 2 was deleted must not hand out 2 again and collide with the phase 3
 * that still references it. Max + 1, never a gap-filler.
 */
export function nextPhaseNumber(entries: readonly string[]): number {
  let highest = 0;
  for (const entry of entries) {
    const match = /^phase-(\d+)\D.*\.md$/.exec(entry);
    if (!match) continue;
    const parsed = Number(match[1]);
    if (Number.isFinite(parsed) && parsed > highest) highest = parsed;
  }
  return highest + 1;
}

/** `phase-03-schema-work.md`. Two digits, matching every plan in this repo. */
export function phaseFileName(phase: number, title: string): string {
  const slug = slugify(title);
  return `phase-${String(phase).padStart(2, "0")}${slug ? `-${slug}` : ""}.md`;
}

export interface PlanScaffold {
  readonly title: string;
  readonly description?: string;
  readonly status?: PlanStatus;
  readonly priority?: string;
  readonly created: string;
}

/** YAML-safe: a double-quoted scalar with its quotes and backslashes escaped. */
function quoted(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function renderPlanMd(scaffold: PlanScaffold): string {
  const status: PlanStatus = scaffold.status ?? "pending";
  if (!(PLAN_STATUSES as readonly string[]).includes(status)) {
    throw new Error(`plan status ${status} is not one of ${PLAN_STATUSES.join(", ")}`);
  }
  return [
    "---",
    `title: ${quoted(scaffold.title)}`,
    `description: ${quoted(scaffold.description ?? "")}`,
    `status: ${status}`,
    `priority: ${scaffold.priority ?? "P2"}`,
    `created: ${scaffold.created}`,
    "---",
    "",
    `# ${scaffold.title}`,
    "",
    "## Outcome",
    "",
    "<!-- What is true when this is done, and how you will know. -->",
    "",
    "## Phases",
    "",
    "| # | Phase | Dependencies | Effort | Status |",
    "|---|-------|--------------|--------|--------|",
    "",
    "## Open questions",
    "",
    "None.",
    "",
  ].join("\n");
}

export interface PhaseScaffold {
  readonly phase: number;
  readonly title: string;
  readonly status?: PlanStatus;
  readonly priority?: string;
  readonly dependencies?: readonly number[];
}

/** The phase template every plan in this repository already follows. */
export function renderPhaseMd(scaffold: PhaseScaffold): string {
  return [
    "---",
    `phase: ${scaffold.phase}`,
    `title: ${quoted(scaffold.title)}`,
    `status: ${scaffold.status ?? "pending"}`,
    `priority: ${scaffold.priority ?? "P2"}`,
    `effort: ""`,
    `dependencies: [${(scaffold.dependencies ?? []).join(", ")}]`,
    "---",
    "",
    `# Phase ${scaffold.phase}: ${scaffold.title}`,
    "",
    "## Overview",
    "",
    "<!-- What this phase delivers, in a sentence or two. -->",
    "",
    "## Related Code Files",
    "",
    "## Implementation Steps",
    "",
    "1. ",
    "",
    "## Success Criteria",
    "",
    "- [ ] ",
    "",
    "## Risk Assessment",
    "",
    "<!-- The risk, the signal it is happening, and the pre-decided response. -->",
    "",
  ].join("\n");
}

/** The row `plan create` and `add-phase` append to the plan's phase table. */
export function phaseTableRow(phase: number, title: string, file: string): string {
  return `| ${phase} | [${title}](./${file}) | — | — | Pending |`;
}

/**
 * Insert a row at the end of the plan's phase table.
 *
 * Appended to the last table row rather than to the end of the file, because a
 * plan.md has sections after its table and a row landing under "Open questions"
 * is not in the table at all. When there is no table, the plan is returned
 * unchanged and the caller says so — silently rewriting someone's index is
 * worse than declining to.
 */
export function appendPhaseRow(planMd: string, row: string): string | null {
  const lines = planMd.split("\n");
  let last = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (/^\|\s*(?:-+|\d+)\s*\|/.test(lines[i] as string)) last = i;
  }
  if (last === -1) return null;
  lines.splice(last + 1, 0, row);
  return lines.join("\n");
}
