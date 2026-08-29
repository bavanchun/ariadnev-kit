// Two read-only projections of a plan: a board and a parse.
//
// Both are pure functions over the summaries `plan-pointer.ts` already produces,
// which is the whole reason they are cheap. `kanban` groups phases by status;
// `parse` flattens a plan into the structure a machine would want. Neither reads
// a file, so neither can disagree with `plan show` about what a plan contains.

import type { PlanSummary, PhaseSummary } from "./plan-pointer.js";
import { PLAN_STATUSES, type PlanStatus } from "./plan-mutations.js";

/** Board columns, in the order work moves through them. */
export const BOARD_COLUMNS = [...PLAN_STATUSES] as const;
/** Where a phase whose status is missing or unrecognised goes. */
export const UNKNOWN_COLUMN = "unknown";

export interface BoardCard {
  readonly plan: string;
  readonly phase: number | null;
  readonly title: string;
  readonly file: string;
}

export interface BoardColumn {
  readonly status: string;
  readonly cards: readonly BoardCard[];
}

/**
 * Every phase of every plan given, bucketed by status.
 *
 * An unrecognised status gets its own column rather than being dropped or folded
 * into `pending`. A phase whose frontmatter says `blocked` is not pending, and a
 * board that quietly relabels it is worse than one that shows the odd word.
 */
export function buildBoard(plans: readonly PlanSummary[]): BoardColumn[] {
  const columns = new Map<string, BoardCard[]>();
  for (const status of BOARD_COLUMNS) columns.set(status, []);

  for (const plan of plans) {
    for (const phase of plan.phases) {
      const status = phase.status && (PLAN_STATUSES as readonly string[]).includes(phase.status) ? phase.status : phase.status ?? UNKNOWN_COLUMN;
      if (!columns.has(status)) columns.set(status, []);
      columns.get(status)?.push({
        plan: plan.name,
        phase: phase.phase,
        title: phase.title ?? phase.file.replace(/\.md$/, ""),
        file: phase.file,
      });
    }
  }
  return [...columns.entries()].map(([status, cards]) => ({
    status,
    // Sorted so two runs of one plan render identically: by plan, then by phase
    // number, with unnumbered phases last rather than at the front.
    cards: [...cards].sort(
      (a, b) => a.plan.localeCompare(b.plan) || (a.phase ?? Number.MAX_SAFE_INTEGER) - (b.phase ?? Number.MAX_SAFE_INTEGER),
    ),
  }));
}

export function renderBoard(columns: readonly BoardColumn[]): string {
  const lines: string[] = [];
  for (const column of columns) {
    if (column.cards.length === 0) continue;
    lines.push(`${column.status} (${column.cards.length})`);
    for (const card of column.cards) {
      lines.push(`  ${card.phase === null ? " ?" : String(card.phase).padStart(2)}  ${card.plan}  ${card.title}`);
    }
  }
  return lines.length > 0 ? lines.join("\n") : "no phases to show";
}

export interface ParsedPhase extends PhaseSummary {
  /** Checkbox progress read off the phase body. */
  readonly checked: number;
  readonly total: number;
}

export interface ParsedPlan {
  readonly name: string;
  readonly status: string | null;
  readonly phases: readonly ParsedPhase[];
  readonly progress: { readonly checked: number; readonly total: number };
}

const CHECKBOX = /^[ \t]*[-*][ \t]+\[( |x|X)\]/gm;

/** Checkbox counts for one phase body. */
export function countCheckboxes(body: string): { checked: number; total: number } {
  let checked = 0;
  let total = 0;
  for (const match of body.matchAll(CHECKBOX)) {
    total += 1;
    if (match[1] !== " ") checked += 1;
  }
  return { checked, total };
}

/**
 * A plan as structured data, checkbox progress included.
 *
 * `plan show` renders for a person; this is the shape for a machine, and it is
 * the reason `parse` exists as its own verb rather than a flag on `show`.
 */
export function parsePlan(summary: PlanSummary, bodies: Record<string, string>): ParsedPlan {
  const phases = summary.phases.map((phase) => ({ ...phase, ...countCheckboxes(bodies[phase.file] ?? "") }));
  return {
    name: summary.name,
    status: summary.status,
    phases,
    progress: {
      checked: phases.reduce((sum, phase) => sum + phase.checked, 0),
      total: phases.reduce((sum, phase) => sum + phase.total, 0),
    },
  };
}

export function renderParsed(parsed: ParsedPlan): string {
  const lines = [`${parsed.name} — ${parsed.status ?? "no status"}  (${parsed.progress.checked}/${parsed.progress.total} checked)`];
  for (const phase of parsed.phases) {
    lines.push(
      `  ${phase.phase === null ? " ?" : String(phase.phase).padStart(2)}  ${(phase.status ?? "?").padEnd(12)} ` +
        `${String(`${phase.checked}/${phase.total}`).padEnd(7)} ${phase.title ?? phase.file}`,
    );
  }
  return lines.join("\n");
}

export type { PlanStatus };
