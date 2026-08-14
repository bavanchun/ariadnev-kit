import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { captureWorkspaceSnapshot } from "./workspace-drift.js";
import { createEffectIntent, createEffectIntentStore } from "./effect-intent-store.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("effect intent store", () => {
  it("persists private pre-effect fingerprints without raw action content", () => {
    const root = mkdtempSync(join(tmpdir(), "ariadnev-effect-intent-"));
    roots.push(root);
    const workspaceRoot = join(root, "workspace");
    const runDirectory = join(root, "runs", "run.safe-change");
    mkdirSync(workspaceRoot, { recursive: true });
    writeFileSync(join(workspaceRoot, "router.ts"), "secret source content\n");
    const intent = createEffectIntent({
      runId: "run.safe-change",
      graphDigest: "a".repeat(64),
      nodeId: "apply",
      attempt: 1,
      idempotencyKey: "safe-change-apply.0123456789abcdef",
      actionDigest: `sha256:${"b".repeat(64)}`,
      approvalDigest: `sha256:${"c".repeat(64)}`,
      effect: "workspace",
      workspaceScope: ["router.ts"],
      externalScope: [],
      before: captureWorkspaceSnapshot(workspaceRoot),
    });
    const store = createEffectIntentStore({ runDirectory });
    store.record(intent);

    expect(createEffectIntentStore({ runDirectory }).read(intent.idempotencyKey)).toEqual(intent);
    const path = join(runDirectory, "effects", `${intent.idempotencyKey}.json`);
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(readFileSync(path, "utf8")).not.toContain("secret source content");
  });

  it("rejects tampering with recorded pre-effect evidence", () => {
    const root = mkdtempSync(join(tmpdir(), "ariadnev-effect-intent-"));
    roots.push(root);
    const workspaceRoot = join(root, "workspace");
    const runDirectory = join(root, "runs", "run.safe-change");
    mkdirSync(workspaceRoot, { recursive: true });
    const intent = createEffectIntent({
      runId: "run.safe-change",
      graphDigest: "a".repeat(64),
      nodeId: "apply",
      attempt: 1,
      idempotencyKey: "safe-change-apply.0123456789abcdef",
      actionDigest: `sha256:${"b".repeat(64)}`,
      approvalDigest: `sha256:${"c".repeat(64)}`,
      effect: "external",
      workspaceScope: [],
      externalScope: ["github/issues/42"],
      before: captureWorkspaceSnapshot(workspaceRoot),
    });
    const store = createEffectIntentStore({ runDirectory });
    store.record(intent);
    const path = join(runDirectory, "effects", `${intent.idempotencyKey}.json`);
    writeFileSync(path, readFileSync(path, "utf8").replace("github/issues/42", "github/issues/43"));
    expect(() => store.read(intent.idempotencyKey)).toThrow(/seal|digest/i);
  });
});
