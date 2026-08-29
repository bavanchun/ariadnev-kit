// `ariadnev plan …` — the plan surface the ported skills call.
//
// Files-first: a plan is a directory of hand-written Markdown, and every command
// here reads or edits those files directly. There is no database and no index to
// keep in step — which is why `reindex` re-reads and reports rather than
// rebuilding anything, and why an edit rewrites one frontmatter line instead of
// round-tripping a file someone wrote by hand.
//
// One rule shows up repeatedly below: when a command cannot tell which plan is
// meant, it refuses. Guessing "the most recent one" edits the wrong plan sooner
// or later, and does it quietly.

import { EXIT, UnavailableError, UsageError, type ExitCode } from "./exit-codes.js";
import { jsonEnvelope } from "./json-envelope.js";
import {
  currentPlan,
  isPlanDirectory,
  parsePointer,
  setPointer,
  summarizePlan,
  type PlanSummary,
} from "../plan/plan-pointer.js";
import { buildBoard, parsePlan, renderBoard, renderParsed } from "../plan/plan-board.js";
import {
  appendPhaseRow,
  nextPhaseNumber,
  phaseFileName,
  phaseTableRow,
  planDirName,
  renderPhaseMd,
  renderPlanMd,
} from "../plan/plan-scaffold.js";
import {
  checkPlanIntegrity,
  readField,
  searchPlanFiles,
  setField,
  setPhaseRowStatus,
  type PlanStatus,
} from "../plan/plan-mutations.js";

export const PLAN_ENVELOPE_KIND = "plan";
export const PLAN_SCHEMA_VERSION = 1;

/** Directory completed plans move to, under the plans root. */
export const ARCHIVE_DIR = "archive";

export interface PlanDeps {
  /** Entries of a directory, or null when it does not exist. */
  listDir(path: string): string[] | null;
  /** File contents, or null when absent/unreadable. */
  readFile(path: string): string | null;
  writeFile(path: string, content: string): void;
  /** Move a directory. Used by archive; absent means archive is unavailable. */
  moveDir?(from: string, to: string): void;
  /** Current git branch, or null outside a repository. */
  branch(): string | null;
}

export interface PlanOpts {
  cwd: string;
  /** Plans directory, relative to cwd — `paths.plans` from the config. */
  plansDir: string;
  json?: boolean;
  dryRun?: boolean;
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
  return jsonEnvelope(PLAN_SCHEMA_VERSION, kind, data);
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

/** Every plan directory under the plans root, newest name first. */
function listPlans(deps: PlanDeps, opts: PlanOpts): string[] {
  const entries = deps.listDir(`${opts.cwd}/${opts.plansDir}`) ?? [];
  return entries
    .filter((entry) => entry !== ARCHIVE_DIR && isPlanDirectory(deps.listDir(`${opts.cwd}/${opts.plansDir}/${entry}`) ?? []))
    .sort()
    .reverse();
}

function planDir(opts: PlanOpts, name: string): string {
  return `${opts.cwd}/${opts.plansDir}/${name}`;
}

function readPlanFiles(deps: PlanDeps, opts: PlanOpts, name: string): Record<string, string> {
  const dir = planDir(opts, name);
  const files: Record<string, string> = {};
  for (const entry of deps.listDir(dir) ?? []) {
    if (!entry.endsWith(".md")) continue;
    const content = deps.readFile(`${dir}/${entry}`);
    if (content !== null) files[entry] = content;
  }
  return files;
}

/**
 * The plan a command acts on: the argument if given, else the branch's pointer.
 *
 * Refusing when neither resolves is deliberate — guessing "the most recent plan"
 * would sooner or later edit the wrong one, silently.
 */
function requirePlan(name: string | undefined, opts: PlanOpts, deps: PlanDeps): string {
  const resolved = name ?? currentPlan(parsePointer(deps.readFile(pointerPath(opts.cwd))), pointerKey(deps));
  if (!resolved) {
    throw new UsageError(`no plan given and none selected for ${pointerKey(deps)} — name one, or run \`ariadnev plan use <name>\``);
  }
  if (!readPlan(deps, opts, resolved)) {
    throw new UsageError(`no plan named "${resolved}" under ${opts.plansDir}/`);
  }
  return resolved;
}

export function runPlanList(opts: PlanOpts, deps: PlanDeps): PlanResult {
  const current = currentPlan(parsePointer(deps.readFile(pointerPath(opts.cwd))), pointerKey(deps));
  const plans = listPlans(deps, opts).map((name) => {
    const summary = readPlan(deps, opts, name);
    const phases = summary?.phases ?? [];
    return {
      name,
      status: summary?.status ?? null,
      phases: phases.length,
      completed: phases.filter((phase) => phase.status === "completed").length,
      current: name === current,
    };
  });
  if (opts.json) return { output: envelope("plan.list", { plans }), exitCode: EXIT.ok };
  if (plans.length === 0) return { output: `ariadnev plan — no plans under ${opts.plansDir}/`, exitCode: EXIT.ok };
  const width = Math.max(...plans.map((plan) => plan.name.length));
  const lines = ["ariadnev plan list"];
  for (const plan of plans) {
    lines.push(
      `  ${plan.current ? "*" : " "} ${plan.name.padEnd(width)}  ${(plan.status ?? "—").padEnd(12)}  ${plan.completed}/${plan.phases} phases`,
    );
  }
  return { output: lines.join("\n"), exitCode: EXIT.ok };
}

/**
 * Which plan this branch is working from, and where it lives.
 *
 * Named `resolve` because that is what the skills call; it answers with a path
 * so a caller can read the files directly rather than parsing this output.
 */
export function runPlanResolve(opts: PlanOpts, deps: PlanDeps): PlanResult {
  const branch = pointerKey(deps);
  const name = currentPlan(parsePointer(deps.readFile(pointerPath(opts.cwd))), branch);
  if (!name) {
    if (opts.json) return { output: envelope("plan.resolve", { branch, plan: null }), exitCode: EXIT.failed };
    return { output: `ariadnev plan — nothing selected for ${branch}`, exitCode: EXIT.failed };
  }
  const summary = readPlan(deps, opts, name);
  const data = { branch, plan: name, dir: planDir(opts, name), index: `${planDir(opts, name)}/plan.md`, found: summary !== null };
  if (opts.json) return { output: envelope("plan.resolve", data), exitCode: summary ? EXIT.ok : EXIT.failed };
  if (!summary) return { output: `ariadnev plan — ${branch} points at "${name}", which is not there`, exitCode: EXIT.failed };
  return { output: data.dir, exitCode: EXIT.ok };
}

export interface PhaseUpdate {
  phase: number;
  status: PlanStatus;
}

/**
 * Set a phase's status, in the phase file and in the index's table.
 *
 * Both, because they are read by different people: the file is the record and
 * the table is what anyone opening the plan actually looks at. Updating one and
 * not the other is how a plan starts lying about itself.
 */
export function runPlanUpdate(name: string | undefined, update: PhaseUpdate, opts: PlanOpts, deps: PlanDeps): PlanResult {
  const plan = requirePlan(name, opts, deps);
  const files = readPlanFiles(deps, opts, plan);
  const target = Object.entries(files).find(
    ([file, content]) => /^phase-\d+.*\.md$/.test(file) && Number(readField(content, "phase")) === update.phase,
  );
  if (!target) throw new UsageError(`plan "${plan}" has no phase ${update.phase}`);

  const [file, content] = target;
  deps.writeFile(`${planDir(opts, plan)}/${file}`, setField(content, "status", update.status));

  let indexUpdated = false;
  const index = files["plan.md"];
  if (index) {
    const rewritten = setPhaseRowStatus(index, update.phase, update.status);
    if (rewritten !== index) {
      deps.writeFile(`${planDir(opts, plan)}/plan.md`, rewritten);
      indexUpdated = true;
    }
  }

  const data = { plan, phase: update.phase, status: update.status, file, indexUpdated };
  if (opts.json) return { output: envelope("plan.update", data), exitCode: EXIT.ok };
  const note = indexUpdated ? " (index table updated too)" : " (no row for it in the index table)";
  return { output: `ariadnev plan — ${plan} phase ${update.phase} is now ${update.status}${note}`, exitCode: EXIT.ok };
}

/** Set the plan's own status. `close` is this with `completed`. */
export function runPlanStatus(name: string | undefined, status: PlanStatus | null, opts: PlanOpts, deps: PlanDeps): PlanResult {
  const plan = requirePlan(name, opts, deps);
  const path = `${planDir(opts, plan)}/plan.md`;
  const index = deps.readFile(path);
  if (index === null) throw new UsageError(`plan "${plan}" has no plan.md to read`);

  if (status === null) {
    const current = readField(index, "status");
    if (opts.json) return { output: envelope("plan.status", { plan, status: current }), exitCode: EXIT.ok };
    return { output: `ariadnev plan — ${plan} is ${current ?? "(no status declared)"}`, exitCode: EXIT.ok };
  }

  deps.writeFile(path, setField(index, "status", status));
  if (opts.json) return { output: envelope("plan.status", { plan, status }), exitCode: EXIT.ok };
  return { output: `ariadnev plan — ${plan} is now ${status}`, exitCode: EXIT.ok };
}

/** Mark one phase completed (`check`) or back to pending (`uncheck`). */
export function runPlanCheck(name: string | undefined, phase: number, checked: boolean, opts: PlanOpts, deps: PlanDeps): PlanResult {
  return runPlanUpdate(name, { phase, status: checked ? "completed" : "pending" }, opts, deps);
}

/** One phase, in full. */
export function runPlanPhase(name: string | undefined, phase: number, opts: PlanOpts, deps: PlanDeps): PlanResult {
  const plan = requirePlan(name, opts, deps);
  const files = readPlanFiles(deps, opts, plan);
  const target = Object.entries(files).find(
    ([file, content]) => /^phase-\d+.*\.md$/.test(file) && Number(readField(content, "phase")) === phase,
  );
  if (!target) throw new UsageError(`plan "${plan}" has no phase ${phase}`);
  if (opts.json) return { output: envelope("plan.phase", { plan, phase, file: target[0], content: target[1] }), exitCode: EXIT.ok };
  return { output: target[1], exitCode: EXIT.ok };
}

export function runPlanSearch(query: string, opts: PlanOpts, deps: PlanDeps): PlanResult {
  if (query.trim().length === 0) throw new UsageError("search needs something to look for");
  const hits: { plan: string; file: string; line: number; text: string }[] = [];
  for (const plan of listPlans(deps, opts)) {
    for (const hit of searchPlanFiles(readPlanFiles(deps, opts, plan), query)) hits.push({ plan, ...hit });
  }
  if (opts.json) return { output: envelope("plan.search", { query, hits }), exitCode: hits.length > 0 ? EXIT.ok : EXIT.failed };
  if (hits.length === 0) return { output: `ariadnev plan — no match for "${query}"`, exitCode: EXIT.failed };
  const lines = [`ariadnev plan search — ${hits.length} match(es) for "${query}"`];
  for (const hit of hits.slice(0, 100)) lines.push(`  ${hit.plan}/${hit.file}:${hit.line}  ${hit.text.slice(0, 100)}`);
  if (hits.length > 100) lines.push(`  … ${hits.length - 100} more`);
  return { output: lines.join("\n"), exitCode: EXIT.ok };
}

/**
 * Re-read every plan and report what is wrong.
 *
 * There is no index to rebuild — the files are the record — so this is what
 * "reindex" honestly amounts to here. Saying that is better than a command that
 * prints "rebuilt" and did nothing.
 */
export function runPlanReindex(opts: PlanOpts, deps: PlanDeps): PlanResult {
  const results = listPlans(deps, opts).map((plan) => ({
    plan,
    findings: checkPlanIntegrity(readPlanFiles(deps, opts, plan)),
  }));
  const broken = results.filter((result) => result.findings.length > 0);
  if (opts.json) return { output: envelope("plan.reindex", { plans: results.length, results }), exitCode: broken.length > 0 ? EXIT.failed : EXIT.ok };

  const lines = [`ariadnev plan reindex — re-read ${results.length} plan(s); there is no index to rebuild, the files are the record`];
  for (const result of broken) {
    for (const finding of result.findings) lines.push(`  ${result.plan}/${finding.file}: ${finding.problem}`);
  }
  lines.push(broken.length === 0 ? "  nothing wrong" : `  ${broken.length} plan(s) need attention`);
  return { output: lines.join("\n"), exitCode: broken.length > 0 ? EXIT.failed : EXIT.ok };
}

/** Move a plan under the archive dir. Refuses while it is still open. */
export function runPlanArchive(name: string | undefined, opts: PlanOpts, deps: PlanDeps, force = false): PlanResult {
  const plan = requirePlan(name, opts, deps);
  if (!deps.moveDir) throw new UnavailableError("archiving needs a filesystem this caller did not provide");

  const status = readField(deps.readFile(`${planDir(opts, plan)}/plan.md`) ?? "", "status");
  if (!force && status !== "completed" && status !== "cancelled") {
    // Archiving hides a plan from `list`. Doing that to work in progress is how
    // a plan is lost rather than finished.
    throw new UsageError(`plan "${plan}" is ${status ?? "unstatused"} — close it first, or pass --force`);
  }
  const to = `${opts.cwd}/${opts.plansDir}/${ARCHIVE_DIR}/${plan}`;
  if (!opts.dryRun) deps.moveDir(planDir(opts, plan), to);
  if (opts.json) return { output: envelope("plan.archive", { plan, to, dryRun: !!opts.dryRun }), exitCode: EXIT.ok };
  return { output: `ariadnev plan — ${opts.dryRun ? "would archive" : "archived"} ${plan} to ${opts.plansDir}/${ARCHIVE_DIR}/`, exitCode: EXIT.ok };
}

/** Every finished plan still sitting in the plans root. */
export function runPlanCleanup(opts: PlanOpts, deps: PlanDeps, archive = false): PlanResult {
  const finished = listPlans(deps, opts).filter((plan) => {
    const status = readField(deps.readFile(`${planDir(opts, plan)}/plan.md`) ?? "", "status");
    return status === "completed" || status === "cancelled";
  });
  if (archive) {
    for (const plan of finished) runPlanArchive(plan, opts, deps);
  }
  if (opts.json) return { output: envelope("plan.cleanup", { finished, archived: archive }), exitCode: EXIT.ok };
  if (finished.length === 0) return { output: "ariadnev plan cleanup — nothing finished is still in the way", exitCode: EXIT.ok };
  const lines = [
    archive
      ? `ariadnev plan cleanup — archived ${finished.length} finished plan(s)`
      : `ariadnev plan cleanup — ${finished.length} finished plan(s) could be archived (pass --archive to move them)`,
  ];
  for (const plan of finished) lines.push(`  ${plan}`);
  return { output: lines.join("\n"), exitCode: EXIT.ok };
}

// ─────────────────────────────────────────────────────────────────────────────
// Scaffolding and projections.
//
// The six verbs upstream has that this did not. Each one is built on the same
// `PlanDeps` as everything above, so `--dry-run` and the injected filesystem
// work for them without a second story about where plans live.
// ─────────────────────────────────────────────────────────────────────────────

/** `plan create` and `add-phase` write; nothing else in this section does. */
function refuseInDryRun(opts: PlanOpts, what: string): void {
  if (opts.dryRun) throw new UsageError(`--dry-run: ${what} would write files, so it did nothing`);
}

/**
 * Bootstrap a plan directory.
 *
 * The timestamp comes from the caller so a test is not a clock, and the
 * directory name follows the convention every plan in this repository already
 * uses: `<YYMMDD-HHMM>-<slug>`.
 */
export function runPlanCreate(
  title: string,
  opts: PlanOpts,
  deps: PlanDeps,
  extras: { stamp: string; description?: string; priority?: string; use?: boolean } = { stamp: "" },
): PlanResult {
  if (!title.trim()) throw new UsageError("plan create needs a title");
  const name = planDirName(extras.stamp, title);
  const dir = planDir(opts, name);
  // Refusing an existing directory rather than merging into it: two plans under
  // one name is a state neither `use` nor `resolve` can describe.
  if (deps.listDir(dir) !== null) throw new UsageError(`${opts.plansDir}/${name} already exists`);
  refuseInDryRun(opts, "plan create");

  deps.writeFile(`${dir}/plan.md`, renderPlanMd({
    title,
    created: extras.stamp.slice(0, 6),
    ...(extras.description ? { description: extras.description } : {}),
    ...(extras.priority ? { priority: extras.priority } : {}),
  }));

  // Pointed at only when asked. Creating a plan is not the same act as
  // switching this branch's work to it, and conflating them means a `create`
  // run to sketch an idea silently redirects `plan show`.
  if (extras.use) runPlanUse(name, opts, deps);

  if (opts.json) return { output: envelope("plan.create", { plan: name, dir, selected: !!extras.use }), exitCode: EXIT.ok };
  return {
    output: [`ariadnev plan — created ${opts.plansDir}/${name}`, extras.use ? `  and pointed ${pointerKey(deps)} at it` : ""]
      .filter(Boolean)
      .join("\n"),
    exitCode: EXIT.ok,
  };
}

/** Append `phase-NN-<slug>.md` and a row in the plan's phase table. */
export function runPlanAddPhase(
  name: string | undefined,
  title: string,
  opts: PlanOpts,
  deps: PlanDeps,
  extras: { dependencies?: readonly number[] } = {},
): PlanResult {
  if (!title.trim()) throw new UsageError("plan add-phase needs a title");
  const plan = requirePlan(name, opts, deps);
  const dir = planDir(opts, plan);
  const phase = nextPhaseNumber(deps.listDir(dir) ?? []);
  const file = phaseFileName(phase, title);
  refuseInDryRun(opts, "plan add-phase");

  deps.writeFile(`${dir}/${file}`, renderPhaseMd({ phase, title, ...(extras.dependencies ? { dependencies: extras.dependencies } : {}) }));

  // The index row is best-effort: a plan.md with no phase table is unusual but
  // not broken, and failing the whole command over a missing table would lose
  // the phase file that was already written.
  const planMd = deps.readFile(`${dir}/plan.md`);
  const updated = planMd === null ? null : appendPhaseRow(planMd, phaseTableRow(phase, title, file));
  if (updated !== null) deps.writeFile(`${dir}/plan.md`, updated);

  if (opts.json) return { output: envelope("plan.add-phase", { plan, phase, file, indexed: updated !== null }), exitCode: EXIT.ok };
  return {
    output: [`ariadnev plan — added ${plan}/${file}`, updated === null ? "  plan.md has no phase table, so no row was added" : ""]
      .filter(Boolean)
      .join("\n"),
    exitCode: EXIT.ok,
  };
}

/** Phases as a board, for one plan or for every plan. */
export function runPlanKanban(name: string | undefined, opts: PlanOpts, deps: PlanDeps): PlanResult {
  const names = name ? [requirePlan(name, opts, deps)] : listPlans(deps, opts);
  const summaries = names.map((plan) => readPlan(deps, opts, plan)).filter((summary): summary is PlanSummary => summary !== null);
  const columns = buildBoard(summaries);
  if (opts.json) return { output: envelope("plan.kanban", { columns }), exitCode: EXIT.ok };
  return { output: renderBoard(columns), exitCode: EXIT.ok };
}

/** One plan as structured data, checkbox progress included. */
export function runPlanParse(name: string | undefined, opts: PlanOpts, deps: PlanDeps): PlanResult {
  const plan = requirePlan(name, opts, deps);
  const summary = readPlan(deps, opts, plan) as PlanSummary;
  const parsed = parsePlan(summary, readPlanFiles(deps, opts, plan));
  if (opts.json) return { output: envelope("plan.parse", parsed), exitCode: EXIT.ok };
  return { output: renderParsed(parsed), exitCode: EXIT.ok };
}

/**
 * Check one plan's shape.
 *
 * The same `checkPlanIntegrity` that `reindex` runs over every plan, aimed at
 * one — which is the difference between the two verbs and the reason both
 * exist. Upstream exits 3 for an invalid plan; this exits 1, because
 * `exit-codes.ts` gives 3 the meaning "the environment is not ready" and an
 * invalid plan is a negative answer to the question that was asked.
 */
export function runPlanValidate(name: string | undefined, opts: PlanOpts, deps: PlanDeps): PlanResult {
  const plan = requirePlan(name, opts, deps);
  const findings = checkPlanIntegrity(readPlanFiles(deps, opts, plan));
  const ok = findings.length === 0;
  if (opts.json) return { output: envelope("plan.validate", { plan, valid: ok, findings }), exitCode: ok ? EXIT.ok : EXIT.failed };
  if (ok) return { output: `ariadnev plan — ${plan} is valid`, exitCode: EXIT.ok };
  return {
    output: [`ariadnev plan — ${plan} has ${findings.length} problem(s)`, ...findings.map((f) => `  ${f.file}: ${f.problem}`)].join("\n"),
    exitCode: EXIT.failed,
  };
}

/**
 * Move plan directories that live outside the configured plans root into it.
 *
 * UPSTREAM'S VERSION IMPORTS INTO A PLAN STORE; THERE IS NO STORE HERE. The
 * files are the record — `reindex` says so out loud — so the only thing left to
 * import is *location*: a plan directory sitting in some other folder, which
 * `list`, `use` and `resolve` will never find because they only look under the
 * configured root.
 *
 * Sources are named by the caller rather than discovered. A command that walks
 * a repository looking for anything containing a `plan.md` and then moves it is
 * one bad guess away from relocating someone's unrelated directory.
 */
export function runPlanMigrate(from: string, opts: PlanOpts, deps: PlanDeps): PlanResult {
  const source = from.startsWith("/") ? from : `${opts.cwd}/${from}`;
  const entries = deps.listDir(source);
  if (entries === null) throw new UsageError(`no directory at ${from}`);

  const candidates = isPlanDirectory(entries)
    ? [{ name: source.split("/").filter(Boolean).at(-1) as string, dir: source }]
    : entries
        .filter((entry) => isPlanDirectory(deps.listDir(`${source}/${entry}`) ?? []))
        .map((entry) => ({ name: entry, dir: `${source}/${entry}` }));

  if (candidates.length === 0) throw new UsageError(`${from} holds no plan directory (a plan directory contains plan.md)`);
  if (!deps.moveDir) throw new UnavailableError("importing plans needs a filesystem this caller did not provide");

  const planned = candidates.map((candidate) => ({
    ...candidate,
    to: planDir(opts, candidate.name),
    // Reported rather than overwritten. A collision here would destroy an
    // existing plan, and renaming it silently would break the pointer that
    // names it.
    conflict: deps.listDir(planDir(opts, candidate.name)) !== null,
  }));
  const movable = planned.filter((entry) => !entry.conflict);

  if (!opts.dryRun) {
    for (const entry of movable) deps.moveDir(entry.dir, entry.to);
  }

  if (opts.json) {
    return {
      output: envelope("plan.migrate", { dryRun: !!opts.dryRun, imported: movable.map((e) => e.name), skipped: planned.filter((e) => e.conflict).map((e) => e.name) }),
      exitCode: planned.some((entry) => entry.conflict) ? EXIT.failed : EXIT.ok,
    };
  }
  const lines = [`ariadnev plan migrate — ${opts.dryRun ? "would import" : "imported"} ${movable.length} plan(s) into ${opts.plansDir}/`];
  for (const entry of planned) {
    lines.push(entry.conflict ? `  ${entry.name}: skipped, ${opts.plansDir}/${entry.name} already exists` : `  ${entry.name}`);
  }
  return { output: lines.join("\n"), exitCode: planned.some((entry) => entry.conflict) ? EXIT.failed : EXIT.ok };
}
