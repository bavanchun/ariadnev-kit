import type { CompiledGraphV1 } from "./compile-graph.js";

export function renderGraphJson(graph: CompiledGraphV1): string {
  return `${JSON.stringify(graph, null, 2)}\n`;
}

export function renderGraphMermaid(graph: CompiledGraphV1): string {
  const lines = ["flowchart TD"];
  for (const node of graph.nodes) {
    const label = `${node.id}<br/>${node.type}: ${node.handler.ref}`;
    lines.push(`  ${node.id}["${label}"]`);
  }
  for (const edge of graph.edges) lines.push(`  ${edge.from} -->|${edge.type}| ${edge.to}`);
  return `${lines.join("\n")}\n`;
}

export function renderGraphProse(graph: CompiledGraphV1): string {
  const effects = graph.nodes.filter((node) => node.authority.effect !== "none");
  const approvals = graph.edges.filter((edge) => edge.type === "approval");
  const retries = graph.edges.filter((edge) => edge.type === "retry");
  return [
    `${graph.title} (${graph.id})`,
    `${graph.nodes.length} nodes, ${graph.edges.length} edges; entry: ${graph.entry}.`,
    `${effects.length} side-effect node(s), ${approvals.length} approval edge(s), ${retries.length} retry edge(s).`,
    `Graph ${graph.versions.graph}; policy ${graph.versions.policy}; evaluator ${graph.versions.evaluator}.`,
  ].join("\n");
}
