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
import { join } from "node:path";
import { parseStrictJson } from "../../eval/strict-json.js";
import {
  sameRunContext,
  validateRunEventContext,
  type RunContractVersionsV1,
  type RunGraphIdentityV1,
} from "./event-types.js";
import type { EventStore, EventStoreContextV1 } from "./event-store.js";
import { digestRunState, type RunStateV1, type RunStatusV1 } from "./run-state.js";
import { replayRunEvents } from "./state-reducer.js";

const STATE_DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/;
const STATUSES: readonly RunStatusV1[] = ["pending", "running", "waiting", "retrying", "completed", "failed", "cancelled"];

export type CheckpointBoundary = "checkpoint-temp-written" | "checkpoint-temp-synced" | "checkpoint-renamed" | "checkpoint-directory-synced";

export type RunCheckpointV1 = Readonly<{
  schemaVersion: 1;
  runId: string;
  sequence: number;
  stateDigest: string;
  graph: RunGraphIdentityV1;
  versions: RunContractVersionsV1;
  status: RunStatusV1;
  currentNodeId: string;
  attempt: number;
}>;

export interface CheckpointStore {
  readonly checkpointPath: string;
  write(state: RunStateV1): RunCheckpointV1;
  read(): RunCheckpointV1 | null;
}

function privateRunDirectory(root: string, runId: string): string {
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const rootStat = lstatSync(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error("checkpoint root must be a regular directory");
  chmodSync(root, 0o700);
  const path = join(root, runId);
  mkdirSync(path, { recursive: true, mode: 0o700 });
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("checkpoint run path must be a regular directory");
  chmodSync(path, 0o700);
  return path;
}

function syncDirectory(path: string): void {
  let descriptor: number | undefined;
  try {
    descriptor = openSync(path, constants.O_RDONLY);
    fsyncSync(descriptor);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (!code || !["EINVAL", "ENOTSUP", "EPERM", "EBADF"].includes(code)) throw error;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function parseCheckpoint(value: unknown): RunCheckpointV1 {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("checkpoint must be an object");
  const checkpoint = value as Record<string, unknown>;
  const fields = ["schemaVersion", "runId", "sequence", "stateDigest", "graph", "versions", "status", "currentNodeId", "attempt"];
  for (const key of Object.keys(checkpoint)) if (!fields.includes(key)) throw new Error(`unsupported checkpoint field: ${key}`);
  for (const key of fields) if (!Object.prototype.hasOwnProperty.call(checkpoint, key)) throw new Error(`checkpoint.${key} is required`);
  if (checkpoint.schemaVersion !== 1) throw new Error("checkpoint schema is unsupported");
  if (!Number.isInteger(checkpoint.sequence) || (checkpoint.sequence as number) < 1) throw new Error("checkpoint sequence must be positive");
  if (!Number.isInteger(checkpoint.attempt) || (checkpoint.attempt as number) < 0) throw new Error("checkpoint attempt must be non-negative");
  if (typeof checkpoint.stateDigest !== "string" || !STATE_DIGEST_PATTERN.test(checkpoint.stateDigest)) {
    throw new Error("checkpoint stateDigest must be a SHA-256 digest");
  }
  if (typeof checkpoint.status !== "string" || !STATUSES.includes(checkpoint.status as RunStatusV1)) {
    throw new Error("checkpoint status is unsupported");
  }
  const context = validateRunEventContext({ runId: checkpoint.runId, graph: checkpoint.graph, versions: checkpoint.versions });
  const nodeContext = validateRunEventContext({
    ...context,
    graph: { ...context.graph, id: checkpoint.currentNodeId },
  });
  return Object.freeze({
    schemaVersion: 1,
    ...context,
    sequence: checkpoint.sequence as number,
    stateDigest: checkpoint.stateDigest,
    status: checkpoint.status as RunStatusV1,
    currentNodeId: nodeContext.graph.id,
    attempt: checkpoint.attempt as number,
  });
}

export function createCheckpointStore(input: {
  root: string;
  runId: string;
  onBoundary?: (boundary: CheckpointBoundary) => void;
}): CheckpointStore {
  const context = validateRunEventContext({
    runId: input.runId,
    graph: { id: "checkpoint-validation", digest: "0".repeat(64) },
    versions: { graph: "1", runner: "1", nodeAttempt: "1", idempotency: "1" },
  });
  const runDirectory = privateRunDirectory(input.root, context.runId);
  const checkpointPath = join(runDirectory, "checkpoint.json");
  const tempPath = `${checkpointPath}.tmp`;

  return Object.freeze({
    checkpointPath,
    write(state: RunStateV1): RunCheckpointV1 {
      if (state.runId !== context.runId) throw new Error("checkpoint state belongs to another run");
      const checkpoint = parseCheckpoint({
        schemaVersion: 1,
        runId: state.runId,
        sequence: state.lastSequence,
        stateDigest: digestRunState(state),
        graph: state.graph,
        versions: state.versions,
        status: state.status,
        currentNodeId: state.currentNodeId,
        attempt: state.attempt,
      });
      if (existsSync(tempPath)) {
        const temp = lstatSync(tempPath);
        if (!temp.isFile() || temp.isSymbolicLink()) throw new Error("checkpoint temporary path must be a regular file");
      }
      const descriptor = openSync(
        tempPath,
        constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | (constants.O_NOFOLLOW ?? 0),
        0o600,
      );
      try {
        const bytes = Buffer.from(`${JSON.stringify(checkpoint)}\n`, "utf8");
        let offset = 0;
        while (offset < bytes.length) offset += writeSync(descriptor, bytes, offset, bytes.length - offset);
        chmodSync(tempPath, 0o600);
        input.onBoundary?.("checkpoint-temp-written");
        fsyncSync(descriptor);
        input.onBoundary?.("checkpoint-temp-synced");
      } finally {
        closeSync(descriptor);
      }
      renameSync(tempPath, checkpointPath);
      chmodSync(checkpointPath, 0o600);
      input.onBoundary?.("checkpoint-renamed");
      syncDirectory(runDirectory);
      input.onBoundary?.("checkpoint-directory-synced");
      return checkpoint;
    },
    read(): RunCheckpointV1 | null {
      if (!existsSync(checkpointPath)) return null;
      const stat = lstatSync(checkpointPath);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("checkpoint must be a regular file");
      chmodSync(checkpointPath, 0o600);
      try {
        return parseCheckpoint(parseStrictJson(readFileSync(checkpointPath, "utf8"), "execution checkpoint"));
      } catch (error) {
        throw new Error(`corrupt execution checkpoint: ${(error as Error).message}`);
      }
    },
  });
}

function incompatible(details: string): never {
  throw new Error(`Paused run is incompatible (${details}). Export its event stream for audit, then restart with a new run ID.`);
}

export function resumeRun(input: {
  eventStore: EventStore;
  checkpointStore: CheckpointStore;
  current: EventStoreContextV1;
  policy?: { compatibleRunnerVersions?: readonly string[] };
}): {
  state: RunStateV1;
  checkpoint: RunCheckpointV1 | null;
  eventsAfterCheckpoint: number;
  recoveredTail: boolean;
  digest: string;
  compatibility: "exact" | "runner-compatible";
} {
  const persisted = input.eventStore.context;
  const current = validateRunEventContext(input.current);
  if (persisted.runId !== current.runId) incompatible("run ID changed");
  if (persisted.graph.id !== current.graph.id || persisted.graph.digest !== current.graph.digest) incompatible("graph identity changed");
  if (persisted.versions.graph !== current.versions.graph) incompatible("graph contract version changed");
  if (persisted.versions.nodeAttempt !== current.versions.nodeAttempt) incompatible("node-attempt contract version changed");
  if (persisted.versions.idempotency !== current.versions.idempotency) incompatible("idempotency contract version changed");
  let compatibility: "exact" | "runner-compatible" = "exact";
  if (persisted.versions.runner !== current.versions.runner) {
    if (!input.policy?.compatibleRunnerVersions?.includes(persisted.versions.runner)) incompatible("runner version changed");
    compatibility = "runner-compatible";
  }

  const replay = input.eventStore.read();
  if (!replay.state) throw new Error("cannot resume a run with no committed events");
  const checkpoint = input.checkpointStore.read();
  if (checkpoint) {
    if (checkpoint.runId !== persisted.runId) throw new Error("corrupt execution checkpoint: run ID does not match event stream");
    if (checkpoint.sequence > replay.events.length) throw new Error("corrupt execution checkpoint: sequence exceeds committed events");
    const checkpointState = replayRunEvents(replay.events.slice(0, checkpoint.sequence));
    if (!checkpointState || digestRunState(checkpointState) !== checkpoint.stateDigest) {
      throw new Error("corrupt execution checkpoint: state digest does not match replay");
    }
    if (!sameRunContext(checkpointState, checkpoint)
      || checkpoint.status !== checkpointState.status
      || checkpoint.currentNodeId !== checkpointState.currentNodeId
      || checkpoint.attempt !== checkpointState.attempt) {
      throw new Error("corrupt execution checkpoint: metadata does not match replay");
    }
  }
  return Object.freeze({
    state: replay.state,
    checkpoint,
    eventsAfterCheckpoint: replay.events.length - (checkpoint?.sequence ?? 0),
    recoveredTail: replay.recoveredTail,
    digest: replay.digest,
    compatibility,
  });
}
