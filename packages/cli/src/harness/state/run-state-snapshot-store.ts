import { createHash } from "node:crypto";
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
  unlinkSync,
  writeSync,
} from "node:fs";
import { isAbsolute, join } from "node:path";
import { parseStrictJson } from "../../eval/strict-json.js";
import type { JsonValueV1 } from "../executors/executor.js";

const DEFAULT_MAX_BYTES = 256 * 1024;

type SnapshotV1 = Readonly<{
  schemaVersion: 1;
  sequence: number;
  state: Readonly<Record<string, JsonValueV1>>;
}>;

function digest(snapshot: SnapshotV1): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(snapshot)).digest("hex")}`;
}

function regularFile(path: string): boolean {
  if (!existsSync(path)) return false;
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("run state snapshot path is unsafe");
  return true;
}

function syncDirectory(path: string): void {
  const descriptor = openSync(path, constants.O_RDONLY);
  try {
    fsyncSync(descriptor);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (!code || !["EINVAL", "ENOTSUP", "EPERM", "EBADF"].includes(code)) throw error;
  } finally {
    closeSync(descriptor);
  }
}

function normalizeState(value: Readonly<Record<string, JsonValueV1>>, maxBytes: number): Readonly<Record<string, JsonValueV1>> {
  const encoded = JSON.stringify(value);
  if (encoded === undefined || Buffer.byteLength(encoded, "utf8") > maxBytes) {
    throw new Error(`run state snapshot exceeds ${maxBytes} bytes`);
  }
  const parsed = parseStrictJson(encoded, "run state snapshot") as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("run state snapshot must be an object");
  return Object.freeze(parsed as Record<string, JsonValueV1>);
}

function parseSnapshot(path: string, maxBytes: number): SnapshotV1 | null {
  if (!regularFile(path)) return null;
  const stat = lstatSync(path);
  if (stat.size > maxBytes + 1024) throw new Error("run state snapshot file exceeds its size bound");
  const parsed = parseStrictJson(readFileSync(path, "utf8"), "stored run state snapshot") as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("stored run state snapshot must be an object");
  const envelope = parsed as Record<string, unknown>;
  if (Object.keys(envelope).some((key) => !["snapshot", "seal"].includes(key))
    || typeof envelope.seal !== "string" || typeof envelope.snapshot !== "object" || envelope.snapshot === null
    || Array.isArray(envelope.snapshot)) {
    throw new Error("stored run state snapshot envelope is invalid");
  }
  const raw = envelope.snapshot as Record<string, unknown>;
  if (Object.keys(raw).some((key) => !["schemaVersion", "sequence", "state"].includes(key))
    || raw.schemaVersion !== 1 || !Number.isInteger(raw.sequence) || (raw.sequence as number) < 1
    || typeof raw.state !== "object" || raw.state === null || Array.isArray(raw.state)) {
    throw new Error("stored run state snapshot contract is invalid");
  }
  const snapshot = Object.freeze({
    schemaVersion: 1 as const,
    sequence: raw.sequence as number,
    state: normalizeState(raw.state as Record<string, JsonValueV1>, maxBytes),
  });
  if (digest(snapshot) !== envelope.seal) throw new Error("stored run state snapshot seal does not match its state");
  return snapshot;
}

export function createRunStateSnapshotStore(input: { runDirectory: string; maxBytes?: number }) {
  if (!isAbsolute(input.runDirectory)) throw new Error("run state directory must be absolute");
  const maxBytes = input.maxBytes ?? DEFAULT_MAX_BYTES;
  if (!Number.isInteger(maxBytes) || maxBytes < 1) throw new Error("run state maxBytes must be positive");
  mkdirSync(input.runDirectory, { recursive: true, mode: 0o700 });
  const directory = lstatSync(input.runDirectory);
  if (!directory.isDirectory() || directory.isSymbolicLink()) throw new Error("run state directory is unsafe");
  chmodSync(input.runDirectory, 0o700);
  const currentPath = join(input.runDirectory, "state-current.json");
  const previousPath = join(input.runDirectory, "state-previous.json");
  const temporaryPath = join(input.runDirectory, "state-current.tmp");

  return Object.freeze({
    write(inputState: { sequence: number; state: Readonly<Record<string, JsonValueV1>> }): void {
      if (!Number.isInteger(inputState.sequence) || inputState.sequence < 1) throw new Error("run state sequence must be positive");
      const current = parseSnapshot(currentPath, maxBytes);
      if (current && inputState.sequence < current.sequence) throw new Error("run state sequence cannot move backwards");
      if (current && inputState.sequence > current.sequence + 1) throw new Error("run state sequence cannot skip an event");
      const snapshot = Object.freeze({
        schemaVersion: 1 as const,
        sequence: inputState.sequence,
        state: normalizeState(inputState.state, maxBytes),
      });
      const bytes = Buffer.from(`${JSON.stringify({ snapshot, seal: digest(snapshot) })}\n`, "utf8");
      if (regularFile(temporaryPath)) unlinkSync(temporaryPath);
      const descriptor = openSync(
        temporaryPath,
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0),
        0o600,
      );
      try {
        let offset = 0;
        while (offset < bytes.length) offset += writeSync(descriptor, bytes, offset, bytes.length - offset);
        fsyncSync(descriptor);
      } finally {
        closeSync(descriptor);
      }
      chmodSync(temporaryPath, 0o600);
      if (current && current.sequence !== inputState.sequence) {
        if (regularFile(previousPath)) unlinkSync(previousPath);
        renameSync(currentPath, previousPath);
        chmodSync(previousPath, 0o600);
      }
      renameSync(temporaryPath, currentPath);
      chmodSync(currentPath, 0o600);
      syncDirectory(input.runDirectory);
    },
    read(sequence: number): Readonly<Record<string, JsonValueV1>> | null {
      if (!Number.isInteger(sequence) || sequence < 1) throw new Error("run state sequence must be positive");
      for (const path of [currentPath, previousPath]) {
        const snapshot = parseSnapshot(path, maxBytes);
        if (snapshot?.sequence === sequence) return snapshot.state;
      }
      return null;
    },
  });
}
