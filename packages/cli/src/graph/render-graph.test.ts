import { describe, expect, it } from "vitest";
import { compileGraph, PORTABLE_GRAPH_CAPABILITY_CONTRACT } from "./compile-graph.js";
import { renderGraphJson, renderGraphMermaid, renderGraphProse } from "./render-graph.js";
import { registryFor, workflowFixture } from "./graph-test-fixtures.js";

describe("compiled graph projections", () => {
  it("renders deterministic JSON, Mermaid, and prose without mutating semantics", () => {
    const source = workflowFixture("read-only-delivery");
    const before = JSON.stringify(source);
    const result = compileGraph(source, registryFor([source]), PORTABLE_GRAPH_CAPABILITY_CONTRACT);
    expect(result.ok).toBe(true);
    const graph = result.graph!;

    const json = renderGraphJson(graph);
    const mermaid = renderGraphMermaid(graph);
    const prose = renderGraphProse(graph);
    expect(renderGraphJson(graph)).toBe(json);
    expect(JSON.parse(json)).toMatchObject({ id: source.id, entry: source.entry, compilationVersion: 1 });
    for (const node of graph.nodes) expect(mermaid).toContain(`${node.id}[`);
    for (const edge of graph.edges) expect(mermaid).toContain(`|${edge.type}|`);
    expect(prose).toContain(`${graph.nodes.length} nodes`);
    expect(prose).toContain(`${graph.edges.length} edges`);
    expect(JSON.stringify(source)).toBe(before);
  });

  it("canonicalizes equivalent input regardless of source key order", () => {
    const source = workflowFixture("safe-change-delivery");
    const reverseKeys = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(reverseKeys);
      if (value !== null && typeof value === "object") {
        return Object.fromEntries(Object.entries(value).reverse().map(([key, child]) => [key, reverseKeys(child)]));
      }
      return value;
    };
    const reordered = reverseKeys(source) as typeof source;
    const registry = registryFor([source]);
    const original = compileGraph(source, registry, PORTABLE_GRAPH_CAPABILITY_CONTRACT);
    const reversed = compileGraph(reordered, registry, PORTABLE_GRAPH_CAPABILITY_CONTRACT);
    expect(original.ok).toBe(true);
    expect(reversed.ok).toBe(true);
    expect(renderGraphJson(reversed.graph!)).toBe(renderGraphJson(original.graph!));
  });
});
