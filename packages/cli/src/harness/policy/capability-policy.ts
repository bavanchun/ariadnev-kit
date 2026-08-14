import type { CompiledGraphNodeV1 } from "../../graph/compile-graph.js";
import type { AuthorityCapability } from "../../graph/graph-types.js";

export type CapabilityPolicyModeV1 = "read-only" | "workspace-change";

export type CapabilityPolicyV1 = Readonly<{
  schemaVersion: 1;
  mode: CapabilityPolicyModeV1;
  grants: readonly AuthorityCapability[];
}>;

export type CapabilityPolicyDecisionV1 = Readonly<{
  decision: "allow" | "deny" | "require-approval";
  violations: readonly string[];
}>;

const KNOWN_CAPABILITIES: readonly AuthorityCapability[] = [
  "state:read",
  "state:write",
  "workspace:read",
  "workspace:write",
  "process:execute",
  "network:read",
  "external:mutate",
  "publish",
  "delete",
];

const ELEVATED = new Set<AuthorityCapability>([
  "workspace:write",
  "external:mutate",
  "publish",
  "delete",
]);

export function createCapabilityPolicy(input: {
  mode: CapabilityPolicyModeV1;
  grants?: readonly AuthorityCapability[];
}): CapabilityPolicyV1 {
  if (input.mode !== "read-only" && input.mode !== "workspace-change") throw new Error("capability policy mode is unsupported");
  const grants = input.grants ?? [];
  for (const capability of grants) {
    if (!KNOWN_CAPABILITIES.includes(capability)) throw new Error(`capability policy grant is unknown: ${String(capability)}`);
  }
  if (new Set(grants).size !== grants.length) throw new Error("capability policy grants must be unique");
  return Object.freeze({ schemaVersion: 1, mode: input.mode, grants: Object.freeze([...grants].sort()) });
}

export function evaluateCapabilityPolicy(input: {
  node: CompiledGraphNodeV1;
  policy: CapabilityPolicyV1;
}): CapabilityPolicyDecisionV1 {
  const violations: string[] = [];
  const capabilities = input.node.authority.capabilities as readonly string[];
  for (const capability of capabilities) {
    if (!KNOWN_CAPABILITIES.includes(capability as AuthorityCapability)) {
      violations.push(`node ${input.node.id} declares unknown capability ${capability}`);
      continue;
    }
    if (ELEVATED.has(capability as AuthorityCapability)
      && (input.policy.mode === "read-only" || !input.policy.grants.includes(capability as AuthorityCapability))) {
      violations.push(`node ${input.node.id} requires ${capability}`);
    }
    if (ELEVATED.has(capability as AuthorityCapability) && input.node.authority.approval !== "required") {
      violations.push(`node ${input.node.id} requires approval for ${capability}`);
    }
  }

  if (input.node.authority.effect === "workspace" && !capabilities.includes("workspace:write")) {
    violations.push(`node ${input.node.id} declares a workspace effect without workspace:write authority`);
  }
  if (input.node.authority.effect === "external" && !capabilities.includes("external:mutate")) {
    violations.push(`node ${input.node.id} declares an external effect without external:mutate authority`);
  }
  if (input.node.authority.effect !== "none"
    && (input.node.authority.idempotency !== "required" || !input.node.authority.idempotencyKey)) {
    violations.push(`node ${input.node.id} declares an effect without idempotency authority`);
  }

  const unique = Object.freeze([...new Set(violations)].sort());
  if (unique.length > 0) return Object.freeze({ decision: "deny", violations: unique });
  const requiresApproval = input.node.authority.effect !== "none"
    || capabilities.some((capability) => ELEVATED.has(capability as AuthorityCapability));
  return Object.freeze({
    decision: requiresApproval ? "require-approval" : "allow",
    violations: unique,
  });
}

export const AUTHORITY_CAPABILITIES = Object.freeze([...KNOWN_CAPABILITIES]);
