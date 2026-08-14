import type { GraphEdgeV1, GraphIRV1 } from "./graph-types.js";

export function outgoing(graph: GraphIRV1): Map<string, GraphEdgeV1[]> {
  const result = new Map<string, GraphEdgeV1[]>();
  for (const node of graph.nodes) result.set(node.id, []);
  for (const edge of graph.edges) result.get(edge.from)?.push(edge);
  for (const edges of result.values()) edges.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return result;
}

export function reachableNodes(graph: GraphIRV1): Set<string> {
  const edges = outgoing(graph);
  const reached = new Set<string>();
  const queue = [graph.entry];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (reached.has(current)) continue;
    reached.add(current);
    for (const edge of edges.get(current) ?? []) queue.push(edge.to);
  }
  return reached;
}

export function pathToNode(
  graph: GraphIRV1,
  target: string,
  edgeAllowed: (edge: GraphEdgeV1) => boolean = () => true,
): string[] | undefined {
  const edges = outgoing(graph);
  const queue: Array<{ node: string; path: string[] }> = [{ node: graph.entry, path: [graph.entry] }];
  const reached = new Set<string>();
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.node === target) return current.path;
    if (reached.has(current.node)) continue;
    reached.add(current.node);
    for (const edge of edges.get(current.node) ?? []) {
      if (edgeAllowed(edge)) queue.push({ node: edge.to, path: [...current.path, edge.to] });
    }
  }
  return undefined;
}

export function stronglyConnected(graph: GraphIRV1, reachable: Set<string>): string[][] {
  const edges = outgoing(graph);
  const indexByNode = new Map<string, number>();
  const lowByNode = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const components: string[][] = [];
  let nextIndex = 0;

  function visit(node: string): void {
    indexByNode.set(node, nextIndex);
    lowByNode.set(node, nextIndex++);
    stack.push(node);
    onStack.add(node);
    for (const edge of edges.get(node) ?? []) {
      if (!reachable.has(edge.to)) continue;
      if (!indexByNode.has(edge.to)) {
        visit(edge.to);
        lowByNode.set(node, Math.min(lowByNode.get(node)!, lowByNode.get(edge.to)!));
      } else if (onStack.has(edge.to)) {
        lowByNode.set(node, Math.min(lowByNode.get(node)!, indexByNode.get(edge.to)!));
      }
    }
    if (lowByNode.get(node) !== indexByNode.get(node)) return;
    const component: string[] = [];
    let popped: string;
    do {
      popped = stack.pop()!;
      onStack.delete(popped);
      component.push(popped);
    } while (popped !== node);
    components.push(component.sort());
  }

  for (const node of [...reachable].sort()) if (!indexByNode.has(node)) visit(node);
  return components;
}
