export type GraphNodeType = "skill" | "agent" | "tool" | "function" | "gate" | "human" | "terminal";
export type GraphEdgeType = "success" | "failure" | "conditional" | "retry" | "handoff" | "approval" | "cancel";

export type StateRedaction = "public" | "internal" | "sensitive";
export type StateScope = "run" | "workflow";
export type StateValueType = "string" | "number" | "boolean" | "object" | "array";
export type AuthorityCapability =
  | "state:read"
  | "state:write"
  | "workspace:read"
  | "workspace:write"
  | "process:execute"
  | "network:read"
  | "external:mutate"
  | "publish"
  | "delete";

export interface GraphVersionsV1 {
  graph: string;
  skills: string;
  policy: string;
  evaluator: string;
}

export interface GraphStateFieldV1 {
  name: string;
  type: StateValueType;
  scope: StateScope;
  owner: string;
  redaction: StateRedaction;
  required: boolean;
}

export interface GraphNodeV1 {
  id: string;
  type: GraphNodeType;
  handler: { kind: GraphNodeType; ref: string };
  state: { reads: string[]; writes: string[] };
  authority: {
    capabilities: AuthorityCapability[];
    effect: "none" | "workspace" | "external";
    approval: "none" | "required";
    idempotency: "none" | "required";
    idempotencyKey?: string;
  };
  proof: { requires: string[]; produces: string[] };
  timeoutMs: number;
  retry: { maxAttempts: number; backoffMs: number; on: Array<"transient" | "timeout" | "conflict"> };
  redaction: { input: StateRedaction; output: StateRedaction; logs: "metadata-only" | "redacted" };
  routing?: { strategy: "model"; allowedTargets: string[]; fallback: string };
}

export interface GraphEdgeV1 {
  id: string;
  from: string;
  to: string;
  type: GraphEdgeType;
  condition?: {
    field: string;
    operator: "equals" | "not-equals";
    value: string | number | boolean | null;
  };
}

export interface GraphIRV1 {
  schemaVersion: 1;
  id: string;
  title: string;
  description: string;
  versions: GraphVersionsV1;
  entry: string;
  state: { fields: GraphStateFieldV1[] };
  nodes: GraphNodeV1[];
  edges: GraphEdgeV1[];
}
