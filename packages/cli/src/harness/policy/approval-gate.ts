import { createHash } from "node:crypto";
import {
  chmodSync,
  closeSync,
  constants,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  writeSync,
} from "node:fs";
import { isAbsolute, join } from "node:path";
import { categoricalToken, sha256Digest } from "../../eval/categorical-token.js";
import { parseStrictJson } from "../../eval/strict-json.js";
import type { AuthorityCapability } from "../../graph/graph-types.js";

export type ApprovalScopeV1 = Readonly<{
  paths: readonly string[];
  capabilities: readonly AuthorityCapability[];
}>;

export type ApprovalRequestV1 = Readonly<{
  schemaVersion: 1;
  runId: string;
  graphDigest: string;
  nodeId: string;
  nodeRef: string;
  effect: "workspace" | "external";
  actionDigest: string;
  scope: ApprovalScopeV1;
  scopeDigest: string;
  workspaceDigest: string;
}>;

export type ApprovalGrantV1 = Readonly<ApprovalRequestV1 & {
  approvedAt: string;
  expiresAt: string;
  approvalDigest: string;
}>;

export type ApprovalInvalidationReasonV1 = "action-drift" | "scope-drift" | "workspace-drift" | "expired";
export type ApprovalValidationReasonV1 = ApprovalInvalidationReasonV1 | "run-drift" | "graph-drift" | "node-drift";

export type StoredApprovalV1 = Readonly<{
  status: "granted" | "invalidated";
  approval: ApprovalGrantV1;
  reason?: ApprovalInvalidationReasonV1;
}>;

const GRAPH_DIGEST = /^[a-f0-9]{64}$/;
const INVALIDATION_REASONS: readonly ApprovalInvalidationReasonV1[] = ["action-drift", "scope-drift", "workspace-drift", "expired"];

function canonical(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object" && value !== null && Object.getPrototypeOf(value) === Object.prototype) {
    return `{${Object.keys(value as object).sort().map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  throw new Error("approval action must contain finite JSON values");
}

function digest(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonical(value)).digest("hex")}`;
}

function timestamp(value: string, label: string): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value)) || new Date(value).toISOString() !== value) {
    throw new Error(`${label} must be a canonical ISO timestamp`);
  }
  return value;
}

function normalizeScope(scope: ApprovalScopeV1): ApprovalScopeV1 {
  if (!Array.isArray(scope.paths) || scope.paths.length === 0) throw new Error("approval scope requires at least one path");
  const paths = scope.paths.map((path) => {
    if (typeof path !== "string" || path.length === 0 || path.includes("\0") || path.includes("\\") || isAbsolute(path)
      || path.split("/").some((segment) => segment === "." || segment === "..")) {
      throw new Error("approval scope paths must be safe and workspace-relative");
    }
    return path;
  }).sort();
  const capabilities = scope.capabilities.map((capability) => categoricalToken(capability, "approval scope capability") as AuthorityCapability).sort();
  if (new Set(paths).size !== paths.length || new Set(capabilities).size !== capabilities.length) {
    throw new Error("approval scope values must be unique");
  }
  return Object.freeze({ paths: Object.freeze(paths), capabilities: Object.freeze(capabilities) });
}

export function createApprovalRequest(input: {
  runId: string;
  graphDigest: string;
  nodeId: string;
  nodeRef: string;
  effect: "workspace" | "external";
  action: unknown;
  scope: ApprovalScopeV1;
  workspaceDigest: string;
}): ApprovalRequestV1 {
  if (!GRAPH_DIGEST.test(input.graphDigest)) throw new Error("approval graph digest is invalid");
  if (input.effect !== "workspace" && input.effect !== "external") throw new Error("approval effect is unsupported");
  const scope = normalizeScope(input.scope);
  return Object.freeze({
    schemaVersion: 1,
    runId: categoricalToken(input.runId, "approval run ID"),
    graphDigest: input.graphDigest,
    nodeId: categoricalToken(input.nodeId, "approval node ID"),
    nodeRef: categoricalToken(input.nodeRef, "approval node ref"),
    effect: input.effect,
    actionDigest: digest(input.action),
    scope,
    scopeDigest: digest(scope),
    workspaceDigest: sha256Digest(input.workspaceDigest, "approval workspace digest"),
  });
}

export function grantApproval(
  request: ApprovalRequestV1,
  input: { approvedAt?: string; expiresAt: string },
): ApprovalGrantV1 {
  const approvedAt = timestamp(input.approvedAt ?? new Date().toISOString(), "approval approvedAt");
  const expiresAt = timestamp(input.expiresAt, "approval expiresAt");
  if (Date.parse(expiresAt) <= Date.parse(approvedAt)) throw new Error("approval expiry must be after approval time");
  const fields = { ...request, approvedAt, expiresAt };
  return Object.freeze({ ...fields, approvalDigest: digest(fields) });
}

export function validateApproval(
  request: ApprovalRequestV1,
  approval: ApprovalGrantV1,
  input: { now?: string } = {},
): Readonly<{ valid: true } | { valid: false; reason: ApprovalValidationReasonV1 }> {
  const comparisons: Array<[boolean, ApprovalValidationReasonV1]> = [
    [approval.runId === request.runId, "run-drift"],
    [approval.graphDigest === request.graphDigest, "graph-drift"],
    [approval.nodeId === request.nodeId && approval.nodeRef === request.nodeRef && approval.effect === request.effect, "node-drift"],
    [approval.actionDigest === request.actionDigest, "action-drift"],
    [approval.scopeDigest === request.scopeDigest, "scope-drift"],
    [approval.workspaceDigest === request.workspaceDigest, "workspace-drift"],
  ];
  for (const [matches, reason] of comparisons) if (!matches) return Object.freeze({ valid: false, reason });
  const now = timestamp(input.now ?? new Date().toISOString(), "approval validation time");
  if (Date.parse(now) >= Date.parse(approval.expiresAt)) return Object.freeze({ valid: false, reason: "expired" });
  return Object.freeze({ valid: true });
}

function exactObject(value: unknown, fields: readonly string[], label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`);
  const object = value as Record<string, unknown>;
  if (Object.keys(object).some((key) => !fields.includes(key)) || fields.some((key) => !(key in object))) {
    throw new Error(`${label} fields are invalid`);
  }
  return object;
}

function parseGrant(value: unknown): ApprovalGrantV1 {
  const fields = ["schemaVersion", "runId", "graphDigest", "nodeId", "nodeRef", "effect", "actionDigest", "scope", "scopeDigest", "workspaceDigest", "approvedAt", "expiresAt", "approvalDigest"];
  const object = exactObject(value, fields, "stored approval");
  if (object.schemaVersion !== 1 || !GRAPH_DIGEST.test(String(object.graphDigest))) throw new Error("stored approval contract is invalid");
  const scopeObject = exactObject(object.scope, ["paths", "capabilities"], "stored approval scope");
  const scope = normalizeScope(scopeObject as ApprovalScopeV1);
  const grant = Object.freeze({ ...object, scope }) as ApprovalGrantV1;
  categoricalToken(grant.runId, "stored approval run ID");
  categoricalToken(grant.nodeId, "stored approval node ID");
  categoricalToken(grant.nodeRef, "stored approval node ref");
  if (grant.effect !== "workspace" && grant.effect !== "external") throw new Error("stored approval effect is unsupported");
  sha256Digest(grant.actionDigest, "stored approval action digest");
  sha256Digest(grant.scopeDigest, "stored approval scope digest");
  sha256Digest(grant.workspaceDigest, "stored approval workspace digest");
  sha256Digest(grant.approvalDigest, "stored approval digest");
  timestamp(grant.approvedAt, "stored approval approvedAt");
  timestamp(grant.expiresAt, "stored approval expiresAt");
  const { approvalDigest, ...unsigned } = grant;
  if (digest(unsigned) !== approvalDigest || digest(scope) !== grant.scopeDigest) throw new Error("stored approval digest does not match its metadata");
  return grant;
}

function syncDirectory(path: string): void {
  const descriptor = openSync(path, constants.O_RDONLY);
  try {
    fsyncSync(descriptor);
  } catch (error) {
    if (!(["EINVAL", "ENOTSUP", "EPERM", "EBADF"] as Array<string | undefined>).includes((error as NodeJS.ErrnoException).code)) throw error;
  } finally {
    closeSync(descriptor);
  }
}

export function createApprovalGate(input: { runDirectory: string }) {
  if (!isAbsolute(input.runDirectory)) throw new Error("approval run directory must be absolute");
  mkdirSync(input.runDirectory, { recursive: true, mode: 0o700 });
  const directory = join(input.runDirectory, "approvals");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  const pathFor = (nodeId: string) => join(directory, `${categoricalToken(nodeId, "approval node ID")}.json`);

  const write = (stored: StoredApprovalV1) => {
    const body = { ...stored, seal: digest(stored) };
    const path = pathFor(stored.approval.nodeId);
    const temporary = `${path}.tmp`;
    if (existsSync(temporary) && (!lstatSync(temporary).isFile() || lstatSync(temporary).isSymbolicLink())) throw new Error("approval temporary path is unsafe");
    const descriptor = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | (constants.O_NOFOLLOW ?? 0), 0o600);
    try {
      const bytes = Buffer.from(`${JSON.stringify(body)}\n`, "utf8");
      let offset = 0;
      while (offset < bytes.length) offset += writeSync(descriptor, bytes, offset, bytes.length - offset);
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
    chmodSync(temporary, 0o600);
    renameSync(temporary, path);
    chmodSync(path, 0o600);
    syncDirectory(directory);
  };

  const read = (nodeId: string): StoredApprovalV1 | null => {
    const path = pathFor(nodeId);
    if (!existsSync(path)) return null;
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("stored approval path is unsafe");
    const parsed = parseStrictJson(readFileSync(path, "utf8"), "stored approval envelope");
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("stored approval envelope must be an object");
    const object = parsed as Record<string, unknown>;
    const allowed = ["status", "approval", "reason", "seal"];
    if (Object.keys(object).some((key) => !allowed.includes(key)) || !Object.prototype.hasOwnProperty.call(object, "status")
      || !Object.prototype.hasOwnProperty.call(object, "approval") || !Object.prototype.hasOwnProperty.call(object, "seal")) {
      throw new Error("stored approval envelope fields are invalid");
    }
    const approval = parseGrant(object.approval);
    const status = object.status;
    const reason = object.reason;
    if ((status !== "granted" && status !== "invalidated") || (status === "granted" && reason !== undefined)
      || (status === "invalidated" && !INVALIDATION_REASONS.includes(reason as ApprovalInvalidationReasonV1))) {
      throw new Error("stored approval lifecycle is invalid");
    }
    const stored = Object.freeze({ status, approval, ...(reason ? { reason } : {}) }) as StoredApprovalV1;
    if (digest(stored) !== object.seal) throw new Error("stored approval seal does not match its metadata");
    return stored;
  };

  return Object.freeze({
    record(approval: ApprovalGrantV1): void {
      parseGrant(approval);
      write(Object.freeze({ status: "granted", approval }));
    },
    read,
    invalidate(nodeId: string, actionDigest: string, reason: ApprovalInvalidationReasonV1): void {
      const stored = read(nodeId);
      if (!stored || stored.status !== "granted") throw new Error("approval must be granted before invalidation");
      if (stored.approval.actionDigest !== actionDigest) throw new Error("approval action does not match invalidation request");
      if (!INVALIDATION_REASONS.includes(reason)) throw new Error("approval invalidation reason is unsupported");
      write(Object.freeze({ status: "invalidated", approval: stored.approval, reason }));
    },
  });
}
