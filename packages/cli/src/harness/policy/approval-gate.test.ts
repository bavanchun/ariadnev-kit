import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { captureWorkspaceSnapshot } from "../effects/workspace-drift.js";
import {
  createApprovalGate,
  createApprovalRequest,
  grantApproval,
  validateApproval,
} from "./approval-gate.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    chmodSync(root, 0o700);
    rmSync(root, { recursive: true, force: true });
  }
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "ariadnev-approval-"));
  roots.push(root);
  const workspace = join(root, "workspace");
  const runDirectory = join(root, "run");
  writeFileSync(join(root, "placeholder"), "fixture");
  return { root, workspace, runDirectory };
}

function request(workspaceDigest: string, action: unknown = { patch: "router-v2" }) {
  return createApprovalRequest({
    runId: "run.safe-change",
    graphDigest: "a".repeat(64),
    nodeId: "apply",
    nodeRef: "workspace.apply",
    effect: "workspace",
    action,
    scope: { paths: ["src/router.ts"], capabilities: ["workspace:write"] },
    workspaceDigest,
  });
}

describe("approval gate", () => {
  it("binds approval to run, graph, node, action, scope, workspace, and expiry", () => {
    const approvalRequest = request(`sha256:${"b".repeat(64)}`);
    const approval = grantApproval(approvalRequest, {
      approvedAt: "2026-08-08T10:00:00.000Z",
      expiresAt: "2026-08-08T11:00:00.000Z",
    });
    expect(validateApproval(approvalRequest, approval, { now: "2026-08-08T10:30:00.000Z" })).toEqual({ valid: true });

    expect(validateApproval({ ...approvalRequest, runId: "run.other" }, approval, { now: "2026-08-08T10:30:00.000Z" })).toMatchObject({ reason: "run-drift" });
    expect(validateApproval({ ...approvalRequest, graphDigest: "e".repeat(64) }, approval, { now: "2026-08-08T10:30:00.000Z" })).toMatchObject({ reason: "graph-drift" });
    expect(validateApproval({ ...approvalRequest, nodeRef: "workspace.other" }, approval, { now: "2026-08-08T10:30:00.000Z" })).toMatchObject({ reason: "node-drift" });
    expect(validateApproval({ ...approvalRequest, scopeDigest: `sha256:${"f".repeat(64)}` }, approval, { now: "2026-08-08T10:30:00.000Z" })).toMatchObject({ reason: "scope-drift" });

    const changedAction = request(approvalRequest.workspaceDigest, { patch: "router-v3" });
    expect(validateApproval(changedAction, approval, { now: "2026-08-08T10:30:00.000Z" })).toMatchObject({
      valid: false,
      reason: "action-drift",
    });
    const changedWorkspace = request(`sha256:${"c".repeat(64)}`);
    expect(validateApproval(changedWorkspace, approval, { now: "2026-08-08T10:30:00.000Z" })).toMatchObject({
      valid: false,
      reason: "workspace-drift",
    });
    expect(validateApproval(approvalRequest, approval, { now: "2026-08-08T11:00:00.000Z" })).toMatchObject({
      valid: false,
      reason: "expired",
    });
  });

  it("persists only sealed metadata and survives a fresh gate instance", () => {
    const { root, workspace, runDirectory } = fixture();
    writeFileSync(join(root, "workspace-file"), "outside");
    const workspaceRoot = workspace;
    // The snapshot utility owns directory creation checks; use an existing workspace.
    writeFileSync(join(root, "sensitive-action"), "must-not-be-persisted");
    mkdirSync(workspaceRoot);
    writeFileSync(join(workspaceRoot, "router.ts"), "v1\n");
    const approvalRequest = request(captureWorkspaceSnapshot(workspaceRoot).digest, { secretPatch: "must-not-be-persisted" });
    const approval = grantApproval(approvalRequest, {
      approvedAt: "2026-08-08T10:00:00.000Z",
      expiresAt: "2026-08-08T11:00:00.000Z",
    });
    createApprovalGate({ runDirectory }).record(approval);
    expect(createApprovalGate({ runDirectory }).read("apply")).toEqual({ status: "granted", approval });
    const stored = readFileSync(join(runDirectory, "approvals", "apply.json"), "utf8");
    expect(stored).not.toContain("must-not-be-persisted");
    expect(stored).toContain(approval.actionDigest);
  });

  it("durably invalidates a grant after drift", () => {
    const { runDirectory } = fixture();
    const approval = grantApproval(request(`sha256:${"d".repeat(64)}`), {
      approvedAt: "2026-08-08T10:00:00.000Z",
      expiresAt: "2026-08-08T11:00:00.000Z",
    });
    const gate = createApprovalGate({ runDirectory });
    gate.record(approval);
    gate.invalidate("apply", approval.actionDigest, "workspace-drift");
    expect(createApprovalGate({ runDirectory }).read("apply")).toMatchObject({
      status: "invalidated",
      reason: "workspace-drift",
      approval: { actionDigest: approval.actionDigest },
    });
  });
});
