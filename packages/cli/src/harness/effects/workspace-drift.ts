import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync, readlinkSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";

export type WorkspaceEntryV1 = Readonly<{
  path: string;
  fingerprint: string;
}>;

export type WorkspaceSnapshotV1 = Readonly<{
  schemaVersion: 1;
  digest: string;
  entries: readonly WorkspaceEntryV1[];
}>;

export type WorkspaceDriftV1 = Readonly<{
  drifted: boolean;
  changedPaths: readonly string[];
}>;

export type RollbackEvidenceV1 = Readonly<{
  schemaVersion: 1;
  automatic: false;
  beforeDigest: string;
  afterDigest: string;
  changedPaths: readonly string[];
  guidance: string;
}>;

function digest(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function workspacePath(root: string, absolute: string): string {
  return relative(root, absolute).split("\\").join("/");
}

export function captureWorkspaceSnapshot(root: string): WorkspaceSnapshotV1 {
  if (!isAbsolute(root)) throw new Error("workspace root must be absolute");
  const rootStat = lstatSync(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error("workspace root must be a regular directory");
  const entries: WorkspaceEntryV1[] = [];
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const absolute = join(directory, entry.name);
      const path = workspacePath(root, absolute);
      const stat = lstatSync(absolute);
      if (stat.isDirectory() && !stat.isSymbolicLink()) {
        entries.push(Object.freeze({ path: `${path}/`, fingerprint: `directory:${stat.mode & 0o777}` }));
        visit(absolute);
      } else if (stat.isFile()) {
        entries.push(Object.freeze({
          path,
          fingerprint: `file:${stat.mode & 0o777}:${stat.size}:${digest(readFileSync(absolute).toString("base64"))}`,
        }));
      } else if (stat.isSymbolicLink()) {
        entries.push(Object.freeze({ path, fingerprint: `symlink:${readlinkSync(absolute)}` }));
      } else {
        entries.push(Object.freeze({ path, fingerprint: `special:${stat.mode}` }));
      }
    }
  };
  visit(root);
  const frozen = Object.freeze(entries);
  return Object.freeze({ schemaVersion: 1, digest: digest(JSON.stringify(frozen)), entries: frozen });
}

export function diffWorkspaceSnapshots(before: WorkspaceSnapshotV1, after: WorkspaceSnapshotV1): WorkspaceDriftV1 {
  const left = new Map(before.entries.map((entry) => [entry.path, entry.fingerprint]));
  const right = new Map(after.entries.map((entry) => [entry.path, entry.fingerprint]));
  const paths = new Set([...left.keys(), ...right.keys()]);
  const changedPaths = Object.freeze([...paths].filter((path) => left.get(path) !== right.get(path)).sort());
  return Object.freeze({ drifted: changedPaths.length > 0, changedPaths });
}

function normalizedScope(path: string): string {
  if (typeof path !== "string" || path.length === 0 || path.includes("\0") || path.includes("\\") || isAbsolute(path)) {
    throw new Error("workspace scope must contain safe relative paths");
  }
  const segments = path.split("/").filter((segment) => segment.length > 0);
  if (segments.some((segment) => segment === "." || segment === "..")) throw new Error("workspace scope cannot escape its root");
  return `${segments.join("/")}${path.endsWith("/") ? "/" : ""}`;
}

export function normalizeWorkspaceScope(scope: readonly string[]): readonly string[] {
  const normalized = scope.map(normalizedScope).sort();
  if (new Set(normalized).size !== normalized.length) throw new Error("workspace scope paths must be unique");
  return Object.freeze(normalized);
}

export function pathsWithinWorkspaceScope(changedPaths: readonly string[], scope: readonly string[]): boolean {
  if (scope.length === 0) return false;
  const allowed = normalizeWorkspaceScope(scope);
  return changedPaths.every((path) => allowed.some((candidate) => (
    candidate.endsWith("/") ? path.startsWith(candidate) : path === candidate
  )));
}

export function validateWorkspaceSnapshot(value: unknown): WorkspaceSnapshotV1 {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("workspace snapshot must be an object");
  const object = value as Record<string, unknown>;
  if (object.schemaVersion !== 1 || typeof object.digest !== "string" || !Array.isArray(object.entries)
    || Object.keys(object).some((key) => !["schemaVersion", "digest", "entries"].includes(key))) {
    throw new Error("workspace snapshot contract is invalid");
  }
  const entries = object.entries.map((entry) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) throw new Error("workspace snapshot entry must be an object");
    const item = entry as Record<string, unknown>;
    if (typeof item.path !== "string" || item.path.length === 0 || item.path.includes("\0") || item.path.includes("\\")
      || isAbsolute(item.path) || typeof item.fingerprint !== "string" || item.fingerprint.length === 0
      || Object.keys(item).some((key) => !["path", "fingerprint"].includes(key))) {
      throw new Error("workspace snapshot entry is invalid");
    }
    const segments = item.path.replace(/\/$/, "").split("/");
    if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
      throw new Error("workspace snapshot entry path is unsafe");
    }
    return Object.freeze({ path: item.path, fingerprint: item.fingerprint });
  });
  if (new Set(entries.map((entry) => entry.path)).size !== entries.length
    || entries.some((entry, index) => index > 0 && entries[index - 1].path.localeCompare(entry.path) >= 0)) {
    throw new Error("workspace snapshot entries must be unique and sorted");
  }
  const frozen = Object.freeze(entries);
  if (object.digest !== digest(JSON.stringify(frozen))) throw new Error("workspace snapshot digest does not match its entries");
  return Object.freeze({ schemaVersion: 1, digest: object.digest, entries: frozen });
}

export function createRollbackEvidence(before: WorkspaceSnapshotV1, after: WorkspaceSnapshotV1): RollbackEvidenceV1 {
  const drift = diffWorkspaceSnapshots(before, after);
  return Object.freeze({
    schemaVersion: 1,
    automatic: false,
    beforeDigest: before.digest,
    afterDigest: after.digest,
    changedPaths: drift.changedPaths,
    guidance: "Review the recorded pre-change evidence and changed paths, then restore with the repository's approved recovery workflow.",
  });
}
