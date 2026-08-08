import { describe, expect, it } from "vitest";
import {
  createSideEffectLease,
  markSideEffectAttempted,
  markSideEffectConfirmed,
  reconcileSideEffectLease,
  recoverSideEffectLease,
} from "./side-effect-lease.js";

function lease(attempt = 1, scopeDigest = `sha256:${"c".repeat(64)}`) {
  return createSideEffectLease({
    runId: "run.safe-change",
    graphDigest: "a".repeat(64),
    nodeId: "apply",
    attempt,
    declaredKey: "safe-change-apply",
    actionDigest: `sha256:${"b".repeat(64)}`,
    scopeDigest,
  });
}

describe("side-effect lease", () => {
  it("distinguishes planned, attempted, confirmed, and uncertain states", () => {
    const planned = lease();
    const attempted = markSideEffectAttempted(planned);
    expect(planned.status).toBe("planned");
    expect(attempted.status).toBe("attempted");
    expect(markSideEffectConfirmed(attempted, { evidenceRefs: ["src/router.ts"] })).toMatchObject({
      status: "confirmed",
      evidenceRefs: ["src/router.ts"],
    });
    expect(recoverSideEffectLease(attempted)).toMatchObject({ status: "uncertain" });
  });

  it("uses one stable idempotency key across attempts and rejects blind retry", () => {
    const first = recoverSideEffectLease(markSideEffectAttempted(lease(1)));
    const second = lease(2);
    expect(first.idempotencyKey).toBe(second.idempotencyKey);
    expect(() => markSideEffectAttempted(first)).toThrow(/reconciliation/i);
    expect(reconcileSideEffectLease(first, "not-applied")).toMatchObject({ status: "not-applied" });
  });

  it("changes the idempotency identity when the approved scope changes", () => {
    expect(lease(1).idempotencyKey).not.toBe(lease(1, `sha256:${"d".repeat(64)}`).idempotencyKey);
  });

  it("requires evidence before confirming a reconciled uncertain effect", () => {
    const uncertain = recoverSideEffectLease(markSideEffectAttempted(lease()));
    expect(() => reconcileSideEffectLease(uncertain, "confirmed")).toThrow(/evidence/i);
    expect(reconcileSideEffectLease(uncertain, "confirmed", ["reconcile:workspace-diff"])).toMatchObject({
      status: "confirmed",
      evidenceRefs: ["reconcile:workspace-diff"],
    });
  });

  it("rejects invalid transitions and mismatched action identity", () => {
    expect(() => markSideEffectConfirmed(lease(), { evidenceRefs: [] })).toThrow(/attempted/i);
    expect(() => createSideEffectLease({
      runId: "run.safe-change",
      graphDigest: "a".repeat(64),
      nodeId: "apply",
      attempt: 1,
      declaredKey: "safe-change-apply",
      actionDigest: "not-a-digest",
      scopeDigest: `sha256:${"c".repeat(64)}`,
    })).toThrow(/action digest/i);
  });
});
