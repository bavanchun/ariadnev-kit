import type { CompiledGraphNodeV1, CompiledGraphV1 } from "../../graph/compile-graph.js";
import type { JsonValueV1 } from "../executors/executor.js";
import {
  createApprovalGate,
  createApprovalRequest,
  validateApproval,
  type ApprovalGrantV1,
  type ApprovalRequestV1,
  type ApprovalValidationReasonV1,
} from "../policy/approval-gate.js";
import { captureWorkspaceSnapshot, diffWorkspaceSnapshots, type WorkspaceSnapshotV1 } from "./workspace-drift.js";

export type SideEffectAuthorizationV1 = Readonly<{
  request: ApprovalRequestV1;
  granted: boolean;
  failure: ApprovalValidationReasonV1 | null;
  approvalDigest: string | null;
}>;

function actionDescriptor(
  graph: CompiledGraphV1,
  node: CompiledGraphNodeV1,
  instruction: string,
  state: Readonly<Record<string, JsonValueV1>>,
): unknown {
  const humanOwned = new Set(graph.state.fields.filter((field) => (
    graph.nodes.find((candidate) => candidate.id === field.owner)?.type === "human"
  )).map((field) => field.name));
  const reads = Object.fromEntries(node.state.reads
    .filter((field) => !humanOwned.has(field))
    .map((field) => [field, state[field]]));
  return {
    node: { id: node.id, ref: node.handler.ref, effect: node.authority.effect, capabilities: node.authority.capabilities },
    instruction,
    state: reads,
  };
}

export function authorizeSideEffect(input: {
  graph: CompiledGraphV1;
  node: CompiledGraphNodeV1;
  runId: string;
  graphDigest: string;
  runDirectory: string;
  workspaceRoot: string;
  approvalScope: readonly string[];
  before: WorkspaceSnapshotV1;
  instruction: string;
  state: Readonly<Record<string, JsonValueV1>>;
  approval?: ApprovalGrantV1;
  allowWorkspaceDrift?: boolean;
}): SideEffectAuthorizationV1 {
  if (input.node.authority.effect === "none") throw new Error("approval authorization requires a side-effect node");
  const elevated = input.node.authority.capabilities.filter((capability) => (
    ["workspace:write", "external:mutate", "publish", "delete"].includes(capability)
  ));
  const request = createApprovalRequest({
    runId: input.runId,
    graphDigest: input.graphDigest,
    nodeId: input.node.id,
    nodeRef: input.node.handler.ref,
    effect: input.node.authority.effect,
    action: actionDescriptor(input.graph, input.node, input.instruction, input.state),
    scope: { paths: input.approvalScope, capabilities: elevated },
    workspaceDigest: input.before.digest,
  });
  const gate = createApprovalGate({ runDirectory: input.runDirectory });
  let stored = gate.read(input.node.id);
  let failure: ApprovalValidationReasonV1 | null = null;

  if (input.approval) {
    const validation = validateApproval(request, input.approval);
    if (validation.valid) {
      gate.record(input.approval);
      stored = gate.read(input.node.id);
    } else failure = validation.reason;
  } else if (stored?.status === "granted") {
    const validation = validateApproval(request, stored.approval);
    if (!validation.valid) {
      failure = validation.reason;
      if (["action-drift", "scope-drift", "workspace-drift", "expired"].includes(validation.reason)) {
        gate.invalidate(input.node.id, stored.approval.actionDigest, validation.reason as "action-drift" | "scope-drift" | "workspace-drift" | "expired");
      }
      stored = gate.read(input.node.id);
    }
  }

  if (!input.allowWorkspaceDrift && failure === null && stored?.status === "granted"
    && diffWorkspaceSnapshots(input.before, captureWorkspaceSnapshot(input.workspaceRoot)).drifted) {
    failure = "workspace-drift";
    gate.invalidate(input.node.id, stored.approval.actionDigest, failure);
    stored = gate.read(input.node.id);
  }
  const granted = failure === null && stored?.status === "granted";
  return Object.freeze({
    request,
    granted,
    failure,
    approvalDigest: granted && stored?.status === "granted" ? stored.approval.approvalDigest : null,
  });
}
