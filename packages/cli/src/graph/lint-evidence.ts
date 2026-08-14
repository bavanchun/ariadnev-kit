import { outgoing } from "./graph-analysis.js";
import { finding, type GraphFinding } from "./graph-finding.js";
import type { GraphIRV1 } from "./graph-types.js";

const FLOATING_VERSION = /^(?:latest|main|master|head|next|\*|x)$/i;

export function lintEvidence(graph: GraphIRV1): GraphFinding[] {
  const findings: GraphFinding[] = [];
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  for (const field of graph.state.fields) {
    const owner = nodes.get(field.owner);
    if (!owner || !owner.state.writes.includes(field.name)) {
      findings.push(finding(graph.id, "graph.evidence.state-owner-not-writer", `owner ${field.owner} does not write state field ${field.name}`, { nodeId: field.owner }));
    }
    for (const writer of graph.nodes.filter((node) => node.id !== field.owner && node.state.writes.includes(field.name))) {
      findings.push(finding(graph.id, "graph.evidence.state-writer-not-owner", `node ${writer.id} writes field ${field.name} owned by ${field.owner}`, { nodeId: writer.id }));
    }
  }

  for (const node of graph.nodes) {
    for (const fieldName of node.state.reads) {
      const field = graph.state.fields.find((item) => item.name === fieldName);
      if (field?.scope !== "run") continue;
      const path = missingBeforeNodePath(graph, node.id, (id) => nodes.get(id)?.state.writes.includes(fieldName) ?? false);
      if (path) findings.push(finding(graph.id, "graph.evidence.state-read-before-write", `node ${node.id} may read ${fieldName} before its owner writes it`, { nodeId: node.id, path }));
    }
    for (const proof of node.proof.requires) {
      const path = missingBeforeNodePath(graph, node.id, (id) => nodes.get(id)?.proof.produces.includes(proof) ?? false);
      if (path) findings.push(finding(graph.id, "graph.evidence.proof-not-established", `node ${node.id} may require proof ${proof} before it is produced`, { nodeId: node.id, path }));
    }
    if (node.routing) {
      const conditionalTargets = new Set(graph.edges.filter((edge) => edge.from === node.id && edge.type === "conditional").map((edge) => edge.to));
      const allowedTargets = new Set(node.routing.allowedTargets);
      for (const target of allowedTargets) {
        if (!conditionalTargets.has(target)) findings.push(finding(graph.id, "graph.evidence.routing-target-unresolved", `model target ${target} has no conditional edge from ${node.id}`, { nodeId: node.id }));
      }
      for (const target of conditionalTargets) {
        if (!allowedTargets.has(target)) findings.push(finding(graph.id, "graph.evidence.routing-target-unlisted", `conditional target ${target} is outside the model allowlist on ${node.id}`, { nodeId: node.id }));
      }
      if (!allowedTargets.has(node.routing.fallback)) findings.push(finding(graph.id, "graph.evidence.routing-fallback-invalid", `fallback ${node.routing.fallback} is outside the model allowlist on ${node.id}`, { nodeId: node.id }));
    }
  }

  for (const [name, version] of Object.entries(graph.versions)) {
    if (!version.trim() || FLOATING_VERSION.test(version.trim())) {
      findings.push(finding(graph.id, "graph.evidence.version-unpinned", `${name} version must be immutable, got ${version}`, {}));
    }
  }
  return findings;
}

function missingBeforeNodePath(graph: GraphIRV1, target: string, produces: (nodeId: string) => boolean): string[] | undefined {
  const edges = outgoing(graph);
  const queue: Array<{ node: string; established: boolean; path: string[] }> = [
    { node: graph.entry, established: false, path: [graph.entry] },
  ];
  const seen = new Set<string>();
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.node === target && !current.established) return current.path;
    const key = `${current.node}:${current.established}`;
    if (seen.has(key)) continue;
    seen.add(key);
    for (const edge of edges.get(current.node) ?? []) {
      const completed = !["failure", "cancel", "retry"].includes(edge.type);
      queue.push({
        node: edge.to,
        established: current.established || (completed && produces(current.node)),
        path: [...current.path, edge.to],
      });
    }
  }
  return undefined;
}
