// `ariadnev plan use|show` — the current-plan pointer several skills rely on.
//
// Scope is deliberately narrow. The upstream kit's skills call about twenty
// `plan` subcommands (create, update, close, check, archive, reindex …), which
// is a plan-management product of its own; this pair is what the pointer
// contract needs, and the rest is recorded as a gap rather than stubbed. A
// subcommand that exists and does nothing is worse than one that is absent — the
// absent one fails loudly.

import { EXIT, UsageError, type ExitCode } from "./exit-codes.js";
import {
  currentPlan,
  isPlanDirectory,
  parsePointer,
  setPointer,
  summarizePlan,
  type PlanSummary,
} from "../plan/plan-pointer.js";

export const PLAN_ENVELOPE_KIND = "plan";
export const PLAN_SCHEMA_VERSION = 1;

export interface PlanDeps {
  /** Entries of a directory, or null when it does not exist. */
  listDir(path: string): string[] | null;
  /** File contents, or null when absent/unreadable. */
  readFile(path: string): string | null;
  writeFile(path: string, content: string): void;
  /** Current git branch, or null outside a repository. */
  branch(): string | null;
}

export interface PlanOpts {
  cwd: string;
  /** Plans directory, relative to cwd — `paths.plans` from the config. */
  plansDir: string;
  json?: boolean;
}

export interface PlanResult {
  output: string;
  exitCode: ExitCode;
}

/** Where the pointer lives: beside the receipt, in the dir ariadnev owns. */
export function pointerPath(cwd: string): string {
  return `${cwd}/.ariadnev/current-plan.json`;
}

function envelope(kind: string, data: unknown): string {
  return JSON.stringify({ schema_version: PLAN_SCHEMA_VERSION, kind, data }, null, 2);
}

/** The branch a pointer is filed under. Detached or non-git work shares one. */
function pointerKey(deps: PlanDeps): string {
  return deps.branch() ?? "(no branch)";
}

function readPlan(deps: PlanDeps, opts: PlanOpts, name: string): PlanSummary | null {
  const dir = `${opts.cwd}/${opts.plansDir}/${name}`;
  const entries = deps.listDir(dir);
  if (!entries || !isPlanDirectory(entries)) return null;
  const files: Record<string, string> = {};
  for (const entry of entries) {
    if (!entry.endsWith(".md")) continue;
    const content = deps.readFile(`${dir}/${entry}`);
    if (content !== null) files[entry] = content;
  }
  return summarizePlan(name, files);
}

export function runPlanUse(name: string, opts: PlanOpts, deps: PlanDeps): PlanResult {
  const summary = readPlan(deps, opts, name);
  if (!summary) {
    // Naming a plan that is not there is a usage error, not a failure of the
    // plan: pointing at nothing would make `show` report an empty answer later,
    // far from the mistake.
    throw new UsageError(`no plan named "${name}" under ${opts.plansDir}/ (a plan directory contains plan.md)`);
  }
  const branch = pointerKey(deps);
  const path = pointerPath(opts.cwd);
  const updated = setPointer(parsePointer(deps.readFile(path)), branch, name);
  deps.writeFile(path, `${JSON.stringify(updated, null, 2)}\n`);

  if (opts.json) return { output: envelope("plan.use", { branch, plan: name }), exitCode: EXIT.ok };
  return { output: `ariadnev plan — ${branch} now points at ${name}`, exitCode: EXIT.ok };
}

export function runPlanShow(opts: PlanOpts, deps: PlanDeps): PlanResult {
  const branch = pointerKey(deps);
  const name = currentPlan(parsePointer(deps.readFile(pointerPath(opts.cwd))), branch);
  if (!name) {
    const detail = `no plan selected for ${branch} — run \`ariadnev plan use <name>\``;
    if (opts.json) return { output: envelope("plan.show", { branch, plan: null }), exitCode: EXIT.failed };
    return { output: `ariadnev plan — ${detail}`, exitCode: EXIT.failed };
  }

  const summary = readPlan(deps, opts, name);
  if (!summary) {
    // The pointer outlived the directory. Say which one, because the fix is to
    // point somewhere else, not to go looking for a bug.
    const detail = `${branch} points at "${name}", which is no longer under ${opts.plansDir}/`;
    if (opts.json) return { output: envelope("plan.show", { branch, plan: name, missing: true }), exitCode: EXIT.failed };
    return { output: `ariadnev plan — ${detail}`, exitCode: EXIT.failed };
  }

  if (opts.json) return { output: envelope("plan.show", { branch, ...summary }), exitCode: EXIT.ok };

  const lines = [`ariadnev plan — ${summary.name}${summary.status ? ` (${summary.status})` : ""}`, `  branch: ${branch}`];
  if (summary.phases.length > 0) {
    const width = Math.max(...summary.phases.map((p) => (p.title ?? p.file).length));
    for (const phase of summary.phases) {
      const number = phase.phase === null ? "  ?" : String(phase.phase).padStart(3);
      lines.push(`  ${number}  ${(phase.title ?? phase.file).padEnd(width)}  ${phase.status ?? "—"}`);
    }
  } else {
    lines.push("  no phase files");
  }
  return { output: lines.join("\n"), exitCode: EXIT.ok };
}
