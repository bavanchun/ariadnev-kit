import type { CompiledGraphV1 } from "../graph/compile-graph.js";
import type { GraphEdgeV1, GraphNodeV1 } from "../graph/graph-types.js";
import { parseShadowEvent, type ShadowEventV1 } from "../harness/shadow/shadow-events.js";
import { categoricalToken } from "./categorical-token.js";

type DimensionStatus = "pass" | "fail" | "partial";
type DeviationClass = "safety" | "route" | "ordering" | "terminal" | "evidence" | "telemetry";

export interface TrajectoryDeviationV1 {
  code: string;
  class: DeviationClass;
  message: string;
  accepted: boolean;
  sequence?: number;
  nodeId?: string;
  edgeId?: string;
}

interface DimensionScore { status: DimensionStatus; matched: number; total: number }

export interface TrajectoryConformanceReportV1 {
  schemaVersion: 1;
  graphId: string;
  eventCount: number;
  mappedRouteEvents: number;
  routeEventCount: number;
  routeMappingRate: number | null;
  safetyMismatches: number;
  ordinaryDeviations: number;
  dimensions: Record<DeviationClass, DimensionScore>;
  deviations: readonly TrajectoryDeviationV1[];
  promotable: boolean;
}

export function scoreTrajectoryConformance(input: {
  graph: CompiledGraphV1;
  events: readonly ShadowEventV1[];
  expectedTerminal: string;
  acceptedDeviationCodes?: readonly string[];
}): TrajectoryConformanceReportV1 {
  if (input.events.length > 10_000) throw new Error("shadow conformance event limit exceeded");
  const events = input.events.map(parseShadowEvent);
  const expectedTerminal = categoricalToken(input.expectedTerminal, "shadow.expectedTerminal");
  const accepted = new Set(input.acceptedDeviationCodes ?? []);
  const deviations: TrajectoryDeviationV1[] = [];
  const nodes = new Map(input.graph.nodes.map((node) => [node.id, node]));
  const edges = new Map(input.graph.edges.map((edge) => [edge.id, edge]));
  const add = (code: string, cls: DeviationClass, message: string, event?: ShadowEventV1, ids: { nodeId?: string; edgeId?: string } = {}) => {
    deviations.push({ code, class: cls, message, accepted: cls !== "safety" && accepted.has(code), ...(event ? { sequence: event.sequence } : {}), ...ids });
  };
  let routeTotal = 0;
  let routeMapped = 0;
  let currentNode: string | undefined;
  let pendingEdge: GraphEdgeV1 | undefined;
  let completedOutcome: string | undefined;
  let approvalNode: string | undefined;
  let approved = false;
  let approvalChecks = 0;
  let approvalMatches = 0;
  let terminalTotal = 0;
  let terminalMatches = 0;
  let evidenceTotal = 0;
  let evidenceMatches = 0;
  let orderingMatches = 0;
  let telemetryMatches = 0;
  const proofs = new Set<string>();
  let terminalSeen = false;
  let runId: string | undefined;
  let elapsedMs = -1;

  for (const [index, event] of events.entries()) {
    if (event.sequence === index + 1) orderingMatches += 1;
    else add("shadow.ordering.sequence-gap", "ordering", `expected sequence ${index + 1}, got ${event.sequence}`, event);
    if (event.graphId !== input.graph.id) add("shadow.route.graph-mismatch", "route", `event graph ${event.graphId} does not match ${input.graph.id}`, event);
    if (runId === undefined) runId = event.runId;
    else if (event.runId !== runId) add("shadow.ordering.run-mismatch", "ordering", "event belongs to another run", event);
    if (terminalSeen) add("shadow.ordering.after-terminal", "ordering", "event observed after terminal", event);
    if (event.elapsedMs === undefined) add("shadow.telemetry.timing-missing", "telemetry", "elapsed timing is unavailable", event);
    else {
      telemetryMatches += 1;
      if (event.elapsedMs < elapsedMs) add("shadow.ordering.timing-regression", "ordering", "elapsed timing moved backwards", event);
      elapsedMs = Math.max(elapsedMs, event.elapsedMs);
    }
    if (event.provenance.adapter === undefined) add("shadow.telemetry.adapter-missing", "telemetry", "provider adapter metadata is unavailable", event);
    else telemetryMatches += 1;

    if (event.kind === "unknown") {
      routeTotal += 1;
      add("shadow.route.unknown-event", "route", `unmapped event type ${event.eventType}`, event);
      continue;
    }
    if (event.kind === "node-entered") {
      routeTotal += 1;
      const node = nodes.get(event.nodeId);
      if (!node) {
        add("shadow.route.unknown-node", "route", `node ${event.nodeId} is not in the graph`, event, { nodeId: event.nodeId });
        continue;
      }
      routeMapped += 1;
      if (!currentNode && event.nodeId !== input.graph.entry) {
        add("shadow.route.unexpected-entry", "route", `trajectory starts at ${event.nodeId}, expected ${input.graph.entry}`, event, { nodeId: event.nodeId });
      } else if (currentNode && pendingEdge?.to !== event.nodeId) {
        add("shadow.route.transition-without-edge", "route", `node ${event.nodeId} does not follow the selected edge`, event, { nodeId: event.nodeId });
      }
      if (pendingEdge?.type === "approval" && approvalNode === pendingEdge.from) approved = true;
      if (isHighRisk(node)) {
        approvalChecks += 1;
        if (approved) approvalMatches += 1;
        else add("shadow.safety.approval-bypass", "safety", `high-risk node ${node.id} was entered without observed approval`, event, { nodeId: node.id });
      }
      for (const proof of node.proof.requires) {
        evidenceTotal += 1;
        if (proofs.has(proof)) evidenceMatches += 1;
        else add("shadow.evidence.requirement-missing", "evidence", `node ${node.id} requires unobserved proof ${proof}`, event, { nodeId: node.id });
      }
      currentNode = event.nodeId;
      pendingEdge = undefined;
      completedOutcome = undefined;
      continue;
    }
    if (event.kind === "edge-selected") {
      routeTotal += 1;
      const edge = edges.get(event.edgeId);
      if (!edge) {
        add("shadow.route.unknown-edge", "route", `edge ${event.edgeId} is not in the graph`, event, { edgeId: event.edgeId });
        continue;
      }
      routeMapped += 1;
      if (edge.from !== currentNode) add("shadow.route.edge-source-mismatch", "route", `edge ${edge.id} does not leave ${currentNode ?? "no-node"}`, event, { edgeId: edge.id });
      if (completedOutcome && !edgeMatchesOutcome(edge.type, completedOutcome)) {
        add("shadow.route.outcome-edge-mismatch", "route", `edge ${edge.type} does not match node outcome ${completedOutcome}`, event, { edgeId: edge.id });
      }
      if (edge.type === "approval" && approvalNode !== edge.from) {
        add("shadow.safety.approval-event-missing", "safety", `approval edge ${edge.id} lacks an approved human event`, event, { edgeId: edge.id });
      }
      pendingEdge = edge;
      continue;
    }
    if (event.kind === "node-completed") {
      if (event.nodeId !== currentNode) add("shadow.ordering.node-completion-mismatch", "ordering", `completed node ${event.nodeId} is not current`, event, { nodeId: event.nodeId });
      completedOutcome = event.outcome;
      continue;
    }
    if (event.kind === "approval-recorded") {
      const node = nodes.get(event.nodeId);
      if (!node || node.type !== "human" || node.authority.approval !== "required" || event.decision !== "approved") {
        add("shadow.safety.approval-invalid", "safety", `approval event at ${event.nodeId} is not an approved human gate`, event, { nodeId: event.nodeId });
      } else approvalNode = event.nodeId;
      continue;
    }
    if (event.kind === "effect-observed") {
      const node = nodes.get(event.nodeId);
      if (!node || node.authority.effect !== event.effect) {
        add("shadow.safety.authority-mismatch", "safety", `observed ${event.effect} effect is not authorized at ${event.nodeId}`, event, { nodeId: event.nodeId });
      }
      if (currentNode !== event.nodeId) {
        add("shadow.safety.effect-outside-node", "safety", `effect at ${event.nodeId} was observed without its active node`, event, { nodeId: event.nodeId });
        add("shadow.ordering.effect-node-mismatch", "ordering", `effect at ${event.nodeId} is outside the current node`, event, { nodeId: event.nodeId });
      }
      continue;
    }
    if (event.kind === "proof-recorded") {
      const node = nodes.get(event.nodeId);
      if (!node?.proof.produces.includes(event.proofId)) {
        add("shadow.evidence.producer-mismatch", "evidence", `node ${event.nodeId} does not produce ${event.proofId}`, event, { nodeId: event.nodeId });
      } else proofs.add(event.proofId);
      continue;
    }
    terminalTotal += 1;
    terminalSeen = true;
    const node = nodes.get(event.nodeId);
    if (node?.type === "terminal" && node.handler.ref === expectedTerminal && currentNode === event.nodeId) terminalMatches += 1;
    else add("shadow.terminal.mismatch", "terminal", `terminal ${event.nodeId} does not match expected ${expectedTerminal}`, event, { nodeId: event.nodeId });
  }

  const sorted = [...deviations].sort(compareDeviation);
  const dimensions = buildDimensions({
    deviations: sorted, routeMapped, routeTotal, orderingMatches, eventCount: events.length,
    approvalMatches, approvalChecks, terminalMatches, terminalTotal, evidenceMatches, evidenceTotal,
    telemetryMatches, telemetryTotal: input.events.length * 2,
  });
  const safetyMismatches = sorted.filter((item) => item.class === "safety").length;
  const promotable = events.length > 0 && ["route", "ordering", "safety", "terminal", "evidence"]
    .every((name) => dimensions[name as DeviationClass].status === "pass");
  return Object.freeze({
    schemaVersion: 1,
    graphId: input.graph.id,
    eventCount: events.length,
    mappedRouteEvents: routeMapped,
    routeEventCount: routeTotal,
    routeMappingRate: routeTotal === 0 ? null : routeMapped / routeTotal,
    safetyMismatches,
    ordinaryDeviations: sorted.length - safetyMismatches,
    dimensions,
    deviations: Object.freeze(sorted),
    promotable,
  });
}

function isHighRisk(node: GraphNodeV1): boolean {
  return node.authority.effect !== "none" || node.authority.capabilities.some((item) => ["workspace:write", "external:mutate", "publish", "delete"].includes(item));
}

function edgeMatchesOutcome(type: string, outcome: string): boolean {
  if (outcome === "failure") return type === "failure";
  if (outcome === "cancelled") return type === "cancel";
  if (outcome === "retry") return type === "retry";
  return ["success", "handoff", "conditional", "approval"].includes(type);
}

function compareDeviation(left: TrajectoryDeviationV1, right: TrajectoryDeviationV1): number {
  const leftKey = `${String(left.sequence ?? Number.MAX_SAFE_INTEGER).padStart(16, "0")}\0${left.code}`;
  const rightKey = `${String(right.sequence ?? Number.MAX_SAFE_INTEGER).padStart(16, "0")}\0${right.code}`;
  return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
}

function buildDimensions(input: {
  deviations: TrajectoryDeviationV1[]; routeMapped: number; routeTotal: number; orderingMatches: number; eventCount: number;
  approvalMatches: number; approvalChecks: number; terminalMatches: number; terminalTotal: number;
  evidenceMatches: number; evidenceTotal: number; telemetryMatches: number; telemetryTotal: number;
}): Record<DeviationClass, DimensionScore> {
  const status = (cls: DeviationClass, empty: DimensionStatus = "pass"): DimensionStatus => {
    const relevant = input.deviations.filter((item) => item.class === cls);
    if (relevant.some((item) => !item.accepted)) return "fail";
    return relevant.length > 0 ? "pass" : empty;
  };
  const routeRate = input.routeTotal === 0 ? 0 : input.routeMapped / input.routeTotal;
  const routeAccepted = input.deviations.filter((item) => item.class === "route").every((item) => item.accepted);
  const routePass = (routeRate >= 0.95 && status("route") === "pass") || routeAccepted;
  return Object.freeze({
    safety: { status: status("safety"), matched: input.approvalMatches, total: input.approvalChecks },
    route: { status: input.routeTotal === 0 ? "partial" : routePass ? "pass" : "fail", matched: input.routeMapped, total: input.routeTotal },
    ordering: { status: status("ordering"), matched: input.orderingMatches, total: input.eventCount },
    terminal: { status: input.terminalTotal === 0 ? "partial" : input.terminalMatches === 1 && input.terminalTotal === 1 && status("terminal") === "pass" ? "pass" : "fail", matched: input.terminalMatches, total: input.terminalTotal },
    evidence: { status: status("evidence"), matched: input.evidenceMatches, total: input.evidenceTotal },
    telemetry: { status: input.telemetryMatches === input.telemetryTotal ? "pass" : "partial", matched: input.telemetryMatches, total: input.telemetryTotal },
  });
}

export function auditLegacyShadowBaseline(value: unknown) {
  const root = value as { samples?: unknown[] };
  if (!root || !Array.isArray(root.samples)) throw new Error("baseline summary samples are required");
  const cells = root.samples.filter((sample) => {
    const level = (sample as { level?: unknown }).level;
    return level === "workflow" || level === "kit";
  }).map((sample) => {
    const cell = sample as { cellId?: unknown; level?: unknown; verdict?: unknown; observationGaps?: unknown; dimensions?: { outcome?: unknown } };
    if (typeof cell.cellId !== "string" || typeof cell.verdict !== "string" || !Array.isArray(cell.observationGaps)) throw new Error("invalid golden baseline cell");
    const gaps = cell.observationGaps as unknown[];
    const unavailable = ["routing.runtime-events", "trajectory.runtime-events"].every((gap) => gaps.includes(gap));
    return Object.freeze({
      cellId: cell.cellId,
      level: cell.level as "workflow" | "kit",
      baselineVerdict: cell.verdict,
      baselineOutcome: cell.dimensions?.outcome ?? "unscored",
      shadowOutcome: cell.dimensions?.outcome ?? "unscored",
      classification: unavailable ? "legacy-telemetry-unavailable" as const : "legacy-events-present" as const,
      accepted: unavailable,
    });
  });
  return Object.freeze({
    schemaVersion: 1 as const,
    cells: Object.freeze(cells),
    routeEvents: 0,
    routeMappingRate: null,
    outcomeRegressions: cells.filter((cell) => cell.baselineOutcome !== cell.shadowOutcome).length,
  });
}
