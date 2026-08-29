// The global registry of initialized project directories.
//
// `~/.ariadnev/projects.json`, matching the captured shape: `{ version,
// projects: [{ name, dir, registered_at, updated_at }] }`. Snake_case in the
// file because that is what the surface this ports records; the TypeScript
// mirrors it rather than translating, so a hand-edited file and a written one
// are the same document.
//
// WHAT THIS IS NOT. It holds no file list and no hashes — it is an index of
// *where* projects are, not of *what* is owned inside them. Ownership lives in
// each project's own receipt, and keeping the two apart is deliberate: a global
// file that claimed to know what is inside every project would be wrong the
// moment any of them changed without this tool watching.
//
// LOCKING BELONGS TO THE CALLER, AND THAT IS NOT AN OVERSIGHT. Every mutating
// command here already runs inside `withLifecycleLock`, which **refuses** when
// another command holds it rather than queueing. A registry helper that took a
// lock of its own would therefore be taking a second lock while the first is
// held — deadlocking against `av init` the moment their roots overlap, and
// "composing" only by the accident of naming different roots today. Two locking
// systems over the same directory do not compose: each is correct against
// itself and neither sees the other.
//
// So `updateRegistry` is a read-modify-write and nothing more. The property
// "two overlapping runs never lose an entry" is provided where it already was:
// by the command-level lock that makes the second run refuse.

import { existsSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { atomicWritePrivate } from "../install/fs-atomic.js";

export const REGISTRY_VERSION = 1;

export interface ProjectEntry {
  readonly name: string;
  /** Absolute, resolved. The identity a lookup matches on first. */
  readonly dir: string;
  readonly registered_at: string;
  readonly updated_at: string;
}

export interface Registry {
  readonly version: number;
  readonly projects: readonly ProjectEntry[];
}

export function registryPath(home: string): string {
  return join(home, ".ariadnev", "projects.json");
}

const EMPTY: Registry = { version: REGISTRY_VERSION, projects: [] };

/**
 * Read the registry. A missing file is an empty registry, not an error.
 *
 * A malformed one **is** an error. The alternative — treating unparseable JSON
 * as empty — would silently discard every registered project on the next write,
 * which is the same failure the receipt reader refuses for the same reason.
 */
export function readRegistry(home: string): Registry {
  const path = registryPath(home);
  if (!existsSync(path)) return EMPTY;
  const raw = readFileSync(path, "utf8");
  if (raw.trim().length === 0) return EMPTY;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`project registry at ${path} is not valid JSON — refusing to overwrite it`, { cause: error });
  }
  if (typeof parsed !== "object" || parsed === null || !Array.isArray((parsed as Registry).projects)) {
    throw new Error(`project registry at ${path} has no projects array — refusing to overwrite it`);
  }
  const registry = parsed as Registry;
  return { version: registry.version ?? REGISTRY_VERSION, projects: registry.projects.filter(isEntry) };
}

function isEntry(value: unknown): value is ProjectEntry {
  const entry = value as ProjectEntry;
  return typeof entry?.dir === "string" && typeof entry?.name === "string";
}

/** Entries in a stable order, so two identical registries are byte-identical. */
function sorted(projects: readonly ProjectEntry[]): ProjectEntry[] {
  return [...projects].sort((a, b) => a.dir.localeCompare(b.dir));
}

function serialize(registry: Registry): string {
  return `${JSON.stringify({ version: REGISTRY_VERSION, projects: sorted(registry.projects) }, null, 2)}\n`;
}

/**
 * Read, transform, write atomically.
 *
 * **Call this inside `withLifecycleLock`.** See the module header: this takes no
 * lock of its own precisely because every caller already holds one, and taking
 * a second would refuse against the first.
 */
export function updateRegistry(home: string, transform: (current: Registry) => Registry): Registry {
  const next = transform(readRegistry(home));
  atomicWritePrivate(registryPath(home), serialize(next));
  return next;
}

/** Register a directory, or refresh `updated_at` when it is already there. */
export function withProject(registry: Registry, dir: string, now: string, name?: string): Registry {
  const absolute = resolve(dir);
  const existing = registry.projects.find((entry) => entry.dir === absolute);
  const entry: ProjectEntry = {
    name: name ?? existing?.name ?? basename(absolute),
    dir: absolute,
    registered_at: existing?.registered_at ?? now,
    updated_at: now,
  };
  return { version: REGISTRY_VERSION, projects: [...registry.projects.filter((p) => p.dir !== absolute), entry] };
}

/** Deregister by absolute path or by name. The directory itself is untouched. */
export function withoutProject(registry: Registry, nameOrPath: string): Registry {
  const target = findProject(registry, nameOrPath);
  if (!target) return registry;
  return { version: REGISTRY_VERSION, projects: registry.projects.filter((entry) => entry.dir !== target.dir) };
}

/** Lookup by exact directory first, then by name — the captured precedence. */
export function findProject(registry: Registry, nameOrPath: string): ProjectEntry | undefined {
  const absolute = resolve(nameOrPath);
  return registry.projects.find((entry) => entry.dir === absolute)
    ?? registry.projects.find((entry) => entry.name === nameOrPath);
}

/** Entries whose directory no longer exists. */
export function staleProjects(registry: Registry, exists: (dir: string) => boolean): ProjectEntry[] {
  return registry.projects.filter((entry) => !exists(entry.dir));
}
