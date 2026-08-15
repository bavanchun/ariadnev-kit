import { describe, it, expect } from "vitest";
import {
  currentPlan,
  emptyPointer,
  isPlanDirectory,
  parsePointer,
  setPointer,
  summarizePlan,
  POINTER_SCHEMA_VERSION,
} from "./plan-pointer.js";

describe("plan pointer", () => {
  it("keeps one plan per branch", () => {
    // Switching branches must not silently point a skill at the plan for other
    // work — that is worse than having no pointer, because it looks right.
    let file = emptyPointer();
    file = setPointer(file, "feat/auth", "260101-auth");
    file = setPointer(file, "fix/login", "260102-login");
    expect(currentPlan(file, "feat/auth")).toBe("260101-auth");
    expect(currentPlan(file, "fix/login")).toBe("260102-login");
    expect(currentPlan(file, "main")).toBeNull();
  });

  it("replaces rather than accumulates for the same branch", () => {
    const file = setPointer(setPointer(emptyPointer(), "main", "old"), "main", "new");
    expect(file.byBranch).toEqual({ main: "new" });
  });

  it("treats an unreadable or foreign pointer file as no pointer", () => {
    expect(parsePointer(null)).toEqual(emptyPointer());
    expect(parsePointer("{ not json")).toEqual(emptyPointer());
    expect(parsePointer(JSON.stringify({ schemaVersion: 99, byBranch: { main: "x" } }))).toEqual(emptyPointer());
    expect(parsePointer(JSON.stringify({ schemaVersion: POINTER_SCHEMA_VERSION }))).toEqual(emptyPointer());
  });

  it("drops entries that are not branch/plan strings", () => {
    const raw = JSON.stringify({ schemaVersion: POINTER_SCHEMA_VERSION, byBranch: { main: "ok", other: 42 } });
    expect(parsePointer(raw).byBranch).toEqual({ main: "ok" });
  });

  it("round-trips through JSON", () => {
    const file = setPointer(emptyPointer(), "main", "260814-port");
    expect(parsePointer(JSON.stringify(file))).toEqual(file);
  });
});

describe("plan summary", () => {
  const phase = (n: number, status: string) =>
    `---\nphase: ${n}\ntitle: "Phase ${n} work"\nstatus: ${status}\n---\n\n# Phase ${n}\n`;

  it("orders phases by their declared number, not by filename", () => {
    const summary = summarizePlan("260814-port", {
      "plan.md": "---\nstatus: pending\n---\n\n# Plan\n",
      "phase-10-later.md": phase(10, "pending"),
      "phase-02-earlier.md": phase(2, "completed"),
    });
    expect(summary.phases.map((p) => p.phase)).toEqual([2, 10]);
    expect(summary.phases[0].status).toBe("completed");
    expect(summary.phases[0].title).toBe("Phase 2 work");
    expect(summary.status).toBe("pending");
  });

  it("ignores files that are not phases", () => {
    const summary = summarizePlan("p", { "plan.md": "# Plan\n", "notes.md": "x", "phase-01-a.md": phase(1, "pending") });
    expect(summary.phases.map((p) => p.file)).toEqual(["phase-01-a.md"]);
    expect(summary.status).toBeNull();
  });

  it("survives a phase file with no frontmatter", () => {
    const summary = summarizePlan("p", { "phase-01-a.md": "# Phase 1\n" });
    expect(summary.phases[0]).toEqual({ file: "phase-01-a.md", phase: null, title: null, status: null });
  });

  it("recognizes a plan directory by its index file", () => {
    expect(isPlanDirectory(["plan.md", "phase-01-a.md"])).toBe(true);
    expect(isPlanDirectory(["notes.md"])).toBe(false);
  });
});
