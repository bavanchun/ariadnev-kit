// Where the operational data plane lives on disk.
//
// NOT `src/adapt/paths.ts`. That module belongs to the adapt engine, which is
// pure by contract — no fs, no network, ≥90% covered (CLAUDE.md/AGENTS.md).
// Runtime state is neither pure nor the adapt engine's business, and the
// precedent for keeping it separate already exists: `~/.ariadnev/runtime/`
// (register-harness-commands.ts) and `~/.ariadnev/runs/` are both defined where
// they are used.
//
// LAYOUT
//
//   ~/.ariadnev/operational/
//     <authoritative files live here>
//     derived/          everything rebuildable, deletable wholesale at any moment
//
// The split is the whole point, and it is structural rather than conventional:
// ADR 0014 says derived state is never authoritative, and a doctrine that lives
// only in prose gets forgotten the first time a query is slow. Anything under
// `derived/` can be deleted between two commands and the next one must rebuild
// it without asking. Anything outside it is the only copy there is.
//
// Nothing here creates a directory as a side effect of being called. Paths are
// computed; `ensureOperationalDirectory` is the only function that writes, and
// callers reach for it when they are about to store something. A tool that
// materialises a database during an unrelated invocation is worse than one that
// does not — on the machine this was designed against, the upstream CLI's own
// operational directory did not exist until something actually needed it.

import { chmodSync, lstatSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

const ROOT_DIRECTORY = ".ariadnev";
const OPERATIONAL_DIRECTORY = "operational";
const DERIVED_DIRECTORY = "derived";
const ACTIVITY_DIRECTORY = "activity";
const CONTENT_DIRECTORY = "content";

/** `~/.ariadnev/operational`. `home` comes from the caller — `--home` overrides it. */
export function operationalRoot(home: string): string {
  return join(home, ROOT_DIRECTORY, OPERATIONAL_DIRECTORY);
}

/** A path for something authoritative: the only copy, and never rebuildable. */
export function operationalPath(home: string, ...segments: string[]): string {
  return join(operationalRoot(home), ...segments);
}

/**
 * `~/.ariadnev/operational/activity` — the event log. Authoritative.
 *
 * Deliberately outside `derived/`: these events are the only record that they
 * happened. Everything phases 6-8 compute is derived *from* here, and nothing
 * can rebuild here.
 */
export function activityRoot(home: string): string {
  return operationalPath(home, ACTIVITY_DIRECTORY);
}

/** `~/.ariadnev/operational/derived` — safe to delete in full, at any time. */
export function derivedRoot(home: string): string {
  return join(operationalRoot(home), DERIVED_DIRECTORY);
}

/** A path for an index, cache, or shard: rebuildable from the files beside it. */
export function derivedPath(home: string, ...segments: string[]): string {
  return join(derivedRoot(home), ...segments);
}

/**
 * `~/.ariadnev/operational/derived/content` — one full-text shard per project.
 *
 * UNDER `derived/`, WHERE THE CAPTURED SURFACE PUTS ITS OWN SHARDS ONE LEVEL
 * HIGHER. A shard is rebuilt by re-reading the project's files, so it is
 * derived by this plan's definition, and putting it anywhere else would exempt
 * it from the one invariant that proves so: "delete every derived thing, rebuild,
 * get the same answer" cannot test a file the delete does not reach.
 *
 * The opt-in marker deliberately does NOT live here — it is a decision, not a
 * cache, and deleting derived state must never turn content indexing back on for
 * someone who switched it off.
 */
export function contentRoot(home: string): string {
  return derivedPath(home, CONTENT_DIRECTORY);
}

/** True when `path` sits under `derived/`, so deleting it loses nothing. */
export function isDerived(home: string, path: string): boolean {
  return contains(derivedRoot(home), path);
}

function contains(root: string, path: string): boolean {
  const inside = relative(resolve(root), resolve(path));
  return inside !== "" && !inside.startsWith("..") && !inside.startsWith(`${sep}..`) && !/^([A-Za-z]:)?[\\/]/.test(inside);
}

/**
 * Create `path` and its parents, 0700, and hand it back.
 *
 * Refuses anything outside `~/.ariadnev/operational/`: every caller of this
 * module is storing operational state, and a path that escaped the root would
 * be creating private directories somewhere nobody is looking for them.
 */
export function ensureOperationalDirectory(home: string, path: string): string {
  const root = operationalRoot(home);
  if (resolve(path) !== resolve(root) && !contains(root, path)) {
    throw new Error(`operational path escapes ${root}: ${path}`);
  }
  mkdirSync(path, { recursive: true, mode: 0o700 });
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`operational path is not a regular directory: ${path}`);
  // mkdirSync's mode is masked by the process umask, so set it explicitly.
  if (process.platform !== "win32") chmodSync(path, 0o700);
  return path;
}

/**
 * Delete a tree, tolerating Windows' refusal to remove a file another handle
 * still has open.
 *
 * MEASURED, NOT ANTICIPATED. The first cross-target Gate A run passed all
 * twelve SQLite conformance cases on windows-x64 — FTS5 and WAL included — and
 * then failed removing the temp directory afterwards:
 *
 *   EBUSY: resource busy or locked, rm 'C:\...\Temp\ariadnev-storage-bun-OKkHKc'
 *
 * On Windows a file cannot be unlinked while a handle is open, and closing a
 * SQLite database does not always return the handle before the next syscall
 * runs. POSIX has no equivalent, so this never appears on Linux or macOS.
 *
 * This matters far past a test fixture. "Delete the derived index and rebuild
 * it" is the operation ADR 0014 rests on, and `av analytics delete` is a
 * command this plan will ship. Every caller rediscovering EBUSY on its own is
 * how a doctrine becomes platform-specific by accident, so the retry lives here
 * once, next to the paths it deletes.
 */
export function removeStorageTree(path: string): void {
  // Recursive + force + retry is an enthusiastic combination, and every caller
  // builds its argument by joining a `home` that came from `--home`. An empty
  // or relative one would resolve against the process CWD and delete something
  // else entirely, so the cheap assertion goes first.
  if (!isAbsolute(path)) throw new Error(`refusing to remove a relative path: ${path}`);
  // The retry loop is written out rather than delegated to `rmSync`'s own
  // `maxRetries`. Passing that option changed nothing on windows-x64 under Bun,
  // so it is not something this can rely on across both runtimes.
  const deadline = 10;
  for (let attempt = 1; ; attempt += 1) {
    try {
      rmSync(path, { recursive: true, force: true });
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (attempt >= deadline || (code !== "EBUSY" && code !== "EPERM" && code !== "ENOTEMPTY")) {
        // Name what is still there. A bare EBUSY on the third CI run teaches
        // nothing; the file that is stuck is the whole diagnosis.
        throw new Error(`could not remove ${path} after ${attempt} attempt(s) (${code}): still holding ${describeTree(path)}`, { cause: error });
      }
      sleepBriefly(attempt * 20);
    }
  }
}

/** What is left in a tree that refused to go, for an error message. */
function describeTree(path: string): string {
  try {
    return readdirSync(path, { recursive: true }).map(String).sort().join(", ") || "(nothing — the directory itself is held)";
  } catch (error) {
    return `(unreadable: ${(error as NodeJS.ErrnoException).code})`;
  }
}

/**
 * Block for a few milliseconds without pulling in an async boundary.
 *
 * `removeStorageTree` is synchronous because everything around it is — the
 * drivers, the paths, the commands that will call it. Making it async to sleep
 * would push a promise through every one of them for the sake of a retry that
 * only ever fires on Windows.
 */
function sleepBriefly(milliseconds: number): void {
  // `Atomics.wait` blocks the thread without spinning, works on the main thread
  // in both Node and Bun, and keeps this function synchronous. A busy loop would
  // burn a core for up to a second on the one path where the machine is already
  // struggling to release a file handle.
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

/** Throw away every rebuildable artifact. Authoritative files are untouched. */
export function removeDerived(home: string): void {
  removeStorageTree(derivedRoot(home));
}
