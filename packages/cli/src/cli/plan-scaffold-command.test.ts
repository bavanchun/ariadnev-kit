import { describe, expect, it } from "vitest";
import { EXIT, UsageError } from "./exit-codes.js";
import {
  runPlanAddPhase,
  runPlanCreate,
  runPlanKanban,
  runPlanMigrate,
  runPlanParse,
  runPlanValidate,
  type PlanDeps,
  type PlanOpts,
} from "./plan-command.js";
import { renderPhaseMd, renderPlanMd } from "../plan/plan-scaffold.js";

/** An in-memory filesystem, so these assert behaviour and not temp-dir plumbing. */
function fakeDeps(files: Record<string, string>, branch: string | null = "main") {
  const written: Record<string, string> = { ...files };
  const moved: [string, string][] = [];
  const deps: PlanDeps = {
    listDir: (path) => {
      const prefix = `${path}/`;
      const entries = new Set<string>();
      let exists = false;
      for (const key of Object.keys(written)) {
        if (!key.startsWith(prefix)) continue;
        exists = true;
        entries.add(key.slice(prefix.length).split("/")[0] as string);
      }
      return exists ? [...entries].sort() : null;
    },
    readFile: (path) => written[path] ?? null,
    writeFile: (path, content) => {
      written[path] = content;
    },
    moveDir: (from, to) => {
      moved.push([from, to]);
      for (const key of Object.keys(written)) {
        if (key === from || key.startsWith(`${from}/`)) {
          written[key.replace(from, to)] = written[key] as string;
          delete written[key];
        }
      }
    },
    branch: () => branch,
  };
  return { deps, written, moved };
}

const opts = (over: Partial<PlanOpts> = {}): PlanOpts => ({ cwd: "/repo", plansDir: "plans", ...over });

const PLAN_MD = renderPlanMd({ title: "Existing", created: "260828" });
const PHASE_1 = renderPhaseMd({ phase: 1, title: "First" });

const existing = () => ({
  "/repo/plans/260828-0900-existing/plan.md": PLAN_MD,
  "/repo/plans/260828-0900-existing/phase-01-first.md": PHASE_1,
  "/repo/.ariadnev/current-plan.json": JSON.stringify({ schemaVersion: 1, byBranch: { main: "260828-0900-existing" } }),
});

describe("plan create", () => {
  it("writes a plan.md under a stamped directory", () => {
    const world = fakeDeps({});
    const result = runPlanCreate("New Thing", opts(), world.deps, { stamp: "260829-1420" });
    expect(result.exitCode).toBe(EXIT.ok);
    expect(world.written["/repo/plans/260829-1420-new-thing/plan.md"]).toContain("# New Thing");
  });

  it("does not point the branch at it unless asked", () => {
    // Sketching a plan is not the same act as switching this branch's work to
    // it; conflating them silently redirects `plan show`.
    const world = fakeDeps({});
    runPlanCreate("Sketch", opts(), world.deps, { stamp: "260829-1420" });
    expect(world.written["/repo/.ariadnev/current-plan.json"]).toBeUndefined();
    runPlanCreate("Chosen", opts(), world.deps, { stamp: "260829-1421", use: true });
    expect(world.written["/repo/.ariadnev/current-plan.json"]).toContain("260829-1421-chosen");
  });

  it("refuses an existing directory rather than merging into it", () => {
    const world = fakeDeps({ "/repo/plans/260829-1420-taken/plan.md": PLAN_MD });
    expect(() => runPlanCreate("Taken", opts(), world.deps, { stamp: "260829-1420" })).toThrow(/already exists/);
  });

  it("writes nothing under --dry-run", () => {
    const world = fakeDeps({});
    expect(() => runPlanCreate("X", opts({ dryRun: true }), world.deps, { stamp: "260829-1420" })).toThrow(UsageError);
    expect(Object.keys(world.written)).toEqual([]);
  });

  it("refuses an empty title", () => {
    expect(() => runPlanCreate("   ", opts(), fakeDeps({}).deps, { stamp: "260829-1420" })).toThrow(/needs a title/);
  });
});

describe("plan add-phase", () => {
  it("numbers from the highest existing phase and indexes the row", () => {
    const world = fakeDeps(existing());
    const result = runPlanAddPhase(undefined, "Second Thing", opts(), world.deps);
    expect(result.exitCode).toBe(EXIT.ok);
    const file = "/repo/plans/260828-0900-existing/phase-02-second-thing.md";
    expect(world.written[file]).toContain("# Phase 2: Second Thing");
    expect(world.written["/repo/plans/260828-0900-existing/plan.md"]).toContain("phase-02-second-thing.md");
  });

  it("records the dependencies it was given", () => {
    const world = fakeDeps(existing());
    runPlanAddPhase(undefined, "Third", opts(), world.deps, { dependencies: [1, 2] });
    expect(world.written["/repo/plans/260828-0900-existing/phase-02-third.md"]).toContain("dependencies: [1, 2]");
  });

  it("still writes the phase when plan.md has no table to index it in", () => {
    // Failing the whole command over a missing table would lose the phase file
    // that was already written.
    const world = fakeDeps({
      "/repo/plans/p/plan.md": "# Bare\n\nno table\n",
      "/repo/.ariadnev/current-plan.json": JSON.stringify({ schemaVersion: 1, byBranch: { main: "p" } }),
    });
    const result = runPlanAddPhase(undefined, "Only", opts(), world.deps);
    expect(world.written["/repo/plans/p/phase-01-only.md"]).toBeTruthy();
    expect(result.output).toMatch(/no phase table/);
  });

  it("refuses when no plan is named and none is selected", () => {
    const world = fakeDeps({}, null);
    expect(() => runPlanAddPhase(undefined, "X", opts(), world.deps)).toThrow(/no plan given/);
  });
});

describe("plan kanban", () => {
  it("groups phases by status across every plan", () => {
    const world = fakeDeps({
      ...existing(),
      "/repo/plans/260828-0800-other/plan.md": PLAN_MD,
      "/repo/plans/260828-0800-other/phase-01-done.md": renderPhaseMd({ phase: 1, title: "Done", status: "completed" }),
    });
    const parsed = JSON.parse(runPlanKanban(undefined, opts({ json: true }), world.deps).output);
    const columns = Object.fromEntries(parsed.data.columns.map((c: { status: string; cards: unknown[] }) => [c.status, c.cards.length]));
    expect(columns.pending).toBe(1);
    expect(columns.completed).toBe(1);
  });

  it("keeps an unrecognised status in its own column rather than relabelling it", () => {
    // A phase whose frontmatter says `blocked` is not pending, and a board that
    // quietly folds it in is worse than one showing the odd word.
    const world = fakeDeps({
      "/repo/plans/p/plan.md": PLAN_MD,
      "/repo/plans/p/phase-01-x.md": "---\nphase: 1\nstatus: blocked\n---\n",
    });
    const parsed = JSON.parse(runPlanKanban("p", opts({ json: true }), world.deps).output);
    expect(parsed.data.columns.some((c: { status: string }) => c.status === "blocked")).toBe(true);
  });
});

describe("plan parse", () => {
  it("reports checkbox progress per phase and for the plan", () => {
    const world = fakeDeps({
      ...existing(),
      "/repo/plans/260828-0900-existing/phase-01-first.md":
        "---\nphase: 1\nstatus: in-progress\n---\n\n- [x] done\n- [ ] todo\n- [X] also done\n",
    });
    const parsed = JSON.parse(runPlanParse(undefined, opts({ json: true }), world.deps).output);
    expect(parsed.data.progress).toEqual({ checked: 2, total: 3 });
    expect(parsed.data.phases[0]).toMatchObject({ phase: 1, checked: 2, total: 3 });
  });
});

describe("plan validate", () => {
  it("passes a plan the scaffold produced", () => {
    const world = fakeDeps(existing());
    expect(runPlanValidate(undefined, opts(), world.deps).exitCode).toBe(EXIT.ok);
  });

  it("exits 1 and names each problem", () => {
    // Upstream exits 3; 3 means "the environment is not ready" here, and an
    // invalid plan is a negative answer to the question asked.
    const world = fakeDeps({
      "/repo/plans/p/plan.md": PLAN_MD,
      "/repo/plans/p/phase-01-a.md": "---\nphase: 1\nstatus: wibble\n---\n",
      "/repo/plans/p/phase-02-b.md": "no frontmatter at all\n",
    });
    const result = runPlanValidate("p", opts(), world.deps);
    expect(result.exitCode).toBe(EXIT.failed);
    expect(result.output).toMatch(/status "wibble" is not one of/);
    expect(result.output).toMatch(/no frontmatter/);
  });
});

describe("plan migrate", () => {
  const stray = () => ({
    "/repo/docs/old/260101-1200-stray/plan.md": PLAN_MD,
    "/repo/docs/old/260101-1200-stray/phase-01-a.md": PHASE_1,
  });

  it("moves a directory of plans into the plans root", () => {
    const world = fakeDeps(stray());
    const result = runPlanMigrate("docs/old", opts(), world.deps);
    expect(result.exitCode).toBe(EXIT.ok);
    expect(world.moved).toEqual([["/repo/docs/old/260101-1200-stray", "/repo/plans/260101-1200-stray"]]);
    expect(world.written["/repo/plans/260101-1200-stray/plan.md"]).toBe(PLAN_MD);
  });

  it("accepts a single plan directory as well as a folder of them", () => {
    const world = fakeDeps(stray());
    runPlanMigrate("docs/old/260101-1200-stray", opts(), world.deps);
    expect(world.moved[0]?.[1]).toBe("/repo/plans/260101-1200-stray");
  });

  it("moves nothing under --dry-run but still reports what it would", () => {
    const world = fakeDeps(stray());
    const result = runPlanMigrate("docs/old", opts({ dryRun: true }), world.deps);
    expect(world.moved).toEqual([]);
    expect(result.output).toMatch(/would import 1 plan/);
  });

  it("skips a name already taken instead of overwriting a plan", () => {
    // A collision here would destroy an existing plan, and renaming silently
    // would break the pointer that names it.
    const world = fakeDeps({ ...stray(), "/repo/plans/260101-1200-stray/plan.md": "mine\n" });
    const result = runPlanMigrate("docs/old", opts(), world.deps);
    expect(world.moved).toEqual([]);
    expect(result.exitCode).toBe(EXIT.failed);
    expect(result.output).toMatch(/already exists/);
    expect(world.written["/repo/plans/260101-1200-stray/plan.md"]).toBe("mine\n");
  });

  it("refuses a directory holding no plan at all", () => {
    const world = fakeDeps({ "/repo/docs/notes/readme.md": "x" });
    expect(() => runPlanMigrate("docs/notes", opts(), world.deps)).toThrow(/holds no plan directory/);
    expect(() => runPlanMigrate("docs/missing", opts(), world.deps)).toThrow(/no directory at/);
  });
});
