import { chmodSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createCheckpointStore, resumeRun, type CheckpointBoundary } from "./checkpoint-store.js";
import { createEventStore, type EventStoreContextV1 } from "./event-store.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    chmodSync(root, 0o700);
    rmSync(root, { recursive: true, force: true });
  }
});

function fixture(runId = "run.resume") {
  const root = mkdtempSync(join(tmpdir(), "vcskill-resume-"));
  roots.push(root);
  const context: EventStoreContextV1 = {
    runId,
    graph: { id: "safe-change-delivery", digest: "b".repeat(64) },
    versions: { graph: "1.0.0", runner: "0.11.0", nodeAttempt: "1.0.0", idempotency: "1.0.0" },
  };
  return { root, context };
}

describe("checkpoint resume", () => {
  it("reuses the prepared idempotency key after a crash without duplicating the effect", () => {
    const { root, context } = fixture();
    let store = createEventStore({ root, context });
    const checkpoints = createCheckpointStore({ root, runId: context.runId });
    store.append({ type: "run-created", entryNodeId: "apply" });
    store.append({ type: "node-started", nodeId: "apply", attempt: 1 });
    checkpoints.write(store.state()!);
    store.append({ type: "effect-prepared", nodeId: "apply", attempt: 1, idempotencyKey: "run-resume-apply" });

    const applied = new Set<string>();
    let physicalEffects = 0;
    const apply = (key: string) => {
      if (!applied.has(key)) {
        applied.add(key);
        physicalEffects += 1;
      }
    };
    apply("run-resume-apply");

    store = createEventStore({ root, context });
    const resumed = resumeRun({ eventStore: store, checkpointStore: checkpoints, current: context });
    expect(resumed.eventsAfterCheckpoint).toBe(1);
    expect(resumed.state.effects["run-resume-apply"].status).toBe("prepared");
    apply("run-resume-apply");
    expect(physicalEffects).toBe(1);
    store.append({
      type: "effect-reconciled",
      nodeId: "apply",
      attempt: 1,
      idempotencyKey: "run-resume-apply",
      outcome: "committed",
    });
    expect(store.state()?.effects["run-resume-apply"].status).toBe("committed");
  });

  it.each([
    ["checkpoint-temp-written", 1],
    ["checkpoint-temp-synced", 1],
    ["checkpoint-renamed", 2],
    ["checkpoint-directory-synced", 2],
  ] as const)("recovers from a crash at %s", (boundary, visibleSequence) => {
    const { root, context } = fixture(`run.${boundary}`);
    const store = createEventStore({ root, context });
    store.append({ type: "run-created", entryNodeId: "intake" });
    const stable = createCheckpointStore({ root, runId: context.runId });
    stable.write(store.state()!);
    store.append({ type: "node-started", nodeId: "intake", attempt: 1 });

    const crashing = createCheckpointStore({
      root,
      runId: context.runId,
      onBoundary: (current: CheckpointBoundary) => {
        if (current === boundary) throw new Error(`crash:${boundary}`);
      },
    });
    expect(() => crashing.write(store.state()!)).toThrow(`crash:${boundary}`);
    expect(stable.read()?.sequence).toBe(visibleSequence);
    expect(resumeRun({ eventStore: store, checkpointStore: stable, current: context }).state.status).toBe("running");
    expect(stable.write(store.state()!).sequence).toBe(2);
  });

  it("refuses incompatible graph/idempotency versions with restart guidance", () => {
    const { root, context } = fixture("run.incompatible");
    const store = createEventStore({ root, context });
    const checkpointStore = createCheckpointStore({ root, runId: context.runId });
    store.append({ type: "run-created", entryNodeId: "intake" });
    checkpointStore.write(store.state()!);
    const changed: EventStoreContextV1 = {
      ...context,
      graph: { ...context.graph, digest: "c".repeat(64) },
      versions: { ...context.versions, idempotency: "2.0.0" },
    };
    expect(() => resumeRun({ eventStore: store, checkpointStore, current: changed })).toThrow(/export.*restart.*new run ID/i);
  });

  it("allows only an explicitly declared runner compatibility window", () => {
    const { root, context } = fixture("run.runner-upgrade");
    const store = createEventStore({ root, context });
    const checkpointStore = createCheckpointStore({ root, runId: context.runId });
    store.append({ type: "run-created", entryNodeId: "intake" });
    checkpointStore.write(store.state()!);
    const current = { ...context, versions: { ...context.versions, runner: "0.12.0" } };
    expect(() => resumeRun({ eventStore: store, checkpointStore, current })).toThrow(/runner/i);
    expect(resumeRun({
      eventStore: store,
      checkpointStore,
      current,
      policy: { compatibleRunnerVersions: ["0.11.0"] },
    }).compatibility).toBe("runner-compatible");
  });
});
