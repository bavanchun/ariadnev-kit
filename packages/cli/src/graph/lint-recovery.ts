import { pathToNode, reachableNodes } from "./graph-analysis.js";
import { finding, type GraphFinding } from "./graph-finding.js";
import type { GraphIRV1 } from "./graph-types.js";

export function lintRecovery(graph: GraphIRV1): GraphFinding[] {
  const findings: GraphFinding[] = [];
  const reachable = reachableNodes(graph);
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  for (const node of graph.nodes) {
    if (!reachable.has(node.id) || node.type === "terminal") continue;
    const edges = graph.edges.filter((edge) => edge.from === node.id);
    const failures = edges.filter((edge) => edge.type === "failure");
    const retries = edges.filter((edge) => edge.type === "retry");
    if (failures.length === 0) {
      findings.push(finding(graph.id, "graph.recovery.failure-edge-missing", `node ${node.id} has no failure route for exhaustion`, { nodeId: node.id, path: pathToNode(graph, node.id) }));
    }
    for (const edge of failures) {
      const target = nodes.get(edge.to);
      if (!target || target.type !== "terminal" || target.handler.ref !== "failure") {
        findings.push(finding(graph.id, "graph.recovery.failure-terminal-invalid", `failure edge ${edge.id} must terminate explicitly`, { nodeId: node.id, edgeId: edge.id }));
      }
    }

    const retryConfigured = node.retry.maxAttempts > 1 || node.retry.on.length > 0;
    if (retries.length > 0 && (node.retry.maxAttempts <= 1 || node.retry.on.length === 0)) {
      findings.push(finding(graph.id, "graph.recovery.retry-unbounded", `retry edge from ${node.id} lacks a positive condition and bounded attempts`, { nodeId: node.id, edgeId: retries[0].id }));
    }
    if (retryConfigured && retries.length === 0) {
      findings.push(finding(graph.id, "graph.recovery.retry-edge-missing", `node ${node.id} configures retries without a retry edge`, { nodeId: node.id }));
    }
    if (retries.length > 0 && !edges.some((edge) => edge.type !== "retry")) {
      findings.push(finding(graph.id, "graph.recovery.retry-exit-missing", `retrying node ${node.id} has no non-retry exit`, { nodeId: node.id }));
    }
  }
  return findings;
}
