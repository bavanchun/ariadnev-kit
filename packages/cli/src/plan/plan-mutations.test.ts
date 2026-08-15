import { describe, it, expect } from "vitest";
import {
  PlanEditError,
  assertStatus,
  checkPlanIntegrity,
  readField,
  searchPlanFiles,
  setField,
  setPhaseRowStatus,
} from "./plan-mutations.js";

const PHASE = `---
phase: 3
title: "Kit schema"
status: pending
priority: P2
---

# Phase 3: Kit schema

Body text that must survive untouched.
`;

describe("frontmatter editing", () => {
  it("changes one line and leaves every other byte alone", () => {
    // A plan file is hand-written and reviewed as a diff. Parsing and
    // re-serializing would reformat someone's writing and make the diff
    // unreadable, which is most of what the file is for.
    const updated = setField(PHASE, "status", "completed");
    expect(updated).toBe(PHASE.replace("status: pending", "status: completed"));
    expect(updated).toContain('title: "Kit schema"');
    expect(updated).toContain("Body text that must survive untouched.");
  });

  it("adds a field that is not there yet", () => {
    const updated = setField(PHASE, "effort", "2d");
    expect(readField(updated, "effort")).toBe("2d");
    expect(readField(updated, "status")).toBe("pending");
  });

  it("reads a quoted value without its quotes", () => {
    expect(readField(PHASE, "title")).toBe("Kit schema");
    expect(readField(PHASE, "nope")).toBeNull();
    expect(readField("no frontmatter here\n", "status")).toBeNull();
  });

  it("refuses to edit a file with no frontmatter rather than inventing one", () => {
    expect(() => setField("# Just a heading\n", "status", "completed")).toThrow(PlanEditError);
  });

  it("does not touch a body line that looks like a field", () => {
    const tricky = `---\nstatus: pending\n---\n\nstatus: pending is written here too.\n`;
    const updated = setField(tricky, "status", "completed");
    expect(updated).toContain("status: pending is written here too.");
    expect(readField(updated, "status")).toBe("completed");
  });

  it("rejects a status outside the vocabulary", () => {
    expect(() => assertStatus("done")).toThrow(/pending, in-progress, completed, cancelled/);
    expect(assertStatus("completed")).toBe("completed");
  });
});

describe("the phases table in the index", () => {
  const index = `# Plan

| # | Phase | Effort | Trạng thái |
|---|---|---|---|
| 1 | First | 2d | **completed** |
| 2 | Second | 3d | pending |
`;

  it("updates the row for one phase and no other", () => {
    // An index that disagrees with the phase files is worse than no index: it is
    // the thing a reader actually looks at.
    const updated = setPhaseRowStatus(index, 2, "completed");
    expect(updated).toContain("| 2 | Second | 3d | **completed** |");
    expect(updated).toContain("| 1 | First | 2d | **completed** |");
  });

  it("keeps the row's own emphasis rather than imposing one", () => {
    const plainRow = "| # | P |\n|---|---|\n| 4 | x | pending |\n";
    expect(setPhaseRowStatus(plainRow, 4, "pending")).toContain("| 4 | x | pending |");
  });

  it("leaves the file alone when the table has no row for that phase", () => {
    // The phase file is the record; the table is a view of it.
    expect(setPhaseRowStatus(index, 9, "completed")).toBe(index);
    expect(setPhaseRowStatus("# no table\n", 1, "completed")).toBe("# no table\n");
  });
});

describe("search", () => {
  it("finds matches case-insensitively, with file and line", () => {
    const hits = searchPlanFiles(
      { "plan.md": "Outcome\nBinary safety matters\n", "phase-01.md": "binary path\n" },
      "BINARY",
    );
    expect(hits).toEqual([
      { file: "phase-01.md", line: 1, text: "binary path" },
      { file: "plan.md", line: 2, text: "Binary safety matters" },
    ]);
  });

  it("returns nothing rather than everything for a miss", () => {
    expect(searchPlanFiles({ "plan.md": "a\n" }, "zzz")).toEqual([]);
  });
});

describe("integrity", () => {
  it("passes a well-formed plan", () => {
    expect(checkPlanIntegrity({ "plan.md": "---\nstatus: pending\n---\n", "phase-01-a.md": PHASE })).toEqual([]);
  });

  it("reports a missing index, a bad status, and a duplicated phase number", () => {
    const findings = checkPlanIntegrity({
      "phase-01-a.md": "---\nphase: 1\nstatus: done\n---\n",
      "phase-01-b.md": "---\nphase: 1\nstatus: pending\n---\n",
      "phase-02-c.md": "# no frontmatter\n",
    });
    const problems = findings.map((f) => `${f.file}: ${f.problem}`);
    expect(problems.some((p) => p.startsWith("plan.md: missing"))).toBe(true);
    expect(problems.some((p) => p.includes('status "done" is not one of'))).toBe(true);
    expect(problems.some((p) => p.includes("also declared by"))).toBe(true);
    expect(problems.some((p) => p.includes("no frontmatter"))).toBe(true);
  });
});
