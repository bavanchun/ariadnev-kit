// What `watch` remembers between runs, and the ordering that makes a restart safe.
//
// THE ANSWERED SET IS WRITTEN BEFORE THE RESPONSE IS SENT, NEVER AFTER. A crash
// in between then loses a response instead of duplicating one, and the choice is
// deliberate: a missed answer is a person waiting, while a duplicate answer is
// this tool spamming a public repository under the maintainer's name. ADR 0018
// records this as one of the five structural mitigations.
//
// The write is atomic — temp file plus rename — so a crash mid-write leaves the
// previous state rather than a half-parsed one. That is not sufficient on its
// own: whole-file rename is last-write-wins, so two daemons watching one
// repository would clobber each other's answered sets and both reply. The
// pidfile in `daemon.ts` is what stops there being two.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { atomicWritePrivate } from "../install/fs-atomic.js";
import { UsageError } from "../cli/exit-codes.js";
import { operationalPath } from "../storage/operational-paths.js";

/** One GitHub segment. No dots-only names, no separators, no traversal. */
const SEGMENT = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9_-])?$/;

export interface RepoRef {
  readonly owner: string;
  readonly name: string;
}

/**
 * Parse `owner/repo`, refusing anything that could escape the state directory.
 *
 * The repository name reaches the filesystem as a path segment, so `../..` here
 * would write state wherever the attacker-supplied string points. It arrives
 * from the command line rather than from an issue body, which makes this a
 * lower-severity check than the ones ADR 0018 is about — and exactly the sort of
 * check that gets skipped for that reason.
 */
export function parseRepo(raw: string): RepoRef {
  const parts = raw.split("/");
  if (parts.length !== 2) throw new UsageError(`${JSON.stringify(raw)} is not a repository: expected owner/repo`);
  const [owner, name] = parts as [string, string];
  for (const [label, segment] of [["owner", owner], ["repository", name]] as const) {
    if (!SEGMENT.test(segment)) {
      throw new UsageError(`${JSON.stringify(segment)} is not a usable ${label} name in ${JSON.stringify(raw)}`);
    }
  }
  return { owner, name };
}

export function repoSlug(ref: RepoRef): string {
  return `${ref.owner}/${ref.name}`;
}

/** `~/.ariadnev/operational/watch` — authoritative; nothing can rebuild it. */
export function watchRoot(home: string): string {
  return operationalPath(home, "watch");
}

export function statePath(home: string, ref: RepoRef): string {
  return join(watchRoot(home), ref.owner, ref.name, "state.json");
}

export interface WatchState {
  readonly repo: string;
  /** Highest issue number this watch has looked at. */
  readonly lastSeenIssue: number;
  /** Issue numbers already answered — the dedup set. */
  readonly responded: readonly number[];
  /** ISO timestamps of dispatches, for the local rate limit. */
  readonly responseTimes: readonly string[];
  readonly updatedAt: string;
}

export function emptyState(ref: RepoRef): WatchState {
  return { repo: repoSlug(ref), lastSeenIssue: 0, responded: [], responseTimes: [], updatedAt: "" };
}

/**
 * The recorded state, or an empty one.
 *
 * An unreadable file becomes an empty state rather than an error, with one
 * consequence worth naming: a corrupted answered set means issues get answered
 * again. That is the wrong direction for this particular file, so a parse
 * failure is loud — it throws — while a missing file is silent.
 */
export function readState(home: string, ref: RepoRef): WatchState {
  let raw: string;
  try {
    raw = readFileSync(statePath(home, ref), "utf8");
  } catch {
    return emptyState(ref);
  }
  let parsed: Partial<WatchState>;
  try {
    parsed = JSON.parse(raw) as Partial<WatchState>;
  } catch (error) {
    throw new UsageError(
      `the watch state for ${repoSlug(ref)} is unreadable (${statePath(home, ref)}): ${(error as Error).message}. ` +
        `Refusing to continue, because an empty answered set means every open issue is answered again.`,
    );
  }
  return {
    repo: repoSlug(ref),
    lastSeenIssue: typeof parsed.lastSeenIssue === "number" ? parsed.lastSeenIssue : 0,
    responded: Array.isArray(parsed.responded) ? parsed.responded.filter((n): n is number => typeof n === "number") : [],
    responseTimes: Array.isArray(parsed.responseTimes)
      ? parsed.responseTimes.filter((t): t is string => typeof t === "string")
      : [],
    updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : "",
  };
}

export function writeState(home: string, ref: RepoRef, state: WatchState): void {
  atomicWritePrivate(statePath(home, ref), `${JSON.stringify(state, null, 2)}\n`);
}

/**
 * Claim an issue: record it as answered, and say whether it was already.
 *
 * The claim happens *before* the dispatch, which is the whole ordering decision.
 * Returns false when the issue was already in the set, so the caller skips it —
 * that check and the write are one operation here so no caller can do the first
 * and forget the second.
 */
export function claimIssue(home: string, ref: RepoRef, issue: number, now: Date): boolean {
  const state = readState(home, ref);
  if (state.responded.includes(issue)) return false;
  writeState(home, ref, {
    ...state,
    lastSeenIssue: Math.max(state.lastSeenIssue, issue),
    responded: [...state.responded, issue],
    responseTimes: [...state.responseTimes, now.toISOString()],
    updatedAt: now.toISOString(),
  });
  return true;
}

/** Note that an issue was seen without answering it — `dry-run`'s only write. */
export function recordSeen(home: string, ref: RepoRef, issue: number, now: Date): void {
  const state = readState(home, ref);
  if (issue <= state.lastSeenIssue) return;
  writeState(home, ref, { ...state, lastSeenIssue: issue, updatedAt: now.toISOString() });
}
