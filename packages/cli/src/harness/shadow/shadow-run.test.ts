import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { compileGraph, PORTABLE_GRAPH_CAPABILITY_CONTRACT } from "../../graph/compile-graph.js";
import { registryFor, workflowFixture } from "../../graph/graph-test-fixtures.js";
import { createShadowRun, createLocalShadowSink, type ShadowSink } from "./shadow-run.js";

describe("shadow run", () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  function graph(name: "read-only-delivery" | "safe-change-delivery") {
    const source = workflowFixture(name);
    return compileGraph(source, registryFor([source]), PORTABLE_GRAPH_CAPABILITY_CONTRACT).graph!;
  }

  it("records only allowlisted IDs, enums, provenance, and timing", () => {
    const events: unknown[] = [];
    const sink: ShadowSink = { append: (event) => { events.push(event); } };
    const run = createShadowRun({ graph: graph("read-only-delivery"), runId: "run.shadow-1", sink });
    run.record({ kind: "node-entered", nodeId: "intake", source: "runtime", adapter: "codex-v1", elapsedMs: 12 });
    run.record({ kind: "proof-recorded", nodeId: "intake", proofId: "request-normalized", source: "harness" });

    expect(() => run.record({
      kind: "unknown",
      eventType: "runtime.custom",
      source: "runtime",
      payload: "secret",
    } as never)).toThrow(/unsupported shadow event field/);
    expect(() => run.record({ kind: "node-completed", nodeId: "intake", outcome: "invented", source: "runtime" } as never))
      .toThrow(/outcome is unsupported/);
    expect(run.finish()).toHaveLength(2);
    expect(events).toEqual(run.finish());
    expect(JSON.stringify(events)).not.toMatch(/prompt|output|argument|workspace/i);
  });

  it("rejects every execution attempt, including write-capable nodes", () => {
    const events: unknown[] = [];
    const run = createShadowRun({
      graph: graph("safe-change-delivery"),
      runId: "run.shadow-mutation",
      sink: { append: (event) => { events.push(event); } },
    });
    expect(() => run.attemptExecution("apply")).toThrow(/observational.*cannot invoke/i);
    expect(events).toEqual([]);
  });

  it("persists bounded private JSONL when using the local sink", () => {
    const root = mkdtempSync(join(tmpdir(), "ariadnev-shadow-"));
    roots.push(root);
    const sink = createLocalShadowSink({ root, runId: "run.private", maxEvents: 2 });
    const run = createShadowRun({ graph: graph("read-only-delivery"), runId: "run.private", sink });
    run.record({ kind: "node-entered", nodeId: "intake", source: "harness" });
    run.record({ kind: "edge-selected", edgeId: "intake-ok", source: "harness" });
    expect(() => run.record({ kind: "node-entered", nodeId: "inspect", source: "harness" })).toThrow(/event limit/);

    const file = join(root, "run.private.jsonl");
    expect(statSync(root).mode & 0o777).toBe(0o700);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(readFileSync(file, "utf8").trim().split("\n")).toHaveLength(2);
    const resumed = createLocalShadowSink({ root, runId: "run.private", maxEvents: 2 });
    expect(() => resumed.append(run.finish()[0])).toThrow(/event limit/);
    expect(() => sink.append({
      schemaVersion: 1,
      graphId: "read-only-delivery",
      runId: "run.private",
      sequence: 3,
      kind: "unknown",
      eventType: "runtime.custom",
      provenance: { source: "runtime" },
      secret: "must-not-persist",
    } as never)).toThrow(/unsupported stored shadow event field/);
  });
});
