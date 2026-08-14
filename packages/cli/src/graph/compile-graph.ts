import { sortFindings, finding, type GraphFinding, type GraphFindingSeverity } from "./graph-finding.js";
import type { AuthorityCapability, GraphEdgeV1, GraphIRV1, GraphNodeType, GraphNodeV1 } from "./graph-types.js";
import { lintEvidence } from "./lint-evidence.js";
import { lintRecovery } from "./lint-recovery.js";
import { lintSafety } from "./lint-safety.js";
import { lintStructure } from "./lint-structure.js";

export type GraphRuntimeCapability = "graph:approval" | "graph:interrupt" | "graph:retry" | "graph:routing";
export type GraphCapability = AuthorityCapability | GraphRuntimeCapability;

export type GraphHandlerRegistry = Readonly<Record<GraphNodeType, readonly string[]>>;

export interface GraphCapabilityContract {
  id: string;
  available: readonly GraphCapability[];
  onMissing?: Readonly<Partial<Record<GraphCapability, Extract<GraphFindingSeverity, "error" | "unsupported">>>>;
}

export interface CompiledGraphNodeV1 extends GraphNodeV1 {
  incomingEdgeIds: string[];
  outgoingEdgeIds: string[];
}

export interface CompiledGraphV1 extends Omit<GraphIRV1, "nodes"> {
  compilationVersion: 1;
  nodes: CompiledGraphNodeV1[];
}

export type CompileGraphResult =
  | { ok: true; graph: CompiledGraphV1; findings: [] }
  | { ok: false; graph: null; findings: GraphFinding[] };

export const ALL_GRAPH_CAPABILITIES: readonly GraphCapability[] = [
  "state:read", "state:write", "workspace:read", "workspace:write", "process:execute", "network:read",
  "external:mutate", "publish", "delete", "graph:approval", "graph:interrupt", "graph:retry", "graph:routing",
];

export const PORTABLE_GRAPH_CAPABILITY_CONTRACT: GraphCapabilityContract = {
  id: "portable-graph-v1",
  available: ALL_GRAPH_CAPABILITIES,
};

export function compileGraph(
  graph: GraphIRV1,
  registry: GraphHandlerRegistry,
  capabilities: GraphCapabilityContract,
): CompileGraphResult {
  const findings = [
    ...lintHandlers(graph, registry),
    ...lintCapabilities(graph, capabilities),
    ...lintStructure(graph),
    ...lintSafety(graph),
    ...lintRecovery(graph),
    ...lintEvidence(graph),
  ];
  const sorted = sortFindings(findings);
  if (sorted.length > 0) return { ok: false, graph: null, findings: sorted };
  return { ok: true, graph: normalizeGraph(graph), findings: [] };
}

function lintHandlers(graph: GraphIRV1, registry: GraphHandlerRegistry): GraphFinding[] {
  const findings: GraphFinding[] = [];
  for (const node of graph.nodes) {
    if (!registry[node.type].includes(node.handler.ref)) {
      findings.push(finding(graph.id, "graph.handler.unresolved", `${node.type} handler ${node.handler.ref} is not registered`, { nodeId: node.id }));
    }
  }
  return findings;
}

function lintCapabilities(graph: GraphIRV1, contract: GraphCapabilityContract): GraphFinding[] {
  const required = new Map<GraphCapability, string>();
  for (const node of graph.nodes) {
    for (const capability of node.authority.capabilities) if (!required.has(capability)) required.set(capability, node.id);
    if (node.authority.approval === "required" && !required.has("graph:approval")) required.set("graph:approval", node.id);
    if ((node.retry.maxAttempts > 1 || graph.edges.some((edge) => edge.from === node.id && edge.type === "retry")) && !required.has("graph:retry")) required.set("graph:retry", node.id);
    if (node.routing && !required.has("graph:routing")) required.set("graph:routing", node.id);
  }
  const cancel = graph.edges.find((edge) => edge.type === "cancel");
  if (cancel) required.set("graph:interrupt", cancel.from);
  const available = new Set(contract.available);
  return [...required.entries()]
    .filter(([capability]) => !available.has(capability))
    .map(([capability, nodeId]) => finding(
      graph.id,
      "graph.capability.unavailable",
      `capability ${capability} is unavailable in ${contract.id}`,
      { nodeId, severity: contract.onMissing?.[capability] ?? "error" },
    ));
}

function normalizeGraph(graph: GraphIRV1): CompiledGraphV1 {
  const edges = graph.edges.map(copyEdge).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const nodes = graph.nodes.map((node): CompiledGraphNodeV1 => ({
    ...copyNode(node),
    incomingEdgeIds: edges.filter((edge) => edge.to === node.id).map((edge) => edge.id),
    outgoingEdgeIds: edges.filter((edge) => edge.from === node.id).map((edge) => edge.id),
  })).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return {
    compilationVersion: 1,
    schemaVersion: 1,
    id: graph.id,
    title: graph.title,
    description: graph.description,
    versions: {
      graph: graph.versions.graph,
      skills: graph.versions.skills,
      policy: graph.versions.policy,
      evaluator: graph.versions.evaluator,
    },
    entry: graph.entry,
    state: { fields: graph.state.fields.map((field) => ({
      name: field.name,
      type: field.type,
      scope: field.scope,
      owner: field.owner,
      redaction: field.redaction,
      required: field.required,
    })).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0) },
    nodes,
    edges,
  };
}

function copyNode(node: GraphNodeV1): GraphNodeV1 {
  return {
    id: node.id,
    type: node.type,
    handler: { kind: node.handler.kind, ref: node.handler.ref },
    state: { reads: [...node.state.reads].sort(), writes: [...node.state.writes].sort() },
    authority: {
      capabilities: [...node.authority.capabilities].sort(),
      effect: node.authority.effect,
      approval: node.authority.approval,
      idempotency: node.authority.idempotency,
      ...(node.authority.idempotencyKey ? { idempotencyKey: node.authority.idempotencyKey } : {}),
    },
    proof: { requires: [...node.proof.requires].sort(), produces: [...node.proof.produces].sort() },
    timeoutMs: node.timeoutMs,
    retry: { maxAttempts: node.retry.maxAttempts, backoffMs: node.retry.backoffMs, on: [...node.retry.on].sort() },
    redaction: { input: node.redaction.input, output: node.redaction.output, logs: node.redaction.logs },
    ...(node.routing ? { routing: {
      strategy: node.routing.strategy,
      allowedTargets: [...node.routing.allowedTargets].sort(),
      fallback: node.routing.fallback,
    } } : {}),
  };
}

function copyEdge(edge: GraphEdgeV1): GraphEdgeV1 {
  return {
    id: edge.id,
    from: edge.from,
    to: edge.to,
    type: edge.type,
    ...(edge.condition ? { condition: {
      field: edge.condition.field,
      operator: edge.condition.operator,
      value: edge.condition.value,
    } } : {}),
  };
}
