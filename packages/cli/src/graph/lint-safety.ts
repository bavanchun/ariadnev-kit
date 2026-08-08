import { outgoing } from "./graph-analysis.js";
import { finding, type GraphFinding } from "./graph-finding.js";
import type { GraphEdgeV1, GraphIRV1, GraphNodeV1 } from "./graph-types.js";

const HIGH_RISK = new Set(["workspace:write", "external:mutate", "publish", "delete"]);

function highRisk(node: GraphNodeV1): boolean {
  return node.authority.effect !== "none" || node.authority.capabilities.some((item) => HIGH_RISK.has(item));
}

export function lintSafety(graph: GraphIRV1): GraphFinding[] {
  const findings: GraphFinding[] = [];
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const keys = new Map<string, string>();
  for (const node of graph.nodes) {
    const capabilities = new Set(node.authority.capabilities);
    if (node.state.reads.length > 0 && !capabilities.has("state:read")) {
      findings.push(finding(graph.id, "graph.safety.state-read-authority-missing", `node ${node.id} reads state without state:read`, { nodeId: node.id }));
    }
    if (node.state.writes.length > 0 && !capabilities.has("state:write")) {
      findings.push(finding(graph.id, "graph.safety.state-write-authority-missing", `node ${node.id} writes state without state:write`, { nodeId: node.id }));
    }
    if (node.authority.effect === "workspace" && !capabilities.has("workspace:write")) {
      findings.push(finding(graph.id, "graph.safety.effect-authority-missing", `workspace effect ${node.id} lacks workspace:write`, { nodeId: node.id }));
    }
    if (node.authority.effect === "external" && !capabilities.has("external:mutate")) {
      findings.push(finding(graph.id, "graph.safety.effect-authority-missing", `external effect ${node.id} lacks external:mutate`, { nodeId: node.id }));
    }
    if (!highRisk(node)) continue;
    if (node.authority.approval !== "required") {
      findings.push(finding(graph.id, "graph.safety.effect-approval-missing", `high-risk node ${node.id} does not require approval`, { nodeId: node.id }));
    }
    if (node.authority.idempotency !== "required" || !node.authority.idempotencyKey) {
      findings.push(finding(graph.id, "graph.safety.effect-idempotency-missing", `high-risk node ${node.id} lacks an idempotency key`, { nodeId: node.id }));
    } else {
      const previous = keys.get(node.authority.idempotencyKey);
      if (previous) {
        findings.push(finding(graph.id, "graph.safety.idempotency-key-reused", `nodes ${previous} and ${node.id} reuse an idempotency key`, { nodeId: node.id }));
      }
      keys.set(node.authority.idempotencyKey, node.id);
    }
    const bypass = approvalBypassPath(graph, node.id);
    if (bypass) findings.push(finding(graph.id, "graph.safety.approval-bypass", `high-risk node ${node.id} is reachable without an approval edge`, { nodeId: node.id, path: bypass }));
  }

  for (const edge of graph.edges.filter((item) => item.type === "approval")) {
    const source = nodes.get(edge.from);
    const target = nodes.get(edge.to);
    if (!source || source.type !== "human" || source.authority.approval !== "required") {
      findings.push(finding(graph.id, "graph.safety.approval-source-invalid", `approval edge ${edge.id} must originate at an approval-required human node`, { edgeId: edge.id, nodeId: edge.from }));
    }
    if (!target || target.authority.approval !== "required") {
      findings.push(finding(graph.id, "graph.safety.approval-target-invalid", `approval edge ${edge.id} must enter an approval-required node`, { edgeId: edge.id, nodeId: edge.to }));
    }
  }
  return findings;
}

function approvalBypassPath(graph: GraphIRV1, target: string): string[] | undefined {
  const edges = outgoing(graph);
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const queue: Array<{ node: string; approved: boolean; path: string[] }> = [
    { node: graph.entry, approved: false, path: [graph.entry] },
  ];
  const seen = new Set<string>();
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.node === target && !current.approved) return current.path;
    const key = `${current.node}:${current.approved}`;
    if (seen.has(key)) continue;
    seen.add(key);
    for (const edge of edges.get(current.node) ?? []) {
      queue.push({
        node: edge.to,
        approved: current.approved || isApproval(edge, nodes),
        path: [...current.path, edge.to],
      });
    }
  }
  return undefined;
}

function isApproval(edge: GraphEdgeV1, nodes: Map<string, GraphNodeV1>): boolean {
  const source = nodes.get(edge.from);
  return edge.type === "approval" && source?.type === "human" && source.authority.approval === "required";
}
