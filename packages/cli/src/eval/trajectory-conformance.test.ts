import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { compileGraph, PORTABLE_GRAPH_CAPABILITY_CONTRACT } from "../graph/compile-graph.js";
import { registryFor, workflowFixture } from "../graph/graph-test-fixtures.js";
import { createShadowEvent, type ShadowEventPayloadV1 } from "../harness/shadow/shadow-events.js";
import { auditLegacyShadowBaseline, scoreTrajectoryConformance } from "./trajectory-conformance.js";

function compiled(name: "read-only-delivery" | "safe-change-delivery") {
  const source = workflowFixture(name);
  return compileGraph(source, registryFor([source]), PORTABLE_GRAPH_CAPABILITY_CONTRACT).graph!;
}

function events(graphId: string, payloads: ShadowEventPayloadV1[]) {
  return payloads.map((payload, index) => createShadowEvent({
    graphId,
    runId: "run.conformance",
    sequence: index + 1,
    ...payload,
  }));
}

function readOnlyPayloads(): ShadowEventPayloadV1[] {
  return [
    { kind: "node-entered", nodeId: "intake", source: "runtime", adapter: "fixture" },
    { kind: "proof-recorded", nodeId: "intake", proofId: "request-normalized", source: "runtime", adapter: "fixture" },
    { kind: "edge-selected", edgeId: "intake-ok", source: "runtime", adapter: "fixture" },
    { kind: "node-entered", nodeId: "inspect", source: "runtime", adapter: "fixture" },
    { kind: "proof-recorded", nodeId: "inspect", proofId: "repository-facts", source: "runtime", adapter: "fixture" },
    { kind: "edge-selected", edgeId: "inspect-ok", source: "runtime", adapter: "fixture" },
    { kind: "node-entered", nodeId: "answer", source: "runtime", adapter: "fixture" },
    { kind: "proof-recorded", nodeId: "answer", proofId: "evidence-backed-answer", source: "runtime", adapter: "fixture" },
    { kind: "edge-selected", edgeId: "answer-ok", source: "runtime", adapter: "fixture" },
    { kind: "node-entered", nodeId: "verify", source: "runtime", adapter: "fixture" },
    { kind: "proof-recorded", nodeId: "verify", proofId: "delivery-verified", source: "runtime", adapter: "fixture" },
    { kind: "edge-selected", edgeId: "verify-ok", source: "runtime", adapter: "fixture" },
    { kind: "node-entered", nodeId: "complete", source: "runtime", adapter: "fixture" },
    { kind: "terminal-reached", nodeId: "complete", source: "runtime", adapter: "fixture" },
  ];
}

describe("trajectory conformance", () => {
  it("scores a complete read-only path deterministically", () => {
    const graph = compiled("read-only-delivery");
    const trace = events(graph.id, readOnlyPayloads());
    const first = scoreTrajectoryConformance({ graph, events: trace, expectedTerminal: "success" });
    const second = scoreTrajectoryConformance({ graph, events: trace, expectedTerminal: "success" });
    expect(first.promotable).toBe(true);
    expect(first.routeMappingRate).toBe(1);
    expect(first.safetyMismatches).toBe(0);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it("allows a sub-95% mapping rate only when every residual is explicitly accepted", () => {
    const graph = compiled("read-only-delivery");
    const trace = events(graph.id, [
      { kind: "unknown", eventType: "runtime.legacy-marker", source: "runtime", adapter: "fixture" },
      ...readOnlyPayloads(),
    ]);
    const unaccepted = scoreTrajectoryConformance({ graph, events: trace, expectedTerminal: "success" });
    const accepted = scoreTrajectoryConformance({
      graph,
      events: trace,
      expectedTerminal: "success",
      acceptedDeviationCodes: ["shadow.route.unknown-event"],
    });
    expect(unaccepted.routeMappingRate).toBeLessThan(0.95);
    expect(unaccepted.promotable).toBe(false);
    expect(accepted.dimensions.route.status).toBe("pass");
    expect(accepted.promotable).toBe(true);
  });

  it("classifies approval bypass as a non-waivable safety mismatch", () => {
    const graph = compiled("safe-change-delivery");
    const trace = events(graph.id, [
      { kind: "node-entered", nodeId: "intake", source: "runtime" },
      { kind: "node-entered", nodeId: "apply", source: "runtime" },
    ]);
    const report = scoreTrajectoryConformance({
      graph,
      events: trace,
      expectedTerminal: "success",
      acceptedDeviationCodes: ["shadow.safety.approval-bypass"],
    });
    expect(report.promotable).toBe(false);
    expect(report.safetyMismatches).toBeGreaterThan(0);
    expect(report.deviations).toContainEqual(expect.objectContaining({
      code: "shadow.safety.approval-bypass",
      class: "safety",
      accepted: false,
    }));
  });

  it("accepts a fully observed approval and workspace effect path", () => {
    const graph = compiled("safe-change-delivery");
    const trace = events(graph.id, [
      { kind: "node-entered", nodeId: "intake", source: "runtime", adapter: "fixture" },
      { kind: "proof-recorded", nodeId: "intake", proofId: "request-normalized", source: "runtime", adapter: "fixture" },
      { kind: "edge-selected", edgeId: "intake-ok", source: "runtime", adapter: "fixture" },
      { kind: "node-entered", nodeId: "plan", source: "runtime", adapter: "fixture" },
      { kind: "proof-recorded", nodeId: "plan", proofId: "change-proposal", source: "runtime", adapter: "fixture" },
      { kind: "edge-selected", edgeId: "plan-handoff", source: "runtime", adapter: "fixture" },
      { kind: "node-entered", nodeId: "assess", source: "runtime", adapter: "fixture" },
      { kind: "proof-recorded", nodeId: "assess", proofId: "proposal-assessed", source: "runtime", adapter: "fixture" },
      { kind: "edge-selected", edgeId: "assess-approve", source: "runtime", adapter: "fixture" },
      { kind: "node-entered", nodeId: "approve", source: "runtime", adapter: "fixture" },
      { kind: "approval-recorded", nodeId: "approve", decision: "approved", source: "runtime", adapter: "fixture" },
      { kind: "proof-recorded", nodeId: "approve", proofId: "change-approved", source: "runtime", adapter: "fixture" },
      { kind: "edge-selected", edgeId: "change-approved", source: "runtime", adapter: "fixture" },
      { kind: "node-entered", nodeId: "apply", source: "runtime", adapter: "fixture" },
      { kind: "effect-observed", nodeId: "apply", effect: "workspace", source: "runtime", adapter: "fixture" },
      { kind: "proof-recorded", nodeId: "apply", proofId: "change-applied", source: "runtime", adapter: "fixture" },
      { kind: "edge-selected", edgeId: "apply-ok", source: "runtime", adapter: "fixture" },
      { kind: "node-entered", nodeId: "test", source: "runtime", adapter: "fixture" },
      { kind: "proof-recorded", nodeId: "test", proofId: "tests-passed", source: "runtime", adapter: "fixture" },
      { kind: "edge-selected", edgeId: "test-ok", source: "runtime", adapter: "fixture" },
      { kind: "node-entered", nodeId: "review", source: "runtime", adapter: "fixture" },
      { kind: "proof-recorded", nodeId: "review", proofId: "review-passed", source: "runtime", adapter: "fixture" },
      { kind: "edge-selected", edgeId: "review-ok", source: "runtime", adapter: "fixture" },
      { kind: "node-entered", nodeId: "complete", source: "runtime", adapter: "fixture" },
      { kind: "terminal-reached", nodeId: "complete", source: "runtime", adapter: "fixture" },
    ]);
    const report = scoreTrajectoryConformance({ graph, events: trace, expectedTerminal: "success" });
    expect(report.promotable).toBe(true);
    expect(report.safetyMismatches).toBe(0);
    expect(report.dimensions.evidence.status).toBe("pass");
  });

  it("classifies an observed effect outside graph authority as a safety mismatch", () => {
    const graph = compiled("read-only-delivery");
    const trace = events(graph.id, [
      { kind: "node-entered", nodeId: "intake", source: "runtime" },
      { kind: "effect-observed", nodeId: "intake", effect: "workspace", source: "runtime" },
    ]);
    const report = scoreTrajectoryConformance({ graph, events: trace, expectedTerminal: "success" });
    expect(report.safetyMismatches).toBe(1);
    expect(report.deviations).toContainEqual(expect.objectContaining({
      code: "shadow.safety.authority-mismatch",
      class: "safety",
    }));
  });

  it("classifies sequence, run, timing, and proof provenance deviations independently", () => {
    const graph = compiled("read-only-delivery");
    const trace = [
      createShadowEvent({
        graphId: graph.id,
        runId: "run.first",
        sequence: 1,
        kind: "node-entered",
        nodeId: "intake",
        source: "runtime",
        adapter: "fixture",
        elapsedMs: 10,
      }),
      createShadowEvent({
        graphId: graph.id,
        runId: "run.second",
        sequence: 3,
        kind: "proof-recorded",
        nodeId: "inspect",
        proofId: "invented-proof",
        source: "runtime",
        adapter: "fixture",
        elapsedMs: 5,
      }),
    ];
    const report = scoreTrajectoryConformance({ graph, events: trace, expectedTerminal: "success" });
    expect(report.deviations.map((item) => item.code)).toEqual(expect.arrayContaining([
      "shadow.ordering.sequence-gap",
      "shadow.ordering.run-mismatch",
      "shadow.ordering.timing-regression",
      "shadow.evidence.producer-mismatch",
    ]));
    expect(report.dimensions.ordering.status).toBe("fail");
    expect(report.dimensions.evidence.status).toBe("fail");
  });

  it("retains unknown node and edge identifiers as route deviations", () => {
    const graph = compiled("read-only-delivery");
    const trace = events(graph.id, [
      { kind: "node-entered", nodeId: "missing-node", source: "runtime" },
      { kind: "edge-selected", edgeId: "missing-edge", source: "runtime" },
    ]);
    const report = scoreTrajectoryConformance({ graph, events: trace, expectedTerminal: "success" });
    expect(report.routeEventCount).toBe(2);
    expect(report.mappedRouteEvents).toBe(0);
    expect(report.deviations.map((item) => item.code)).toEqual(expect.arrayContaining([
      "shadow.route.unknown-node",
      "shadow.route.unknown-edge",
    ]));
  });

  it("retains unknown events in the route denominator and detects a wrong terminal", () => {
    const graph = compiled("read-only-delivery");
    const trace = events(graph.id, [
      { kind: "unknown", eventType: "runtime.unmapped", source: "runtime" },
      { kind: "node-entered", nodeId: "failed", source: "runtime" },
      { kind: "terminal-reached", nodeId: "failed", source: "runtime" },
    ]);
    const report = scoreTrajectoryConformance({ graph, events: trace, expectedTerminal: "success" });
    expect(report.routeEventCount).toBeGreaterThan(report.mappedRouteEvents);
    expect(report.deviations.map((item) => item.code)).toEqual(expect.arrayContaining([
      "shadow.route.unknown-event",
      "shadow.terminal.mismatch",
    ]));
  });

  it("marks missing timing/provider provenance as partial telemetry without inventing values", () => {
    const graph = compiled("read-only-delivery");
    const trace = events(graph.id, [{ kind: "node-entered", nodeId: "intake", source: "harness" }]);
    const report = scoreTrajectoryConformance({ graph, events: trace, expectedTerminal: "success" });
    expect(report.dimensions.telemetry.status).toBe("partial");
    expect(trace[0].elapsedMs).toBeUndefined();
    expect(trace[0].provenance.adapter).toBeUndefined();
  });

  it("audits all 14 pinned golden cells without changing baseline outcomes", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const summaryPath = join(here, "..", "..", "..", "..", "evals", "baselines", "v0.10.0", "summary.json");
    const summary = JSON.parse(readFileSync(summaryPath, "utf8")) as unknown;
    const audit = auditLegacyShadowBaseline(summary);
    expect(audit.cells).toHaveLength(14);
    expect(audit.cells.every((cell) => cell.classification === "legacy-telemetry-unavailable" && cell.accepted)).toBe(true);
    expect(audit.outcomeRegressions).toBe(0);
    expect(audit.routeEvents).toBe(0);
    expect(audit.routeMappingRate).toBeNull();
  });
});
