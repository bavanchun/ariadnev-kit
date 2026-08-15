import { describe, it, expect } from "vitest";
import { runPlanShow, runPlanUse, pointerPath, type PlanDeps } from "./plan-command.js";
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
