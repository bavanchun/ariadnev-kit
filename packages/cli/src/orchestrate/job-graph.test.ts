import { describe, expect, it } from "vitest";
import { UsageError } from "../cli/exit-codes.js";
import { parseJobGraph, readyJobs, topologicalOrder } from "./job-graph.js";

const graph = (jobs: unknown[]) => JSON.stringify({ jobs });

describe("parsing a job graph", () => {
  it("reads ids, commands, args and dependencies", () => {
    const parsed = parseJobGraph(graph([{ id: "build", command: "make", args: ["-j4"], needs: [] }]));
    expect(parsed.jobs[0]).toEqual({ id: "build", command: "make", args: ["-j4"], needs: [], timeoutMs: 0 });
  });

  it("defaults a missing timeout to none, the same spelling dispatch uses", () => {
    expect(parseJobGraph(graph([{ id: "a", command: "true" }])).jobs[0]?.timeoutMs).toBe(0);
  });

  it.each([
    ["not json at all", "{"],
    ["no jobs array", '{"nope":[]}'],
    ["an empty graph", '{"jobs":[]}'],
  ])("refuses %s", (_label, raw) => {
    expect(() => parseJobGraph(raw)).toThrow(UsageError);
  });

  it("names the job in every complaint, so a typo is findable", () => {
    // "invalid job graph" without an id means reading the whole file.
    expect(() => parseJobGraph(graph([{ id: "build" }]))).toThrow(/job "build": command/);
    expect(() => parseJobGraph(graph([{ id: "a", command: "x", args: [1] }]))).toThrow(/job "a": args/);
    expect(() => parseJobGraph(graph([{ id: "a", command: "x", timeoutMs: -5 }]))).toThrow(/job "a": timeoutMs/);
  });

  it("refuses two jobs with the same id", () => {
    expect(() => parseJobGraph(graph([{ id: "a", command: "x" }, { id: "a", command: "y" }]))).toThrow(/two jobs with the id/);
  });

  it("refuses a dependency on a job that is not in the graph", () => {
    expect(() => parseJobGraph(graph([{ id: "a", command: "x", needs: ["ghost"] }]))).toThrow(/needs "ghost"/);
  });
});

describe("ordering", () => {
  const three = parseJobGraph(
    graph([
      { id: "test", command: "x", needs: ["build"] },
      { id: "build", command: "x", needs: ["fetch"] },
      { id: "fetch", command: "x" },
    ]),
  );

  it("puts every dependency before its dependents", () => {
    expect(topologicalOrder(three).map((job) => job.id)).toEqual(["fetch", "build", "test"]);
  });

  it("is stable, so two runs of one graph schedule identically", () => {
    // A supervisor whose order varies makes an intermittent failure impossible
    // to reproduce.
    const parallel = parseJobGraph(graph([{ id: "zeta", command: "x" }, { id: "alpha", command: "x" }]));
    expect(topologicalOrder(parallel).map((j) => j.id)).toEqual(["alpha", "zeta"]);
    expect(topologicalOrder(parallel).map((j) => j.id)).toEqual(["alpha", "zeta"]);
  });

  it("rejects a cycle and names the jobs stuck in it", () => {
    const cyclic = parseJobGraph(graph([{ id: "a", command: "x", needs: ["b"] }, { id: "b", command: "x", needs: ["a"] }]));
    expect(() => topologicalOrder(cyclic)).toThrow(UsageError);
    expect(() => topologicalOrder(cyclic)).toThrow(/cycle: a, b/);
  });

  it("rejects a job that depends on itself", () => {
    const selfish = parseJobGraph(graph([{ id: "a", command: "x", needs: ["a"] }]));
    expect(() => topologicalOrder(selfish)).toThrow(/cycle: a/);
  });
});

describe("which jobs are ready", () => {
  const g = parseJobGraph(
    graph([
      { id: "a", command: "x" },
      { id: "b", command: "x" },
      { id: "c", command: "x", needs: ["a", "b"] },
    ]),
  );

  it("offers the independent jobs first, together", () => {
    expect(readyJobs(g, new Set(), new Set()).map((j) => j.id)).toEqual(["a", "b"]);
  });

  it("holds a job back until every dependency is done, not just one", () => {
    expect(readyJobs(g, new Set(["a"]), new Set(["a"])).map((j) => j.id)).toEqual(["b"]);
    expect(readyJobs(g, new Set(["a", "b"]), new Set(["a", "b"])).map((j) => j.id)).toEqual(["c"]);
  });

  it("never offers a job that already started", () => {
    expect(readyJobs(g, new Set(), new Set(["a", "b"]))).toEqual([]);
  });
});
