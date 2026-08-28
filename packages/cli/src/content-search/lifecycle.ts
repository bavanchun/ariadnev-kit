// Which projects have opted into content search, and whether their shard works.
//
// PER PROJECT. NEVER GLOBAL. There is no "content search is on" — there is only
// "this directory is opted in", and enabling one project cannot enable another.
// The state file holds one entry per opted-in project and nothing that applies
// to all of them, so there is no field an accident could set that would turn
// indexing on everywhere.
//
// THE STATE FILE IS AUTHORITATIVE AND SITS OUTSIDE `derived/`, for the reason
// phase 6 established and this phase inherits: the shard is deletable at any
// moment by design, and if the opt-in lived inside the shard then deleting
// derived state — an operation advertised as harmless — would silently revoke,
// or worse silently restore, a decision about indexing someone's source code as
// plaintext.
//
// ENABLED-BUT-EMPTY IS NOT DISABLED. A project that opted in and has not been
// indexed yet must not answer a search the same way a project that never opted
// in does. Zero results and "you never turned this on" call for different
// actions, and collapsing them is what makes a search tool untrustworthy — the
// user cannot tell "no match" from "not looking".

import { existsSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { atomicWritePrivate } from "../install/fs-atomic.js";
import { ensureOperationalDirectory, operationalPath } from "../storage/operational-paths.js";
import { SHARD_SCHEMA_VERSION, shardId, shardStats, type ShardStats } from "./shard.js";

export const CONTENT_STATE_VERSION = 1;

/** `~/.ariadnev/operational/content-search-state.json`. Authoritative. */
export function contentStatePath(home: string): string {
  return operationalPath(home, "content-search-state.json");
}

export interface ProjectContentState {
  /** Absolute, resolved. The identity everything else is keyed by. */
  readonly dir: string;
  readonly name: string;
  readonly enabled: boolean;
  readonly shard_id: string;
  readonly updated_at: string;
  readonly last_indexed_at?: string;
  readonly document_count?: number;
}

export interface ContentState {
  readonly version: number;
  readonly projects: readonly ProjectContentState[];
}

const EMPTY: ContentState = { version: CONTENT_STATE_VERSION, projects: [] };

/**
 * Read the state. Missing or malformed reads as "nothing opted in".
 *
 * The safe default for "should this tool copy your source into a plaintext
 * file" is no, so a file that cannot be parsed must not be read as consent.
 * That is the opposite of the project registry's rule, which refuses rather
 * than defaulting — and deliberately so: losing a registry entry loses the
 * user's work, whereas losing an opt-in entry only means being asked again.
 */
export function readContentState(home: string): ContentState {
  const path = contentStatePath(home);
  if (!existsSync(path)) return EMPTY;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as ContentState;
    if (!Array.isArray(parsed?.projects)) return EMPTY;
    return { version: parsed.version ?? CONTENT_STATE_VERSION, projects: parsed.projects.filter(isEntry) };
  } catch {
    return EMPTY;
  }
}

function isEntry(value: unknown): value is ProjectContentState {
  const entry = value as ProjectContentState;
  return typeof entry?.dir === "string" && typeof entry?.enabled === "boolean";
}

function writeContentState(home: string, state: ContentState): void {
  const path = contentStatePath(home);
  ensureOperationalDirectory(home, dirname(path));
  // 0600: this records which of the user's directories are being copied into a
  // plaintext index, which is itself worth keeping to the owner.
  atomicWritePrivate(path, `${JSON.stringify({ ...state, version: CONTENT_STATE_VERSION }, null, 2)}\n`);
}

/** Read, transform one project's entry, write. Callers hold the lifecycle lock. */
function updateProject(
  home: string,
  dir: string,
  transform: (current: ProjectContentState | undefined) => ProjectContentState,
): ProjectContentState {
  const state = readContentState(home);
  const next = transform(state.projects.find((entry) => entry.dir === dir));
  writeContentState(home, {
    version: CONTENT_STATE_VERSION,
    projects: [...state.projects.filter((entry) => entry.dir !== dir), next].sort((a, b) => a.dir.localeCompare(b.dir)),
  });
  return next;
}

export function projectState(home: string, dir: string): ProjectContentState | undefined {
  return readContentState(home).projects.find((entry) => entry.dir === dir);
}

export function isEnabled(home: string, dir: string): boolean {
  return projectState(home, dir)?.enabled === true;
}

export function enableProject(home: string, dir: string, name: string, now: string): ProjectContentState {
  return updateProject(home, dir, (current) => ({
    ...current,
    dir,
    name,
    enabled: true,
    shard_id: shardId(dir),
    updated_at: now,
  }));
}

/** Stop indexing and searching. The shard files stay exactly where they are. */
export function disableProject(home: string, dir: string, name: string, now: string): ProjectContentState {
  return updateProject(home, dir, (current) => ({
    ...current,
    dir,
    name: current?.name ?? name,
    enabled: false,
    shard_id: shardId(dir),
    updated_at: now,
  }));
}

/** Record a completed index pass, so `status` can report it without a scan. */
export function recordIndexed(home: string, dir: string, name: string, now: string, documents: number): void {
  updateProject(home, dir, (current) => ({
    ...current,
    dir,
    name: current?.name ?? name,
    enabled: current?.enabled ?? true,
    shard_id: shardId(dir),
    updated_at: current?.updated_at ?? now,
    last_indexed_at: now,
    document_count: documents,
  }));
}

export type ShardHealth = "absent" | "ready" | "stale" | "corrupt";

export interface ContentSearchStatus {
  readonly project: string;
  readonly dir: string;
  readonly enabled: boolean;
  readonly health: ShardHealth;
  /** `shard` when a search reads the index, `none` when it cannot. */
  readonly serving_mode: "shard" | "none";
  readonly document_count: number;
  readonly shard_bytes: number;
  readonly shard_id: string;
  readonly engine: "fts5" | "plain-scan" | "none";
  readonly shard_schema_version: number;
  readonly last_indexed_at?: string;
  /** Why a search would not be served, when it would not. */
  readonly reason?: string;
}

/** Health of the shard file itself, independent of the opt-in flag. */
export function shardHealth(stats: ShardStats): ShardHealth {
  if (!stats.exists) return "absent";
  // A shard whose file exists but reports no schema could not be opened at all.
  if (stats.schemaVersion === 0) return "corrupt";
  return stats.schemaVersion === SHARD_SCHEMA_VERSION ? "ready" : "stale";
}

/**
 * Report one project's state without changing it.
 *
 * `status` is what someone runs when a search returned nothing and they want to
 * know why, so it opens read-only, answers, and closes. It never creates a
 * shard, and it never repairs one.
 */
export function contentSearchStatus(home: string, dir: string, name: string): ContentSearchStatus {
  const state = projectState(home, dir);
  const stats = shardStats(home, dir);
  const health = shardHealth(stats);
  const enabled = state?.enabled === true;
  const serving = enabled && health === "ready";
  const reason =
    !enabled ? "this project has not opted in — run `av content-search enable --project <name>`"
    : health === "absent" ? "opted in, but no shard has been built yet — run `av content-search rebuild`"
    : health === "stale" ? `shard schema ${stats.schemaVersion} predates this build's ${SHARD_SCHEMA_VERSION}`
    : health === "corrupt" ? "the shard could not be read — `av content-search rebuild` recreates it"
    : undefined;

  return {
    project: state?.name ?? name,
    dir,
    enabled,
    health,
    serving_mode: serving ? "shard" : "none",
    document_count: stats.docs,
    shard_bytes: stats.bytes,
    shard_id: shardId(dir),
    engine: !serving ? "none" : stats.fts5 ? "fts5" : "plain-scan",
    shard_schema_version: SHARD_SCHEMA_VERSION,
    ...(state?.last_indexed_at ? { last_indexed_at: state.last_indexed_at } : {}),
    ...(reason ? { reason } : {}),
  };
}
