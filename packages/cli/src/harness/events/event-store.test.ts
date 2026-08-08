import {
  appendFileSync,
  chmodSync,
  mkdirSync,
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
import { createEventStore, type EventStoreContextV1 } from "./event-store.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    chmodSync(root, 0o700);
    rmSync(root, { recursive: true, force: true });
  }
});

function root(): string {
  const path = mkdtempSync(join(tmpdir(), "vcskill-events-"));
  roots.push(path);
  return path;
}

function context(runId = "run.event-store"): EventStoreContextV1 {
  return {
    runId,
    graph: { id: "safe-change-delivery", digest: "a".repeat(64) },
    versions: { graph: "1.0.0", runner: "0.11.0", nodeAttempt: "1.0.0", idempotency: "1.0.0" },
  };
}

describe("strict execution event store", () => {
  it("persists a private ordered stream and replays every run state", () => {
    const store = createEventStore({ root: root(), context: context() });
    store.append({ type: "run-created", entryNodeId: "intake" });
    expect(store.state()?.status).toBe("pending");
    store.append({ type: "node-started", nodeId: "intake", attempt: 1 });
    expect(store.state()?.status).toBe("running");
    store.append({ type: "node-waiting", nodeId: "intake", attempt: 1, reason: "approval" });
    expect(store.state()?.status).toBe("waiting");
    store.append({ type: "node-resumed", nodeId: "intake", attempt: 1 });
    store.append({ type: "node-retry-scheduled", nodeId: "intake", attempt: 1, reason: "transient" });
    expect(store.state()?.status).toBe("retrying");
    store.append({ type: "node-started", nodeId: "intake", attempt: 2 });
    store.append({ type: "node-completed", nodeId: "intake", attempt: 2, nextNodeId: "complete" });
    store.append({ type: "node-started", nodeId: "complete", attempt: 1 });
    store.append({ type: "run-completed", nodeId: "complete", attempt: 1 });

    const first = store.read();
    const second = store.read();
    expect(first.events).toHaveLength(9);
    expect(first.state?.status).toBe("completed");
    expect(first.digest).toBe(second.digest);
    expect(statSync(store.runDirectory).mode & 0o777).toBe(0o700);
    expect(statSync(store.eventsPath).mode & 0o777).toBe(0o600);
  });

  it("allows only a truncated final record and rejects complete or semantic corruption", () => {
    const store = createEventStore({ root: root(), context: context("run.corruption") });
    store.append({ type: "run-created", entryNodeId: "intake" });
    store.append({ type: "node-started", nodeId: "intake", attempt: 1 });
    appendFileSync(store.eventsPath, "{\"schemaVersion\":");
    const recovered = store.read();
    expect(recovered.recoveredTail).toBe(true);
    expect(recovered.events).toHaveLength(2);

    appendFileSync(store.eventsPath, "}\n");
    expect(() => store.read()).toThrow(/corrupt execution event stream/i);
  });

  it("fails closed on reordered and semantically invalid history", () => {
    const store = createEventStore({ root: root(), context: context("run.reordered") });
    store.append({ type: "run-created", entryNodeId: "intake" });
    store.append({ type: "node-started", nodeId: "intake", attempt: 1 });
    const lines = readFileSync(store.eventsPath, "utf8").trim().split("\n").map((line) => JSON.parse(line));
    lines[1].sequence = 1;
    writeFileSync(store.eventsPath, `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`);
    expect(() => store.read()).toThrow(/sequence/i);

    lines[1].sequence = 2;
    lines[1].nodeId = "other-node";
    writeFileSync(store.eventsPath, `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`);
    expect(() => store.read()).toThrow(/current node/i);
  });

  it("stops after a disk failure without reporting false completion", () => {
    const diskFull = Object.assign(new Error("disk full"), { code: "ENOSPC" });
    const store = createEventStore({
      root: root(),
      context: context("run.disk-full"),
      writeRecord: () => { throw diskFull; },
    });
    expect(() => store.append({ type: "run-created", entryNodeId: "intake" })).toThrow(/disk full/);
    expect(() => store.append({ type: "run-created", entryNodeId: "intake" })).toThrow(/reopen/i);
    expect(store.read().state).toBeNull();
  });

  it.each(["partial-record", "full-record"] as const)("recovers safely after a %s append crash", (boundary) => {
    const storeRoot = root();
    const storeContext = context(`run.crash-${boundary}`);
    const store = createEventStore({
      root: storeRoot,
      context: storeContext,
      writeRecord: (path, record) => {
        appendFileSync(path, boundary === "partial-record" ? record.slice(0, Math.floor(record.length / 2)) : record);
        throw new Error(`crash:${boundary}`);
      },
    });
    expect(() => store.append({ type: "run-created", entryNodeId: "intake" })).toThrow(`crash:${boundary}`);
    expect(store.state()).toBeNull();

    const reopened = createEventStore({ root: storeRoot, context: storeContext });
    if (boundary === "partial-record") {
      expect(reopened.read()).toMatchObject({ recoveredTail: true, state: null });
      expect(() => reopened.append({ type: "run-created", entryNodeId: "intake" })).toThrow(/truncated tail/i);
    } else {
      expect(reopened.read()).toMatchObject({ recoveredTail: false, state: { status: "pending" } });
      expect(reopened.read().events).toHaveLength(1);
    }
  });

  it("rejects undeclared payload fields before persistence", () => {
    const store = createEventStore({ root: root(), context: context("run.redaction") });
    expect(() => store.append({
      type: "run-created",
      entryNodeId: "intake",
      prompt: "must not persist",
    } as never)).toThrow(/unsupported event field/i);
    expect(readFileSync(store.eventsPath, "utf8")).toBe("");
  });

  it("enforces event-count and file-size retention bounds", () => {
    const countStore = createEventStore({ root: root(), context: context("run.count-bound"), maxEvents: 1 });
    countStore.append({ type: "run-created", entryNodeId: "intake" });
    expect(() => countStore.append({ type: "node-started", nodeId: "intake", attempt: 1 })).toThrow(/exceeds 1 events/i);

    const sizeStore = createEventStore({ root: root(), context: context("run.size-bound"), maxFileBytes: 1 });
    expect(() => sizeStore.append({ type: "run-created", entryNodeId: "intake" })).toThrow(/exceeds 1 bytes/i);
    expect(() => sizeStore.append({ type: "run-created", entryNodeId: "intake" })).toThrow(/reopen/i);
    expect(() => createEventStore({ root: root(), context: context("run.invalid-size"), maxFileBytes: 0 })).toThrow(/maxFileBytes/i);
    expect(() => createEventStore({ root: root(), context: context("run.invalid-count"), maxEvents: 0 })).toThrow(/maxEvents/i);
  });

  it("rejects incompatible persisted and externally changed contexts", () => {
    const storeRoot = root();
    const original = context("run.context-change");
    const store = createEventStore({ root: storeRoot, context: original });
    store.append({ type: "run-created", entryNodeId: "intake" });
    const changed = { ...original, graph: { ...original.graph, digest: "b".repeat(64) } };
    expect(() => createEventStore({ root: storeRoot, context: changed })).toThrow(/incompatible run context/i);

    const event = JSON.parse(readFileSync(store.eventsPath, "utf8")) as Record<string, unknown>;
    event.graph = changed.graph;
    writeFileSync(store.eventsPath, `${JSON.stringify(event)}\n`);
    expect(() => store.read()).toThrow(/incompatible run context/i);
  });

  it("rejects symlink-backed roots and streams", () => {
    const parent = root();
    const realRoot = join(parent, "real-root");
    mkdirSync(realRoot, { mode: 0o700 });
    const linkedRoot = join(parent, "linked-root");
    symlinkSync(realRoot, linkedRoot);
    expect(() => createEventStore({ root: linkedRoot, context: context("run.linked-root") })).toThrow(/regular directory/i);

    const streamRoot = root();
    const runDirectory = join(streamRoot, "run.linked-stream");
    mkdirSync(runDirectory, { mode: 0o700 });
    const victim = join(streamRoot, "victim");
    writeFileSync(victim, "do-not-touch");
    symlinkSync(victim, join(runDirectory, "events.jsonl"));
    expect(() => createEventStore({ root: streamRoot, context: context("run.linked-stream") })).toThrow(/regular file/i);
    expect(readFileSync(victim, "utf8")).toBe("do-not-touch");
  });

  it("rejects blank, oversized, and over-retention persisted streams", () => {
    const blank = createEventStore({ root: root(), context: context("run.blank") });
    writeFileSync(blank.eventsPath, "\n");
    expect(() => blank.read()).toThrow(/blank records/i);

    const oversized = createEventStore({ root: root(), context: context("run.oversized") });
    writeFileSync(oversized.eventsPath, `${"x".repeat(65 * 1024)}\n`);
    expect(() => oversized.read()).toThrow(/size bound/i);

    const boundedRoot = root();
    const initial = createEventStore({ root: boundedRoot, context: context("run.persisted-bound") });
    initial.append({ type: "run-created", entryNodeId: "intake" });
    expect(() => createEventStore({ root: boundedRoot, context: context("run.persisted-bound"), maxFileBytes: 1 })).toThrow(/exceeds 1 bytes/i);
    expect(() => createEventStore({ root: boundedRoot, context: context("run.persisted-bound"), maxEvents: 0 })).toThrow(/maxEvents/i);
  });
});
