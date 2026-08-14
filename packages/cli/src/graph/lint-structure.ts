import { outgoing, reachableNodes, stronglyConnected } from "./graph-analysis.js";
import { finding, type GraphFinding } from "./graph-finding.js";
import type { GraphIRV1 } from "./graph-types.js";

export function lintStructure(graph: GraphIRV1): GraphFinding[] {
  const findings: GraphFinding[] = [];
  const nodeIds = new Set<string>();
  const edgeIds = new Set<string>();
  for (const node of graph.nodes) {
    if (nodeIds.has(node.id)) findings.push(finding(graph.id, "graph.structure.duplicate-node", `duplicate node ${node.id}`, { nodeId: node.id }));
    nodeIds.add(node.id);
  }
  for (const edge of graph.edges) {
    if (edgeIds.has(edge.id)) findings.push(finding(graph.id, "graph.structure.duplicate-edge", `duplicate edge ${edge.id}`, { edgeId: edge.id }));
    edgeIds.add(edge.id);
  }
  if (!nodeIds.has(graph.entry)) {
    findings.push(finding(graph.id, "graph.structure.entry-unresolved", `entry ${graph.entry} does not resolve`, { nodeId: graph.entry }));
    return findings;
  }

  const edges = outgoing(graph);
  const reachable = reachableNodes(graph);
  for (const node of graph.nodes) {
    if (!reachable.has(node.id)) {
      findings.push(finding(graph.id, "graph.structure.unreachable-node", `node ${node.id} is unreachable from ${graph.entry}`, { nodeId: node.id }));
    }
    const nodeEdges = edges.get(node.id) ?? [];
    if (node.type === "terminal" && nodeEdges.length > 0) {
      findings.push(finding(graph.id, "graph.structure.terminal-outgoing", `terminal node ${node.id} has outgoing edges`, { nodeId: node.id, edgeId: nodeEdges[0].id }));
    } else if (node.type !== "terminal" && reachable.has(node.id) && nodeEdges.length === 0) {
      findings.push(finding(graph.id, "graph.structure.dead-end", `non-terminal node ${node.id} has no outgoing edge`, { nodeId: node.id }));
    }
  }

  const terminalIds = new Set(graph.nodes.filter((node) => node.type === "terminal").map((node) => node.id));
  for (const node of graph.nodes.filter((item) => reachable.has(item.id))) {
    const canTerminate = terminalIds.has(node.id) || canReachTerminal(node.id, terminalIds, edges);
    if (!canTerminate) findings.push(finding(graph.id, "graph.structure.terminal-unreachable", `node ${node.id} cannot reach a terminal`, { nodeId: node.id }));
  }

  for (const component of stronglyConnected(graph, reachable)) {
    const members = new Set(component);
    const internal = graph.edges.filter((edge) => members.has(edge.from) && members.has(edge.to));
    const cyclic = component.length > 1 || internal.some((edge) => edge.from === edge.to);
    if (!cyclic) continue;
    const bounded = internal.every((edge) => edge.type === "retry") && component.every((id) => {
      const node = graph.nodes.find((item) => item.id === id)!;
      return node.retry.maxAttempts > 1 && node.retry.on.length > 0;
    });
    const hasExit = graph.edges.some((edge) => members.has(edge.from) && !members.has(edge.to) && edge.type !== "retry");
    if (!bounded || !hasExit) {
      findings.push(finding(graph.id, "graph.structure.unbounded-cycle", `cycle is not a bounded retry with an exit: ${component.join(" -> ")}`, { path: component }));
    }
  }
  return findings;
}

function canReachTerminal(start: string, terminals: Set<string>, edges: ReturnType<typeof outgoing>): boolean {
  const queue = [start];
  const seen = new Set<string>();
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (terminals.has(current)) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const edge of edges.get(current) ?? []) if (edge.type !== "retry") queue.push(edge.to);
  }
  return false;
}
