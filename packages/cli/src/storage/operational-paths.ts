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

import { chmodSync, lstatSync, mkdirSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

const ROOT_DIRECTORY = ".ariadnev";
const OPERATIONAL_DIRECTORY = "operational";
const DERIVED_DIRECTORY = "derived";

/** `~/.ariadnev/operational`. `home` comes from the caller — `--home` overrides it. */
export function operationalRoot(home: string): string {
  return join(home, ROOT_DIRECTORY, OPERATIONAL_DIRECTORY);
}

/** A path for something authoritative: the only copy, and never rebuildable. */
export function operationalPath(home: string, ...segments: string[]): string {
  return join(operationalRoot(home), ...segments);
}

/** `~/.ariadnev/operational/derived` — safe to delete in full, at any time. */
export function derivedRoot(home: string): string {
  return join(operationalRoot(home), DERIVED_DIRECTORY);
}

/** A path for an index, cache, or shard: rebuildable from the files beside it. */
export function derivedPath(home: string, ...segments: string[]): string {
  return join(derivedRoot(home), ...segments);
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
