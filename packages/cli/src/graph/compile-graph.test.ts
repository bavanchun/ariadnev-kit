import { describe, expect, it } from "vitest";
import {
  compileGraph,
  PORTABLE_GRAPH_CAPABILITY_CONTRACT,
  type GraphCapabilityContract,
} from "./compile-graph.js";
import { cloneGraph, registryFor, workflowFixture, workflowNames } from "./graph-test-fixtures.js";

const canonical = workflowNames.map(workflowFixture);
const registry = registryFor(canonical);

function findingIds(graph = workflowFixture("safe-change-delivery")): string[] {
  return compileGraph(graph, registry, PORTABLE_GRAPH_CAPABILITY_CONTRACT).findings.map((finding) => finding.id);
}

describe("compileGraph", () => {
  it("compiles every canonical workflow without findings", () => {
    for (const graph of canonical) {
      const result = compileGraph(graph, registry, PORTABLE_GRAPH_CAPABILITY_CONTRACT);
      expect(result.findings).toEqual([]);
      expect(result.ok).toBe(true);
      expect(result.graph?.id).toBe(graph.id);
    }
  });

  it("never returns a partial graph when a handler is unresolved", () => {
    const graph = cloneGraph(workflowFixture("read-only-delivery"));
    graph.nodes.find((node) => node.id === "answer")!.handler.ref = "missing";
    const result = compileGraph(graph, registry, PORTABLE_GRAPH_CAPABILITY_CONTRACT);
    expect(result.ok).toBe(false);
    expect(result.graph).toBeNull();
    expect(result.findings).toContainEqual(expect.objectContaining({ id: "graph.handler.unresolved", nodeId: "answer" }));
  });

  it("reports unreachable nodes and terminal outgoing edges", () => {
    const graph = cloneGraph(workflowFixture("read-only-delivery"));
    graph.nodes.push({ ...cloneGraph(graph).nodes[0], id: "orphan", handler: { kind: "function", ref: "normalize-request" } });
    graph.edges.push({ id: "complete-loop", from: "complete", to: "intake", type: "success" });
    const ids = findingIds(graph);
    expect(ids).toContain("graph.structure.unreachable-node");
    expect(ids).toContain("graph.structure.terminal-outgoing");
  });

  it("rejects a reachable non-retry cycle with a path witness", () => {
    const graph = cloneGraph(workflowFixture("read-only-delivery"));
    graph.edges.push({ id: "answer-cycle", from: "answer", to: "inspect", type: "success" });
    const finding = compileGraph(graph, registry, PORTABLE_GRAPH_CAPABILITY_CONTRACT).findings.find(
      (item) => item.id === "graph.structure.unbounded-cycle",
    );
    expect(finding?.path).toEqual(expect.arrayContaining(["answer", "inspect"]));
  });

  it("requires bounded retry metadata, an exhaustion route, and idempotency for effects", () => {
    const graph = cloneGraph(workflowFixture("safe-change-delivery"));
    const apply = graph.nodes.find((node) => node.id === "apply")!;
    apply.retry.maxAttempts = 1;
    apply.retry.on = [];
    apply.authority.idempotency = "none";
    delete apply.authority.idempotencyKey;
    graph.edges = graph.edges.filter((edge) => edge.id !== "apply-failed");
    const ids = findingIds(graph);
    expect(ids).toContain("graph.recovery.retry-unbounded");
    expect(ids).toContain("graph.recovery.failure-edge-missing");
    expect(ids).toContain("graph.safety.effect-idempotency-missing");
  });

  it("rejects every high-risk route that bypasses approval", () => {
    const graph = cloneGraph(workflowFixture("safe-change-delivery"));
    graph.edges.push({ id: "plan-bypass", from: "plan", to: "apply", type: "success" });
    const finding = compileGraph(graph, registry, PORTABLE_GRAPH_CAPABILITY_CONTRACT).findings.find(
      (item) => item.id === "graph.safety.approval-bypass",
    );
    expect(finding?.nodeId).toBe("apply");
    expect(finding?.path).toEqual(["intake", "plan", "apply"]);
  });

  it("checks state ownership, proof order, versions, and model targets", () => {
    const graph = cloneGraph(workflowFixture("safe-change-delivery"));
    graph.nodes.find((node) => node.id === "intake")!.state.writes = [];
    graph.nodes.find((node) => node.id === "plan")!.proof.produces = [];
    graph.versions.graph = "latest";
    graph.nodes.find((node) => node.id === "assess")!.routing!.allowedTargets = ["approve"];
    const ids = findingIds(graph);
    expect(ids).toContain("graph.evidence.state-owner-not-writer");
    expect(ids).toContain("graph.evidence.proof-not-established");
    expect(ids).toContain("graph.evidence.version-unpinned");
    expect(ids).toContain("graph.evidence.routing-target-unlisted");
  });

  it("classifies a missing capability as unsupported only when the contract allows it", () => {
    const available = PORTABLE_GRAPH_CAPABILITY_CONTRACT.available.filter((item) => item !== "graph:interrupt");
    const skippable: GraphCapabilityContract = {
      id: "fixture-runtime",
      available,
      onMissing: { "graph:interrupt": "unsupported" },
    };
    const skipped = compileGraph(workflowFixture("read-only-delivery"), registry, skippable);
    expect(skipped.graph).toBeNull();
    expect(skipped.findings).toContainEqual(
      expect.objectContaining({ id: "graph.capability.unavailable", severity: "unsupported" }),
    );

    const required = compileGraph(workflowFixture("read-only-delivery"), registry, { id: "strict", available });
    expect(required.findings).toContainEqual(
      expect.objectContaining({ id: "graph.capability.unavailable", severity: "error" }),
    );
  });

  it.each([
    ["state authority", (graph: ReturnType<typeof workflowFixture>) => {
      const plan = graph.nodes.find((node) => node.id === "plan")!;
      plan.authority.capabilities = plan.authority.capabilities.filter((item) => item !== "state:read");
    }, "graph.safety.state-read-authority-missing"],
    ["approval edge", (graph: ReturnType<typeof workflowFixture>) => {
      graph.edges.find((edge) => edge.id === "change-approved")!.type = "success";
    }, "graph.safety.approval-bypass"],
    ["failure terminal", (graph: ReturnType<typeof workflowFixture>) => {
      graph.edges.find((edge) => edge.id === "plan-failed")!.to = "complete";
    }, "graph.recovery.failure-terminal-invalid"],
    ["retry edge", (graph: ReturnType<typeof workflowFixture>) => {
      graph.edges = graph.edges.filter((edge) => edge.id !== "apply-retry");
    }, "graph.recovery.retry-edge-missing"],
    ["state writer", (graph: ReturnType<typeof workflowFixture>) => {
      graph.nodes.find((node) => node.id === "plan")!.state.writes.push("approval");
    }, "graph.evidence.state-writer-not-owner"],
  ])("catches the %s mutation", (_label, mutate, expectedId) => {
    const graph = cloneGraph(workflowFixture("safe-change-delivery"));
    mutate(graph);
    expect(findingIds(graph)).toContain(expectedId);
  });
});
