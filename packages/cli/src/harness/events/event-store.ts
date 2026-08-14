import {
  chmodSync,
  closeSync,
  constants,
  existsSync,
  fsyncSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseStrictJson } from "../../eval/strict-json.js";
import {
  createRunEvent,
  parseRunEvent,
  sameRunContext,
  validateRunEventContext,
  type RunEventContextV1,
  type RunEventPayloadV1,
  type RunEventV1,
} from "./event-types.js";
import { digestRunState, type RunStateV1 } from "./run-state.js";
import { reduceRunEvent, replayRunEvents } from "./state-reducer.js";

const DEFAULT_MAX_FILE_BYTES = 64 * 1024 * 1024;
const DEFAULT_MAX_EVENTS = 100_000;
const MAX_EVENT_BYTES = 64 * 1024;

export type EventStoreContextV1 = RunEventContextV1;
export type EventRecordWriter = (path: string, record: string) => void;

export interface EventStoreReadResult {
  events: readonly RunEventV1[];
  state: RunStateV1 | null;
  recoveredTail: boolean;
  digest: string;
}

export interface EventStore {
  readonly context: EventStoreContextV1;
  readonly runDirectory: string;
  readonly eventsPath: string;
  append(payload: RunEventPayloadV1): RunEventV1;
  state(): RunStateV1 | null;
  read(): EventStoreReadResult;
}

function privateDirectory(path: string): void {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`execution store path must be a regular directory: ${path}`);
  chmodSync(path, 0o700);
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

function ensurePrivateFile(path: string, parent: string): void {
  const existed = existsSync(path);
  if (existed) {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("execution event stream must be a regular file");
  }
  const descriptor = openSync(
    path,
    constants.O_WRONLY | constants.O_CREAT | constants.O_APPEND | (constants.O_NOFOLLOW ?? 0),
    0o600,
  );
  closeSync(descriptor);
  chmodSync(path, 0o600);
  if (!existed) syncDirectory(parent);
}

function durableAppend(path: string, record: string): void {
  const descriptor = openSync(
    path,
    constants.O_WRONLY | constants.O_APPEND | (constants.O_NOFOLLOW ?? 0),
    0o600,
  );
  try {
    const bytes = Buffer.from(record, "utf8");
    let offset = 0;
    while (offset < bytes.length) offset += writeSync(descriptor, bytes, offset, bytes.length - offset);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function readEvents(path: string, maxFileBytes: number, maxEvents: number): EventStoreReadResult {
  const file = lstatSync(path);
  if (!file.isFile() || file.isSymbolicLink()) throw new Error("execution event stream must be a regular file");
  if (file.size > maxFileBytes) throw new Error(`execution event stream exceeds ${maxFileBytes} bytes`);
  const input = readFileSync(path, "utf8");
  const recoveredTail = input.length > 0 && !input.endsWith("\n");
  const records = input.split("\n");
  records.pop();
  if (records.length > maxEvents) throw new Error(`execution event stream exceeds ${maxEvents} events`);
  const events: RunEventV1[] = [];
  let state: RunStateV1 | null = null;
  for (const [index, record] of records.entries()) {
    try {
      if (record.length === 0) throw new Error("blank records are not allowed");
      if (Buffer.byteLength(record, "utf8") > MAX_EVENT_BYTES) throw new Error("event record exceeds the size bound");
      const event = parseRunEvent(parseStrictJson(record, `execution event ${index + 1}`));
      state = reduceRunEvent(state, event);
      events.push(event);
    } catch (error) {
      throw new Error(`corrupt execution event stream at line ${index + 1}: ${(error as Error).message}`);
    }
  }
  return Object.freeze({ events: Object.freeze(events), state, recoveredTail, digest: digestRunState(state) });
}

export function createEventStore(input: {
  root?: string;
  context: EventStoreContextV1;
  writeRecord?: EventRecordWriter;
  maxFileBytes?: number;
  maxEvents?: number;
}): EventStore {
  const context = validateRunEventContext(input.context);
  const root = input.root ?? join(homedir(), ".ariadnev", "runs");
  const maxFileBytes = input.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
  const maxEvents = input.maxEvents ?? DEFAULT_MAX_EVENTS;
  if (!Number.isInteger(maxFileBytes) || maxFileBytes < 1) throw new Error("event maxFileBytes must be positive");
  if (!Number.isInteger(maxEvents) || maxEvents < 1) throw new Error("event maxEvents must be positive");
  privateDirectory(root);
  const runDirectory = join(root, context.runId);
  privateDirectory(runDirectory);
  const eventsPath = join(runDirectory, "events.jsonl");
  ensurePrivateFile(eventsPath, runDirectory);
  const initial = readEvents(eventsPath, maxFileBytes, maxEvents);
  if (initial.events[0] && !sameRunContext(initial.events[0], context)) {
    throw new Error("execution event stream belongs to an incompatible run context");
  }
  let current = initial.state;
  let count = initial.events.length;
  let recoveredTail = initial.recoveredTail;
  let unavailable = false;
  const writeRecord = input.writeRecord ?? durableAppend;

  return Object.freeze({
    context,
    runDirectory,
    eventsPath,
    append(payload: RunEventPayloadV1): RunEventV1 {
      if (unavailable) throw new Error("execution event store is unavailable; reopen the run before continuing");
      if (recoveredTail) throw new Error("execution event stream has a truncated tail; export and repair it before appending");
      if (count >= maxEvents) throw new Error(`execution event stream exceeds ${maxEvents} events`);
      const event = createRunEvent({ context, sequence: count + 1, payload });
      const next = reduceRunEvent(current, event);
      const record = `${JSON.stringify(event)}\n`;
      if (Buffer.byteLength(record, "utf8") > MAX_EVENT_BYTES) throw new Error("event record exceeds the size bound");
      try {
        if (fileSize(eventsPath) + Buffer.byteLength(record, "utf8") > maxFileBytes) {
          throw new Error(`execution event stream exceeds ${maxFileBytes} bytes`);
        }
        writeRecord(eventsPath, record);
      } catch (error) {
        unavailable = true;
        throw error;
      }
      current = next;
      count += 1;
      return event;
    },
    state(): RunStateV1 | null {
      return current;
    },
    read(): EventStoreReadResult {
      const result = readEvents(eventsPath, maxFileBytes, maxEvents);
      if (result.events[0] && !sameRunContext(result.events[0], context)) {
        throw new Error("execution event stream belongs to an incompatible run context");
      }
      recoveredTail = result.recoveredTail;
      return result;
    },
  });
}

function fileSize(path: string): number {
  const descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    return fstatSync(descriptor).size;
  } finally {
    closeSync(descriptor);
  }
}

export { replayRunEvents };
