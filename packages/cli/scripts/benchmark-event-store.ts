import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { createCheckpointStore } from "../src/harness/events/checkpoint-store.js";
import { createEventStore, type EventStoreContextV1 } from "../src/harness/events/event-store.js";

const ATTEMPTS = 500;
const REPLAY_REPEATS = 30;

function percentile(samples: readonly number[], quantile: number): number {
  const sorted = [...samples].sort((left, right) => left - right);
  return sorted[Math.floor((sorted.length - 1) * quantile)] ?? 0;
}

function summary(samples: readonly number[]) {
  return {
    samples: samples.length,
    p50Ms: Number(percentile(samples, 0.5).toFixed(4)),
    p95Ms: Number(percentile(samples, 0.95).toFixed(4)),
    maxMs: Number(Math.max(...samples).toFixed(4)),
  };
}

function runFixture(attempts: number, collect: boolean) {
  const root = mkdtempSync(join(tmpdir(), "ariadnev-event-benchmark-"));
  const context: EventStoreContextV1 = {
    runId: `run.benchmark-${attempts}`,
    graph: { id: "benchmark-workflow", digest: "f".repeat(64) },
    versions: { graph: "1", runner: "1", nodeAttempt: "1", idempotency: "1" },
  };
  const store = createEventStore({ root, context });
  const checkpoints = createCheckpointStore({ root, runId: context.runId });
  const appendMs: number[] = [];
  const checkpointMs: number[] = [];
  const nodeOverheadMs: number[] = [];
  store.append({ type: "run-created", entryNodeId: "benchmark" });
  checkpoints.write(store.state()!);
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const nodeStartedAt = performance.now();
    let startedAt = performance.now();
    store.append({ type: "node-started", nodeId: "benchmark", attempt });
    if (collect) appendMs.push(performance.now() - startedAt);
    startedAt = performance.now();
    checkpoints.write(store.state()!);
    if (collect) checkpointMs.push(performance.now() - startedAt);

    startedAt = performance.now();
    store.append({ type: "node-retry-scheduled", nodeId: "benchmark", attempt, reason: "transient" });
    if (collect) appendMs.push(performance.now() - startedAt);
    startedAt = performance.now();
    checkpoints.write(store.state()!);
    if (collect) checkpointMs.push(performance.now() - startedAt);
    if (collect) nodeOverheadMs.push(performance.now() - nodeStartedAt);
  }
  return { root, store, checkpoints, appendMs, checkpointMs, nodeOverheadMs };
}

const warmup = runFixture(25, false);
rmSync(warmup.root, { recursive: true, force: true });

const fixture = runFixture(ATTEMPTS, true);
try {
  const replayMs: number[] = [];
  let replayDigest = "";
  for (let index = 0; index < REPLAY_REPEATS; index += 1) {
    const startedAt = performance.now();
    const replay = fixture.store.read();
    replayMs.push(performance.now() - startedAt);
    if (replayDigest && replay.digest !== replayDigest) throw new Error("replay digest changed between benchmark repeats");
    replayDigest = replay.digest;
  }
  const output = {
    schemaVersion: 1,
    environment: {
      platform: process.platform,
      arch: process.arch,
      runtime: process.versions.bun ? `bun-${process.versions.bun}` : `node-${process.version}`,
    },
    workload: {
      attempts: ATTEMPTS,
      committedEvents: fixture.store.read().events.length,
      replayRepeats: REPLAY_REPEATS,
      eventsBytes: statSync(fixture.store.eventsPath).size,
      checkpointBytes: statSync(fixture.checkpoints.checkpointPath).size,
    },
    append: summary(fixture.appendMs),
    checkpoint: summary(fixture.checkpointMs),
    nodePersistenceOverhead: summary(fixture.nodeOverheadMs),
    replay: summary(replayMs),
    deterministicReplay: true,
    budget: { p95NodeMs: 200, passed: percentile(fixture.nodeOverheadMs, 0.95) <= 200 },
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
} finally {
  rmSync(fixture.root, { recursive: true, force: true });
}
