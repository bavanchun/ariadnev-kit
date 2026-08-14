import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { GraphIRV1, GraphNodeType } from "./graph-types.js";
import type { GraphHandlerRegistry } from "./compile-graph.js";

const here = dirname(fileURLToPath(import.meta.url));
const workflowRoot = join(here, "..", "..", "..", "..", "kit", "workflows");

export const workflowNames = ["read-only-delivery", "bugfix-delivery", "safe-change-delivery"] as const;

export function workflowFixture(name: (typeof workflowNames)[number]): GraphIRV1 {
  return JSON.parse(readFileSync(join(workflowRoot, `${name}.json`), "utf8")) as GraphIRV1;
}

export function cloneGraph(graph: GraphIRV1): GraphIRV1 {
  return JSON.parse(JSON.stringify(graph)) as GraphIRV1;
}

export function registryFor(graphs: readonly GraphIRV1[]): GraphHandlerRegistry {
  const types: GraphNodeType[] = ["skill", "agent", "tool", "function", "gate", "human", "terminal"];
  return Object.fromEntries(
    types.map((type) => [
      type,
      [...new Set(graphs.flatMap((graph) => graph.nodes.filter((node) => node.type === type).map((node) => node.handler.ref)))],
    ]),
  ) as unknown as GraphHandlerRegistry;
}
