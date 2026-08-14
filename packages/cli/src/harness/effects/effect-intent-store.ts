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
import {
  normalizeWorkspaceScope,
  validateWorkspaceSnapshot,
  type WorkspaceSnapshotV1,
} from "./workspace-drift.js";

export type EffectIntentV1 = Readonly<{
  schemaVersion: 1;
  runId: string;
  graphDigest: string;
  nodeId: string;
  attempt: number;
  idempotencyKey: string;
  actionDigest: string;
  approvalDigest: string;
  effect: "workspace" | "external";
  workspaceScope: readonly string[];
  externalScope: readonly string[];
  before: WorkspaceSnapshotV1;
}>;

const GRAPH_DIGEST = /^[a-f0-9]{64}$/;

function canonical(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object" && value !== null && Object.getPrototypeOf(value) === Object.prototype) {
    return `{${Object.keys(value as object).sort().map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  throw new Error("effect intent must contain finite JSON values");
}

function digest(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonical(value)).digest("hex")}`;
}

function normalizeExternalScope(scope: readonly string[]): readonly string[] {
  const normalized = scope.map((target) => {
    if (typeof target !== "string" || target.trim() !== target || target.length === 0 || target.length > 2048
      || target.includes("\0") || target.includes("\n") || target.includes("\r")) {
      throw new Error("external scope targets must be bounded non-empty strings");
    }
    return target;
  }).sort();
  if (new Set(normalized).size !== normalized.length) throw new Error("external scope targets must be unique");
  return Object.freeze(normalized);
}

export function createEffectIntent(input: Omit<EffectIntentV1, "schemaVersion">): EffectIntentV1 {
  if (!GRAPH_DIGEST.test(input.graphDigest)) throw new Error("effect intent graph digest is invalid");
  if (!Number.isInteger(input.attempt) || input.attempt < 1) throw new Error("effect intent attempt must be positive");
  if (input.effect !== "workspace" && input.effect !== "external") throw new Error("effect intent class is unsupported");
  const workspaceScope = normalizeWorkspaceScope(input.workspaceScope);
  const externalScope = normalizeExternalScope(input.externalScope);
  if (input.effect === "workspace" && workspaceScope.length === 0) throw new Error("workspace effect intent requires workspace scope");
  if (input.effect === "external" && externalScope.length === 0) throw new Error("external effect intent requires external scope");
  return Object.freeze({
    schemaVersion: 1,
    runId: categoricalToken(input.runId, "effect intent run ID"),
    graphDigest: input.graphDigest,
    nodeId: categoricalToken(input.nodeId, "effect intent node ID"),
    attempt: input.attempt,
    idempotencyKey: categoricalToken(input.idempotencyKey, "effect intent idempotency key"),
    actionDigest: sha256Digest(input.actionDigest, "effect intent action digest"),
    approvalDigest: sha256Digest(input.approvalDigest, "effect intent approval digest"),
    effect: input.effect,
    workspaceScope,
    externalScope,
    before: validateWorkspaceSnapshot(input.before),
  });
}

function exactObject(value: unknown, fields: readonly string[], label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`);
  const object = value as Record<string, unknown>;
  if (Object.keys(object).some((key) => !fields.includes(key)) || fields.some((key) => !(key in object))) {
    throw new Error(`${label} fields are invalid`);
  }
  return object;
}

function parseIntent(value: unknown): EffectIntentV1 {
  const fields = [
    "schemaVersion", "runId", "graphDigest", "nodeId", "attempt", "idempotencyKey", "actionDigest",
    "approvalDigest", "effect", "workspaceScope", "externalScope", "before",
  ];
  const object = exactObject(value, fields, "stored effect intent");
  if (object.schemaVersion !== 1 || !Array.isArray(object.workspaceScope) || !Array.isArray(object.externalScope)) {
    throw new Error("stored effect intent contract is invalid");
  }
  return createEffectIntent(object as unknown as Omit<EffectIntentV1, "schemaVersion">);
}

function syncDirectory(path: string): void {
  const descriptor = openSync(path, constants.O_RDONLY);
  try {
    fsyncSync(descriptor);
  } catch (error) {
    if (!(["EINVAL", "ENOTSUP", "EPERM", "EBADF"] as Array<string | undefined>).includes((error as NodeJS.ErrnoException).code)) throw error;
  } finally {
    closeSync(descriptor);
  }
}

export function createEffectIntentStore(input: { runDirectory: string }) {
  if (!isAbsolute(input.runDirectory)) throw new Error("effect intent run directory must be absolute");
  mkdirSync(input.runDirectory, { recursive: true, mode: 0o700 });
  const directory = join(input.runDirectory, "effects");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  const pathFor = (idempotencyKey: string) => join(directory, `${categoricalToken(idempotencyKey, "effect intent idempotency key")}.json`);

  return Object.freeze({
    record(intent: EffectIntentV1): void {
      const validated = parseIntent(intent);
      const body = { intent: validated, seal: digest(validated) };
      const path = pathFor(validated.idempotencyKey);
      const temporary = `${path}.tmp`;
      if (existsSync(temporary) && (!lstatSync(temporary).isFile() || lstatSync(temporary).isSymbolicLink())) {
        throw new Error("effect intent temporary path is unsafe");
      }
      const descriptor = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | (constants.O_NOFOLLOW ?? 0), 0o600);
      try {
        const bytes = Buffer.from(`${JSON.stringify(body)}\n`, "utf8");
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
    },
    read(idempotencyKey: string): EffectIntentV1 | null {
      const path = pathFor(idempotencyKey);
      if (!existsSync(path)) return null;
      const stat = lstatSync(path);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("stored effect intent path is unsafe");
      const envelope = exactObject(
        parseStrictJson(readFileSync(path, "utf8"), "stored effect intent envelope"),
        ["intent", "seal"],
        "stored effect intent envelope",
      );
      const intent = parseIntent(envelope.intent);
      if (intent.idempotencyKey !== idempotencyKey || digest(intent) !== envelope.seal) {
        throw new Error("stored effect intent seal does not match its metadata");
      }
      return intent;
    },
  });
}
