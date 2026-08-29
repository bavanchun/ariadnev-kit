// Which repositories this machine will post to, and the singleton that keeps
// one watcher per repository.
//
// THE ALLOWLIST IS A RECORD OF A DECISION, NOT A CACHE. `av watch start --yes`
// writes the repository here, and everything afterwards reads it: a later
// `start` on an unallowed repository previews instead of posting, and `status`
// prints the list so the standing decision is visible without reading code. ADR
// 0018 calls this the first structural mitigation — a repository is watched
// because a human named it, so there is no discovery path and no way for issue
// content to add one.
//
// It also makes the decision REVOCABLE by a person rather than only by a
// command: the file is one JSON array of slugs, and deleting a line turns
// posting back off. A permission you can only grant is not really a permission.
//
// THE SINGLETON IS PER REPOSITORY, and it matters more than it looks. State is
// written by whole-file rename, which is last-write-wins, so two daemons on one
// repository each hold their own answered set, clobber each other, and both
// reply to the same issue. A crash test that exercises one process passes while
// that fails.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { atomicWritePrivate } from "../install/fs-atomic.js";
import {
  clearDaemonRecord,
  processAlive,
  readDaemonRecord,
  writeDaemonRecord,
  type DaemonRecord,
  type DaemonSlot,
} from "../api/daemon-state.js";
import { repoSlug, watchRoot, type RepoRef } from "./state.js";

const ALLOWLIST = "allowlist.json";

export function allowlistPath(home: string): string {
  return join(watchRoot(home), ALLOWLIST);
}

export function readAllowlist(home: string): string[] {
  try {
    const parsed = JSON.parse(readFileSync(allowlistPath(home), "utf8")) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is string => typeof entry === "string").sort();
  } catch {
    // Unreadable means not allowlisted, which fails towards previewing rather
    // than posting. The safe direction for this particular file is "off".
    return [];
  }
}

export function isAllowed(home: string, ref: RepoRef): boolean {
  return readAllowlist(home).includes(repoSlug(ref));
}

/** Record the decision to post to this repository. Returns true if it is new. */
export function allow(home: string, ref: RepoRef): boolean {
  const slug = repoSlug(ref);
  const current = readAllowlist(home);
  if (current.includes(slug)) return false;
  atomicWritePrivate(allowlistPath(home), `${JSON.stringify([...current, slug].sort(), null, 2)}\n`);
  return true;
}

/**
 * Every repository this home has any record of: allowlisted, swept, or watched.
 *
 * THE ALLOWLIST ALONE IS NOT THE ANSWER, and assuming it was is a defect this
 * had. A watcher started in preview mode is not allowlisted — previewing needs
 * no permission — so listing only the allowlist made a *running* watcher
 * invisible to `av watch status`. A daemon that spawns coding agents and cannot
 * be seen is precisely the daemon someone forgets about.
 */
export function knownRepos(home: string): string[] {
  const found = new Set(readAllowlist(home));
  let owners: string[];
  try {
    owners = readdirSync(watchRoot(home), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    owners = [];
  }
  for (const owner of owners) {
    let names: string[];
    try {
      names = readdirSync(join(watchRoot(home), owner), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
    } catch {
      continue;
    }
    for (const name of names) found.add(`${owner}/${name}`);
  }
  return [...found].sort();
}

/** The pidfile slot for one repository's watcher. */
export function watchSlot(ref: RepoRef): DaemonSlot {
  return ["watch", ref.owner, ref.name];
}

export type WatcherState = "running" | "stopped";

export interface WatcherInspection {
  readonly state: WatcherState;
  readonly record: DaemonRecord | null;
}

/**
 * Whether a watcher is already running for this repository.
 *
 * WEAKER THAN `api`'s CHECK, ON PURPOSE, AND WORTH NAMING. `av api` proves
 * identity by asking the process on its port to identify itself; a watcher
 * listens on nothing, so there is no such question to ask and this can only
 * check that the recorded pid is alive. A recycled pid therefore reads as a live
 * watcher — which makes `start` refuse rather than spawn, and refusing to start
 * is the direction to be wrong in. `stop` inherits the same limit, so it reports
 * what it is about to signal.
 */
export function inspectWatcher(home: string, ref: RepoRef): WatcherInspection {
  const record = readDaemonRecord(home, watchSlot(ref));
  if (record === null) return { state: "stopped", record: null };
  if (!processAlive(record.pid)) return { state: "stopped", record };
  return { state: "running", record };
}

export function recordWatcher(home: string, ref: RepoRef, record: DaemonRecord): void {
  writeDaemonRecord(home, record, watchSlot(ref));
}

export function clearWatcher(home: string, ref: RepoRef): void {
  clearDaemonRecord(home, watchSlot(ref));
}
