import { createHash } from "node:crypto";
import type { RunContractVersionsV1, RunGraphIdentityV1 } from "./event-types.js";

export type RunStatusV1 = "pending" | "running" | "waiting" | "retrying" | "completed" | "failed" | "cancelled";
export type EffectStatusV1 = "prepared" | "committed" | "not-applied";

export type RunEffectStateV1 = Readonly<{
  nodeId: string;
  attempt: number;
  status: EffectStatusV1;
}>;

export type RunStateV1 = Readonly<{
  schemaVersion: 1;
  runId: string;
  graph: RunGraphIdentityV1;
  versions: RunContractVersionsV1;
  status: RunStatusV1;
  lastSequence: number;
  currentNodeId: string;
  attempt: number;
  completedNodes: readonly string[];
  effects: Readonly<Record<string, RunEffectStateV1>>;
  waitingReason?: "approval" | "input";
  terminalReason?: string;
}>;

export function freezeRunState(state: RunStateV1): RunStateV1 {
  const effects = Object.fromEntries(
    Object.entries(state.effects).map(([key, effect]) => [key, Object.freeze({ ...effect })]),
  );
  return Object.freeze({
    ...state,
    graph: Object.freeze({ ...state.graph }),
    versions: Object.freeze({ ...state.versions }),
    completedNodes: Object.freeze([...state.completedNodes]),
    effects: Object.freeze(effects),
  });
}

function canonicalState(state: RunStateV1 | null): unknown {
  if (state === null) return null;
  const effects = Object.fromEntries(Object.keys(state.effects).sort().map((key) => [key, state.effects[key]]));
  return {
    schemaVersion: state.schemaVersion,
    runId: state.runId,
    graph: state.graph,
    versions: state.versions,
    status: state.status,
    lastSequence: state.lastSequence,
    currentNodeId: state.currentNodeId,
    attempt: state.attempt,
    completedNodes: state.completedNodes,
    effects,
    ...(state.waitingReason !== undefined ? { waitingReason: state.waitingReason } : {}),
    ...(state.terminalReason !== undefined ? { terminalReason: state.terminalReason } : {}),
  };
}

export function digestRunState(state: RunStateV1 | null): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(canonicalState(state))).digest("hex")}`;
}
