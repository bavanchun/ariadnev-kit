import { describe, expect, it } from "vitest";
import { compileGraph, PORTABLE_GRAPH_CAPABILITY_CONTRACT } from "../../graph/compile-graph.js";
import { cloneGraph, registryFor, workflowFixture } from "../../graph/graph-test-fixtures.js";
import { createCapabilityPolicy, evaluateCapabilityPolicy } from "./capability-policy.js";

function nodes() {
  const source = cloneGraph(workflowFixture("safe-change-delivery"));
  const compiled = compileGraph(source, registryFor([source]), PORTABLE_GRAPH_CAPABILITY_CONTRACT);
  if (!compiled.ok) throw new Error(JSON.stringify(compiled.findings));
  return new Map(compiled.graph.nodes.map((node) => [node.id, node]));
}

describe("capability policy", () => {
  it("keeps read-only execution compatible while denying workspace effects", () => {
    const policy = createCapabilityPolicy({ mode: "read-only" });
    expect(evaluateCapabilityPolicy({ node: nodes().get("plan")!, policy })).toMatchObject({ decision: "allow" });
    expect(evaluateCapabilityPolicy({ node: nodes().get("apply")!, policy })).toMatchObject({
      decision: "deny",
      violations: expect.arrayContaining([expect.stringMatching(/workspace:write/)]),
    });
  });

  it("allows a bounded workspace effect only with an explicit grant and approval", () => {
    const policy = createCapabilityPolicy({ mode: "workspace-change", grants: ["workspace:write"] });
    expect(evaluateCapabilityPolicy({ node: nodes().get("apply")!, policy })).toMatchObject({
      decision: "require-approval",
      violations: [],
    });
  });

  it("default-denies unknown capabilities even when supplied through untyped input", () => {
    const node = structuredClone(nodes().get("plan")!);
    (node.authority.capabilities as string[]).push("workspace:teleport");
    const result = evaluateCapabilityPolicy({ node: node as never, policy: createCapabilityPolicy({ mode: "workspace-change" }) });
    expect(result).toMatchObject({ decision: "deny" });
    expect(result.violations).toContain("node plan declares unknown capability workspace:teleport");
  });

  it("denies implicit effects and high-risk actions that bypass approval", () => {
    const implicit = structuredClone(nodes().get("apply")!);
    implicit.authority.capabilities = implicit.authority.capabilities.filter((capability) => capability !== "workspace:write");
    const external = structuredClone(nodes().get("apply")!);
    external.authority.effect = "external";
    external.authority.capabilities = ["external:mutate"];
    external.authority.approval = "none";
    const policy = createCapabilityPolicy({
      mode: "workspace-change",
      grants: ["workspace:write", "external:mutate"],
    });
    expect(evaluateCapabilityPolicy({ node: implicit, policy }).violations).toContain(
      "node apply declares a workspace effect without workspace:write authority",
    );
    expect(evaluateCapabilityPolicy({ node: external, policy }).violations).toContain(
      "node apply requires approval for external:mutate",
    );
  });
});
