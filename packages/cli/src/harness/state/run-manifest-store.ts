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
  writeSync,
} from "node:fs";
import { isAbsolute, join } from "node:path";
import { categoricalToken, sha256Digest } from "../../eval/categorical-token.js";
import { parseStrictJson } from "../../eval/strict-json.js";
import { validateRunEventContext, type RunEventContextV1 } from "../events/event-types.js";

export type RunManifestV1 = Readonly<{
  schemaVersion: 1;
  runId: string;
  workflow: string;
  runtime: string;
  runtimeVersion: string;
  model: string;
  context: RunEventContextV1;
  instructionDigest: string;
  workspaceDigest: string;
  createdAt: string;
}>;

function digest(value: unknown): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

function timestamp(value: unknown, label: string): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value)) || new Date(value).toISOString() !== value) {
    throw new Error(`${label} must be a canonical ISO timestamp`);
  }
  return value;
}

function boundedLabel(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 256 || value.includes("\0") || value.includes("\n") || value.includes("\r")) {
    throw new Error(`${label} must be a bounded string`);
  }
  return value;
}

function parseManifest(value: unknown): RunManifestV1 {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("run manifest must be an object");
  const object = value as Record<string, unknown>;
  const fields = [
    "schemaVersion", "runId", "workflow", "runtime", "runtimeVersion", "model", "context",
    "instructionDigest", "workspaceDigest", "createdAt",
  ];
  if (Object.keys(object).some((key) => !fields.includes(key)) || fields.some((key) => !(key in object)) || object.schemaVersion !== 1) {
    throw new Error("run manifest contract is invalid");
  }
  const context = validateRunEventContext(object.context);
  const runId = categoricalToken(object.runId, "run manifest ID");
  if (context.runId !== runId) throw new Error("run manifest context belongs to another run");
  return Object.freeze({
    schemaVersion: 1,
    runId,
    workflow: categoricalToken(object.workflow, "run manifest workflow"),
    runtime: categoricalToken(object.runtime, "run manifest runtime"),
    runtimeVersion: boundedLabel(object.runtimeVersion, "run manifest runtime version"),
    model: boundedLabel(object.model, "run manifest model"),
    context,
    instructionDigest: sha256Digest(object.instructionDigest, "run manifest instruction digest"),
    workspaceDigest: sha256Digest(object.workspaceDigest, "run manifest workspace digest"),
    createdAt: timestamp(object.createdAt, "run manifest createdAt"),
  });
}

function assertPrivateDirectory(path: string): void {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("run manifest directory is unsafe");
  chmodSync(path, 0o700);
}

function assertRegularFile(path: string, label: string): void {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${label} path is unsafe`);
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

function atomicWrite(path: string, value: unknown, directory: string): void {
  const temporary = `${path}.tmp`;
  if (existsSync(temporary)) assertRegularFile(temporary, "run manifest temporary");
  const descriptor = openSync(
    temporary,
    constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | (constants.O_NOFOLLOW ?? 0),
    0o600,
  );
  try {
    const bytes = Buffer.from(`${JSON.stringify(value)}\n`, "utf8");
    let offset = 0;
    while (offset < bytes.length) offset += writeSync(descriptor, bytes, offset, bytes.length - offset);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  chmodSync(temporary, 0o600);
  renameSync(temporary, path);
  chmodSync(path, 0o600);
  syncDirectory(directory);
}

export function createRunManifestStore(input: { runDirectory: string }) {
  if (!isAbsolute(input.runDirectory)) throw new Error("run manifest directory must be absolute");
  assertPrivateDirectory(input.runDirectory);
  const manifestPath = join(input.runDirectory, "manifest.json");
  const cancellationPath = join(input.runDirectory, "cancel-request.json");

  const cancellationRequested = (): boolean => {
    if (!existsSync(cancellationPath)) return false;
    assertRegularFile(cancellationPath, "cancellation request");
    const parsed = parseStrictJson(readFileSync(cancellationPath, "utf8"), "stored cancellation request") as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("stored cancellation request is invalid");
    const envelope = parsed as Record<string, unknown>;
    if (typeof envelope.request !== "object" || envelope.request === null || Array.isArray(envelope.request) || typeof envelope.seal !== "string") {
      throw new Error("stored cancellation request is invalid");
    }
    const request = envelope.request as Record<string, unknown>;
    if (Object.keys(request).some((key) => !["schemaVersion", "requestedAt"].includes(key)) || request.schemaVersion !== 1) {
      throw new Error("stored cancellation request contract is invalid");
    }
    const normalized = Object.freeze({ schemaVersion: 1 as const, requestedAt: timestamp(request.requestedAt, "cancellation requestedAt") });
    if (digest(normalized) !== envelope.seal) throw new Error("stored cancellation request seal does not match its metadata");
    return true;
  };

  return Object.freeze({
    record(manifest: RunManifestV1): void {
      if (existsSync(manifestPath)) throw new Error(`run manifest already exists for ${manifest.runId}`);
      const normalized = parseManifest(manifest);
      atomicWrite(manifestPath, { manifest: normalized, seal: digest(normalized) }, input.runDirectory);
    },
    read(): RunManifestV1 {
      if (!existsSync(manifestPath)) throw new Error("run manifest does not exist");
      assertRegularFile(manifestPath, "run manifest");
      const parsed = parseStrictJson(readFileSync(manifestPath, "utf8"), "stored run manifest") as unknown;
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("stored run manifest envelope is invalid");
      const envelope = parsed as Record<string, unknown>;
      if (Object.keys(envelope).some((key) => !["manifest", "seal"].includes(key)) || typeof envelope.seal !== "string") {
        throw new Error("stored run manifest envelope is invalid");
      }
      const manifest = parseManifest(envelope.manifest);
      if (digest(manifest) !== envelope.seal) throw new Error("stored run manifest seal does not match its metadata");
      return manifest;
    },
    requestCancellation(requestedAt: string): void {
      if (existsSync(cancellationPath) && cancellationRequested()) return;
      const request = Object.freeze({ schemaVersion: 1 as const, requestedAt: timestamp(requestedAt, "cancellation requestedAt") });
      atomicWrite(cancellationPath, { request, seal: digest(request) }, input.runDirectory);
    },
    cancellationRequested,
  });
}
