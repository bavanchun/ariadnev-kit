import { describe, it, expect } from "vitest";
import {
  pointerPath,
  runPlanArchive,
  runPlanCheck,
  runPlanCleanup,
  runPlanList,
  runPlanReindex,
  runPlanResolve,
  runPlanSearch,
  runPlanShow,
  runPlanStatus,
  runPlanUpdate,
  runPlanUse,
  type PlanDeps,
} from "./plan-command.js";
import { UsageError } from "./exit-codes.js";

const CWD = "/repo";
const OPTS = { cwd: CWD, plansDir: "plans" };

function deps(files: Record<string, string>, dirs: Record<string, string[]>, branch: string | null = "main"): PlanDeps {
  return {
    listDir: (path) => dirs[path] ?? null,
    readFile: (path) => files[path] ?? null,
    writeFile: (path, content) => {
      files[path] = content;
    },
    branch: () => branch,
  };
}

const PLAN_FILES: Record<string, string> = {
  "/repo/plans/260814-port/plan.md": "---\nstatus: pending\n---\n\n# Port\n",
  "/repo/plans/260814-port/phase-02-second.md": '---\nphase: 2\ntitle: "Second"\nstatus: completed\n---\n',
  "/repo/plans/260814-port/phase-01-first.md": '---\nphase: 1\ntitle: "First"\nstatus: pending\n---\n',
};
const PLAN_DIRS = { "/repo/plans/260814-port": ["plan.md", "phase-01-first.md", "phase-02-second.md"] };

describe("ariadnev plan use", () => {
  it("records the plan for the current branch", () => {
    const files = { ...PLAN_FILES };
    const result = runPlanUse("260814-port", OPTS, deps(files, PLAN_DIRS));
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(files[pointerPath(CWD)]).byBranch).toEqual({ main: "260814-port" });
  });

  it("refuses a name that is not a plan, instead of pointing at nothing", () => {
    // A pointer to a missing plan surfaces as an empty `show` much later, far
    // from the mistake that caused it.
    expect(() => runPlanUse("nope", OPTS, deps({ ...PLAN_FILES }, PLAN_DIRS))).toThrow(UsageError);
    const dirs = { "/repo/plans/notes": ["README.md"] };
    expect(() => runPlanUse("notes", OPTS, deps({}, dirs))).toThrow(/plan\.md/);
  });

  it("keeps one pointer per branch", () => {
    const files = { ...PLAN_FILES };
    runPlanUse("260814-port", OPTS, deps(files, PLAN_DIRS, "main"));
    runPlanUse("260814-port", OPTS, deps(files, PLAN_DIRS, "feat/x"));
    expect(Object.keys(JSON.parse(files[pointerPath(CWD)]).byBranch).sort()).toEqual(["feat/x", "main"]);
  });

  it("still works outside a git repository", () => {
    const files = { ...PLAN_FILES };
    const result = runPlanUse("260814-port", OPTS, deps(files, PLAN_DIRS, null));
    expect(result.exitCode).toBe(0);
    expect(Object.keys(JSON.parse(files[pointerPath(CWD)]).byBranch)).toEqual(["(no branch)"]);
  });
});

describe("ariadnev plan show", () => {
  it("lists phases in declared order with their status", () => {
    const files = { ...PLAN_FILES };
    runPlanUse("260814-port", OPTS, deps(files, PLAN_DIRS));
    const { output, exitCode } = runPlanShow(OPTS, deps(files, PLAN_DIRS));
    expect(exitCode).toBe(0);
    expect(output).toContain("260814-port");
    expect(output.indexOf("First")).toBeLessThan(output.indexOf("Second"));
    expect(output).toContain("completed");
  });

  it("emits the machine envelope", () => {
    const files = { ...PLAN_FILES };
    runPlanUse("260814-port", OPTS, deps(files, PLAN_DIRS));
    const parsed = JSON.parse(runPlanShow({ ...OPTS, json: true }, deps(files, PLAN_DIRS)).output);
    expect(parsed.schema_version).toBe(1);
    expect(parsed.kind).toBe("plan.show");
    expect(parsed.data.phases.map((p: { phase: number }) => p.phase)).toEqual([1, 2]);
  });

  it("says nothing is selected rather than guessing", () => {
    const { output, exitCode } = runPlanShow(OPTS, deps({}, PLAN_DIRS));
    expect(exitCode).toBe(1);
    expect(output).toContain("plan use");
  });

  it("reports a pointer that outlived its directory, naming the plan", () => {
    const files = { ...PLAN_FILES };
    runPlanUse("260814-port", OPTS, deps(files, PLAN_DIRS));
    const { output, exitCode } = runPlanShow(OPTS, deps(files, {}));
    expect(exitCode).toBe(1);
    expect(output).toContain("260814-port");
    expect(output).toMatch(/no longer/);
  });
});

describe("the wider plan surface", () => {
  const INDEX = `---
status: pending
---

# Port

| # | Phase | Effort | Status |
|---|---|---|---|
| 1 | First | 2d | pending |
| 2 | Second | 3d | pending |
`;
  const PHASE1 = '---\nphase: 1\ntitle: "First"\nstatus: pending\n---\n\n# Phase 1\n';
  const PHASE2 = '---\nphase: 2\ntitle: "Second"\nstatus: pending\n---\n\n# Phase 2\n';

  function tree(): { files: Record<string, string>; dirs: Record<string, string[]> } {
    return {
      files: {
        "/repo/plans/260814-port/plan.md": INDEX,
        "/repo/plans/260814-port/phase-01-first.md": PHASE1,
        "/repo/plans/260814-port/phase-02-second.md": PHASE2,
        "/repo/plans/250101-old/plan.md": "---\nstatus: completed\n---\n\n# Old\n",
      },
      dirs: {
        "/repo/plans": ["260814-port", "250101-old", "archive"],
        "/repo/plans/260814-port": ["plan.md", "phase-01-first.md", "phase-02-second.md"],
        "/repo/plans/250101-old": ["plan.md"],
        "/repo/plans/archive": [],
      },
    };
  }

  it("update writes the phase file and the index table together", () => {
    // Two readers, one truth: the file is the record, the table is what anyone
    // opening the plan actually looks at.
    const { files, dirs } = tree();
    const d = deps(files, dirs);
    const { output } = runPlanUpdate("260814-port", { phase: 2, status: "completed" }, OPTS, d);
    expect(output).toContain("index table updated");
    expect(files["/repo/plans/260814-port/phase-02-second.md"]).toContain("status: completed");
    expect(files["/repo/plans/260814-port/plan.md"]).toContain("| 2 | Second | 3d | **completed** |");
    expect(files["/repo/plans/260814-port/plan.md"]).toContain("| 1 | First | 2d | pending |");
  });

  it("refuses a phase that does not exist rather than writing nothing quietly", () => {
    const { files, dirs } = tree();
    expect(() => runPlanUpdate("260814-port", { phase: 9, status: "completed" }, OPTS, deps(files, dirs))).toThrow(/no phase 9/);
  });

  it("falls back to the branch's plan when none is named", () => {
    const { files, dirs } = tree();
    const d = deps(files, dirs);
    runPlanUse("260814-port", OPTS, d);
    runPlanCheck(undefined, 1, true, OPTS, d);
    expect(files["/repo/plans/260814-port/phase-01-first.md"]).toContain("status: completed");
  });

  it("refuses when it cannot tell which plan is meant", () => {
    // Guessing "the most recent" edits the wrong plan eventually, and quietly.
    const { files, dirs } = tree();
    expect(() => runPlanStatus(undefined, "completed", OPTS, deps(files, dirs))).toThrow(/name one/);
  });

  it("close sets the plan's own status", () => {
    const { files, dirs } = tree();
    const d = deps(files, dirs);
    runPlanStatus("260814-port", "completed", OPTS, d);
    expect(files["/repo/plans/260814-port/plan.md"]).toContain("status: completed");
    expect(runPlanStatus("260814-port", null, OPTS, d).output).toContain("completed");
  });

  it("list marks the current plan and counts finished phases", () => {
    const { files, dirs } = tree();
    const d = deps(files, dirs);
    runPlanUse("260814-port", OPTS, d);
    runPlanUpdate("260814-port", { phase: 1, status: "completed" }, OPTS, d);
    const parsed = JSON.parse(runPlanList({ ...OPTS, json: true }, d).output);
    const port = parsed.data.plans.find((p: { name: string }) => p.name === "260814-port");
    expect(port).toMatchObject({ current: true, phases: 2, completed: 1 });
    expect(parsed.data.plans.some((p: { name: string }) => p.name === "archive")).toBe(false);
  });

  it("resolve prints a path a caller can read files from", () => {
    const { files, dirs } = tree();
    const d = deps(files, dirs);
    runPlanUse("260814-port", OPTS, d);
    expect(runPlanResolve(OPTS, d).output).toBe("/repo/plans/260814-port");
    expect(runPlanResolve(OPTS, deps({}, dirs)).exitCode).toBe(1);
  });

  it("search reports plan, file and line", () => {
    const { files, dirs } = tree();
    const { output, exitCode } = runPlanSearch("second", OPTS, deps(files, dirs));
    expect(exitCode).toBe(0);
    expect(output).toContain("260814-port/phase-02-second.md:");
    expect(runPlanSearch("nothing-here", OPTS, deps(files, dirs)).exitCode).toBe(1);
  });

  it("reindex says there is no index, and reports what is actually broken", () => {
    const { files, dirs } = tree();
    expect(runPlanReindex(OPTS, deps(files, dirs)).output).toContain("no index to rebuild");

    files["/repo/plans/260814-port/phase-02-second.md"] = '---\nphase: 2\nstatus: done\n---\n';
    const broken = runPlanReindex(OPTS, deps(files, dirs));
    expect(broken.exitCode).toBe(1);
    expect(broken.output).toContain('status "done" is not one of');
  });

  it("archive refuses to hide work in progress", () => {
    const { files, dirs } = tree();
    const moved: string[] = [];
    const d = { ...deps(files, dirs), moveDir: (from: string, to: string) => moved.push(`${from} → ${to}`) };
    expect(() => runPlanArchive("260814-port", OPTS, d)).toThrow(/close it first/);
    expect(moved).toEqual([]);

    runPlanArchive("250101-old", OPTS, d);
    expect(moved[0]).toContain("/repo/plans/archive/250101-old");
  });

  it("cleanup lists finished plans and only moves them when asked", () => {
    const { files, dirs } = tree();
    const moved: string[] = [];
    const d = { ...deps(files, dirs), moveDir: (_from: string, to: string) => moved.push(to) };
    const listed = runPlanCleanup(OPTS, d);
    expect(listed.output).toContain("250101-old");
    expect(moved).toEqual([]);
    runPlanCleanup(OPTS, d, true);
    expect(moved).toHaveLength(1);
  });
});
