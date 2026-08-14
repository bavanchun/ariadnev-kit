import { sameRunContext, type RunEventV1 } from "./event-types.js";
import { freezeRunState, type RunEffectStateV1, type RunStateV1 } from "./run-state.js";

const TERMINAL = new Set(["completed", "failed", "cancelled"]);

function assertCurrentAttempt(state: RunStateV1, event: RunEventV1): asserts event is RunEventV1 & { nodeId: string; attempt: number } {
  if (!("nodeId" in event) || event.nodeId !== state.currentNodeId) {
    throw new Error(`event node does not match current node ${state.currentNodeId}`);
  }
  if (!("attempt" in event) || event.attempt !== state.attempt) {
    throw new Error(`event attempt does not match current attempt ${state.attempt}`);
  }
}

function assertRunning(state: RunStateV1, event: RunEventV1): void {
  if (state.status !== "running") throw new Error(`${event.type} requires a running node`);
  assertCurrentAttempt(state, event);
}

function assertNoPreparedEffects(state: RunStateV1): void {
  const unresolved = Object.entries(state.effects).find(([, effect]) => effect.status === "prepared");
  if (unresolved) throw new Error(`effect ${unresolved[0]} is unresolved and must be reconciled before transition`);
}

function updateEffect(
  state: RunStateV1,
  key: string,
  effect: RunEffectStateV1,
): Readonly<Record<string, RunEffectStateV1>> {
  return { ...state.effects, [key]: effect };
}

export function reduceRunEvent(state: RunStateV1 | null, event: RunEventV1): RunStateV1 {
  if (state === null) {
    if (event.sequence !== 1) throw new Error(`first event sequence must be 1, received ${event.sequence}`);
    if (event.type !== "run-created") throw new Error("first event must be run-created");
    return freezeRunState({
      schemaVersion: 1,
      runId: event.runId,
      graph: event.graph,
      versions: event.versions,
      status: "pending",
      lastSequence: event.sequence,
      currentNodeId: event.entryNodeId,
      attempt: 0,
      completedNodes: [],
      effects: {},
    });
  }

  if (!sameRunContext(state, event)) throw new Error("event context changed within the execution stream");
  if (event.sequence !== state.lastSequence + 1) {
    throw new Error(`event sequence must be ${state.lastSequence + 1}, received ${event.sequence}`);
  }
  if (TERMINAL.has(state.status)) throw new Error(`cannot append ${event.type} after terminal state ${state.status}`);
  if (event.type === "run-created") throw new Error("run-created may appear only once");

  const base = { ...state, lastSequence: event.sequence };
  switch (event.type) {
    case "node-started": {
      if (event.nodeId !== state.currentNodeId) throw new Error(`event node does not match current node ${state.currentNodeId}`);
      const expectedAttempt = state.status === "pending" ? 1 : state.status === "retrying" ? state.attempt + 1 : -1;
      if (expectedAttempt < 0) throw new Error("node-started requires pending or retrying state");
      if (event.attempt !== expectedAttempt) throw new Error(`node attempt must be ${expectedAttempt}`);
      return freezeRunState({ ...base, status: "running", attempt: event.attempt, waitingReason: undefined });
    }
    case "node-waiting":
      assertRunning(state, event);
      return freezeRunState({ ...base, status: "waiting", waitingReason: event.reason });
    case "node-resumed":
      if (state.status !== "waiting") throw new Error("node-resumed requires waiting state");
      assertCurrentAttempt(state, event);
      return freezeRunState({ ...base, status: "running", waitingReason: undefined });
    case "effect-prepared": {
      assertRunning(state, event);
      const prior = state.effects[event.idempotencyKey];
      if (prior && prior.status !== "not-applied") throw new Error(`idempotency key ${event.idempotencyKey} is already ${prior.status}`);
      return freezeRunState({
        ...base,
        effects: updateEffect(state, event.idempotencyKey, {
          nodeId: event.nodeId,
          attempt: event.attempt,
          status: "prepared",
        }),
      });
    }
    case "effect-committed":
    case "effect-reconciled": {
      assertRunning(state, event);
      const prior = state.effects[event.idempotencyKey];
      if (!prior || prior.status !== "prepared") throw new Error(`idempotency key ${event.idempotencyKey} is not prepared`);
      if (prior.nodeId !== event.nodeId || prior.attempt !== event.attempt) throw new Error("effect does not match its prepared node attempt");
      const status = event.type === "effect-committed" ? "committed" : event.outcome;
      return freezeRunState({ ...base, effects: updateEffect(state, event.idempotencyKey, { ...prior, status }) });
    }
    case "node-retry-scheduled":
      assertRunning(state, event);
      assertNoPreparedEffects(state);
      return freezeRunState({ ...base, status: "retrying" });
    case "node-completed":
      assertRunning(state, event);
      assertNoPreparedEffects(state);
      return freezeRunState({
        ...base,
        status: "pending",
        currentNodeId: event.nextNodeId,
        attempt: 0,
        completedNodes: [...state.completedNodes, event.nodeId],
      });
    case "run-completed":
      assertRunning(state, event);
      assertNoPreparedEffects(state);
      return freezeRunState({
        ...base,
        status: "completed",
        completedNodes: [...state.completedNodes, event.nodeId],
        terminalReason: "success",
      });
    case "run-failed":
      assertCurrentAttempt(state, event);
      assertNoPreparedEffects(state);
      return freezeRunState({ ...base, status: "failed", terminalReason: event.reason });
    case "run-cancelled":
      assertCurrentAttempt(state, event);
      assertNoPreparedEffects(state);
      return freezeRunState({ ...base, status: "cancelled", terminalReason: event.reason });
  }
}

export function replayRunEvents(events: readonly RunEventV1[]): RunStateV1 | null {
  return events.reduce<RunStateV1 | null>((state, event) => reduceRunEvent(state, event), null);
}
