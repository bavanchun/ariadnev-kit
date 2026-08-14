import { constants, chmodSync, closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { categoricalToken } from "../../eval/categorical-token.js";
import type { CompiledGraphV1 } from "../../graph/compile-graph.js";
import { createShadowEvent, parseShadowEvent, type ShadowEventPayloadV1, type ShadowEventV1 } from "./shadow-events.js";

const MAX_SHADOW_FILE_BYTES = 16 * 1024 * 1024;

export interface ShadowSink {
  append(event: ShadowEventV1): void;
}

export interface ShadowRun {
  record(payload: ShadowEventPayloadV1): ShadowEventV1;
  attemptExecution(nodeId: string): never;
  finish(): readonly ShadowEventV1[];
}

export function createShadowRun(input: {
  graph: CompiledGraphV1;
  runId: string;
  sink?: ShadowSink;
}): ShadowRun {
  const runId = categoricalToken(input.runId, "shadow.runId");
  const sink = input.sink ?? createLocalShadowSink({ runId });
  const nodeIds = new Set(input.graph.nodes.map((node) => node.id));
  const events: ShadowEventV1[] = [];
  let finished = false;
  return Object.freeze({
    record(payload: ShadowEventPayloadV1): ShadowEventV1 {
      if (finished) throw new Error("shadow run is finished");
      const event = createShadowEvent({
        graphId: input.graph.id,
        runId,
        sequence: events.length + 1,
        ...payload,
      });
      sink.append(event);
      events.push(event);
      return event;
    },
    attemptExecution(nodeId: string): never {
      if (!nodeIds.has(nodeId)) throw new Error(`shadow node does not resolve: ${nodeId}`);
      throw new Error(`shadow mode is observational and cannot invoke node ${nodeId}`);
    },
    finish(): readonly ShadowEventV1[] {
      finished = true;
      return Object.freeze([...events]);
    },
  });
}

export function createLocalShadowSink(input: {
  root?: string;
  runId: string;
  maxEvents?: number;
}): ShadowSink {
  const runId = categoricalToken(input.runId, "shadow.runId");
  const root = input.root ?? join(homedir(), ".ariadnev", "shadow");
  const maxEvents = input.maxEvents ?? 10_000;
  if (!Number.isInteger(maxEvents) || maxEvents < 1) throw new Error("shadow maxEvents must be positive");
  mkdirSync(root, { recursive: true, mode: 0o700 });
  if (!lstatSync(root).isDirectory() || lstatSync(root).isSymbolicLink()) {
    throw new Error("shadow root must be a regular directory");
  }
  chmodSync(root, 0o700);
  const path = join(root, `${runId}.jsonl`);
  let count = 0;
  if (existsSync(path)) {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("shadow event log must be a regular file");
    if (statSync(path).size > MAX_SHADOW_FILE_BYTES) throw new Error("shadow event log exceeds the retention bound");
    chmodSync(path, 0o600);
    count = readFileSync(path, "utf8").split("\n").filter(Boolean).length;
  }
  return Object.freeze({
    append(event: ShadowEventV1): void {
      const safeEvent = parseShadowEvent(event);
      if (safeEvent.runId !== runId) throw new Error("shadow event belongs to another run");
      if (count >= maxEvents) throw new Error(`shadow event limit exceeded: ${maxEvents}`);
      const descriptor = openSync(
        path,
        constants.O_WRONLY | constants.O_CREAT | constants.O_APPEND | (constants.O_NOFOLLOW ?? 0),
        0o600,
      );
      try {
        writeFileSync(descriptor, `${JSON.stringify(safeEvent)}\n`);
      } finally {
        closeSync(descriptor);
      }
      chmodSync(path, 0o600);
      count += 1;
    },
  });
}
