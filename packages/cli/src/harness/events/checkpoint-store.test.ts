import {
  appendFileSync,
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createCheckpointStore, resumeRun } from "./checkpoint-store.js";
import { createEventStore, type EventStoreContextV1 } from "./event-store.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    chmodSync(root, 0o700);
    rmSync(root, { recursive: true, force: true });
  }
});

function fixture(runId = "run.checkpoint") {
  const root = mkdtempSync(join(tmpdir(), "vcskill-checkpoint-"));
  roots.push(root);
  const context: EventStoreContextV1 = {
    runId,
    graph: { id: "workflow", digest: "e".repeat(64) },
    versions: { graph: "1", runner: "1", nodeAttempt: "1", idempotency: "1" },
  };
  const events = createEventStore({ root, context });
  const checkpoints = createCheckpointStore({ root, runId });
  return { root, context, events, checkpoints };
}

function pending(runId = "run.checkpoint") {
  const value = fixture(runId);
  value.events.append({ type: "run-created", entryNodeId: "start" });
  return value;
}

function mutateCheckpoint(
  checkpoints: ReturnType<typeof createCheckpointStore>,
  mutate: (checkpoint: Record<string, unknown>) => void,
): void {
  const checkpoint = JSON.parse(readFileSync(checkpoints.checkpointPath, "utf8")) as Record<string, unknown>;
  mutate(checkpoint);
  writeFileSync(checkpoints.checkpointPath, `${JSON.stringify(checkpoint)}\n`);
}

describe("durable execution checkpoints", () => {
  it("writes a private checkpoint through every durability boundary", () => {
    const value = pending("run.boundaries");
    const boundaries: string[] = [];
    const checkpoints = createCheckpointStore({
      root: value.root,
      runId: value.context.runId,
      onBoundary: (boundary) => boundaries.push(boundary),
    });
    expect(checkpoints.read()).toBeNull();
    const written = checkpoints.write(value.events.state()!);
    expect(checkpoints.read()).toEqual(written);
    expect(boundaries).toEqual([
      "checkpoint-temp-written",
      "checkpoint-temp-synced",
      "checkpoint-renamed",
      "checkpoint-directory-synced",
    ]);
    expect(statSync(checkpoints.checkpointPath).mode & 0o777).toBe(0o600);
  });

  it("rejects checkpoint state from another run", () => {
    const first = pending("run.first");
    const second = pending("run.second");
    expect(() => first.checkpoints.write(second.events.state()!)).toThrow(/another run/i);
  });

  it("does not follow checkpoint or temporary-file symlinks", () => {
    const first = pending("run.checkpoint-symlink");
    const victim = join(first.root, "victim");
    writeFileSync(victim, "do-not-touch");
    symlinkSync(victim, first.checkpoints.checkpointPath);
    expect(() => first.checkpoints.read()).toThrow(/regular file/i);
    rmSync(first.checkpoints.checkpointPath);
    symlinkSync(victim, `${first.checkpoints.checkpointPath}.tmp`);
    expect(() => first.checkpoints.write(first.events.state()!)).toThrow(/temporary path/i);
    expect(readFileSync(victim, "utf8")).toBe("do-not-touch");
  });

  it.each([
    ["null", () => "null", /object/i],
    ["extra field", (value: Record<string, unknown>) => ({ ...value, prompt: "private" }), /unsupported checkpoint field/i],
    ["missing field", (value: Record<string, unknown>) => { const { runId: _runId, ...rest } = value; return rest; }, /runId is required/i],
    ["schema", (value: Record<string, unknown>) => ({ ...value, schemaVersion: 2 }), /schema/i],
    ["sequence", (value: Record<string, unknown>) => ({ ...value, sequence: 0 }), /sequence/i],
    ["attempt", (value: Record<string, unknown>) => ({ ...value, attempt: -1 }), /attempt/i],
    ["digest", (value: Record<string, unknown>) => ({ ...value, stateDigest: "bad" }), /stateDigest/i],
    ["status", (value: Record<string, unknown>) => ({ ...value, status: "unknown" }), /status/i],
    ["node", (value: Record<string, unknown>) => ({ ...value, currentNodeId: "not a token" }), /categorical/i],
  ] as const)("fails closed on corrupt checkpoint %s", (_label, mutation, message) => {
    const value = pending(`run.corrupt-${_label.replaceAll(" ", "-")}`);
    value.checkpoints.write(value.events.state()!);
    const parsed = JSON.parse(readFileSync(value.checkpoints.checkpointPath, "utf8")) as Record<string, unknown>;
    const changed = mutation(parsed);
    writeFileSync(
      value.checkpoints.checkpointPath,
      typeof changed === "string" ? changed : `${JSON.stringify(changed)}\n`,
    );
    expect(() => value.checkpoints.read()).toThrow(message);
  });

  it("resumes exactly without a checkpoint and reports a recovered final tail", () => {
    const value = pending("run.no-checkpoint");
    appendFileSync(value.events.eventsPath, "{\"schemaVersion\":");
    const resumed = resumeRun({ eventStore: value.events, checkpointStore: value.checkpoints, current: value.context });
    expect(resumed).toMatchObject({ compatibility: "exact", eventsAfterCheckpoint: 1, recoveredTail: true });
    expect(resumed.digest).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("refuses resume before the first event", () => {
    const value = fixture("run.empty");
    expect(() => resumeRun({ eventStore: value.events, checkpointStore: value.checkpoints, current: value.context })).toThrow(/no committed events/i);
  });

  it.each([
    ["run ID", (context: EventStoreContextV1) => ({ ...context, runId: "run.changed" }), /run ID/i],
    ["graph ID", (context: EventStoreContextV1) => ({ ...context, graph: { ...context.graph, id: "changed" } }), /graph identity/i],
    ["graph version", (context: EventStoreContextV1) => ({ ...context, versions: { ...context.versions, graph: "2" } }), /graph contract/i],
    ["node-attempt version", (context: EventStoreContextV1) => ({ ...context, versions: { ...context.versions, nodeAttempt: "2" } }), /node-attempt/i],
  ] as const)("refuses an incompatible %s with recovery guidance", (_label, change, message) => {
    const value = pending(`run.compat-${_label.toLowerCase().replaceAll(" ", "-")}`);
    value.checkpoints.write(value.events.state()!);
    expect(() => resumeRun({
      eventStore: value.events,
      checkpointStore: value.checkpoints,
      current: change(value.context),
    })).toThrow(message);
    expect(() => resumeRun({
      eventStore: value.events,
      checkpointStore: value.checkpoints,
      current: change(value.context),
    })).toThrow(/export.*restart.*new run ID/i);
  });

  it.each([
    ["run", (checkpoint: Record<string, unknown>) => { checkpoint.runId = "run.other"; }, /run ID does not match/i],
    ["future sequence", (checkpoint: Record<string, unknown>) => { checkpoint.sequence = 2; }, /sequence exceeds/i],
    ["digest", (checkpoint: Record<string, unknown>) => { checkpoint.stateDigest = `sha256:${"f".repeat(64)}`; }, /digest does not match/i],
    ["metadata", (checkpoint: Record<string, unknown>) => { checkpoint.status = "running"; }, /metadata does not match/i],
    ["context", (checkpoint: Record<string, unknown>) => {
      checkpoint.graph = { ...(checkpoint.graph as Record<string, unknown>), digest: "f".repeat(64) };
    }, /metadata does not match/i],
  ] as const)("rejects checkpoint/event %s divergence", (_label, mutate, message) => {
    const value = pending(`run.divergence-${_label.replaceAll(" ", "-")}`);
    value.checkpoints.write(value.events.state()!);
    mutateCheckpoint(value.checkpoints, mutate);
    expect(() => resumeRun({ eventStore: value.events, checkpointStore: value.checkpoints, current: value.context })).toThrow(message);
  });
});
