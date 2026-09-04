// Strips everything a project file may not decide, before resolution ever sees
// it. Filtering is structural: `resolveConfig` receives a project layer that
// physically has no user-only keys in it, rather than merging first and policing
// afterwards. A merge-then-check design leaks the moment a new key is added and
// nobody remembers to add the check.

import { lstatSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { CONFIG_FIELDS, specFor, type FlatField } from "./config-schema.js";

export interface DroppedKey {
  readonly path: string;
  readonly reason: string;
}

export interface FilterResult {
  /** The project layer with only project-overridable keys left. */
  readonly layer: Record<string, unknown>;
  readonly dropped: readonly DroppedKey[];
  readonly warnings: readonly string[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Every dotted path present in `raw`, stopping at any leaf the schema knows. */
function presentPaths(raw: Record<string, unknown>, prefix: string, out: string[]): void {
  for (const [key, value] of Object.entries(raw)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (isPlainObject(value) && !specFor(path)) presentPaths(value, path, out);
    else out.push(path);
  }
}

function setPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".");
  let node = target;
  for (const part of parts.slice(0, -1)) {
    if (!isPlainObject(node[part])) node[part] = {};
    node = node[part] as Record<string, unknown>;
  }
  node[parts[parts.length - 1]] = value;
}

function readPath(raw: Record<string, unknown>, path: string): unknown {
  let node: unknown = raw;
  for (const part of path.split(".")) {
    if (!isPlainObject(node)) return undefined;
    node = node[part];
  }
  return node;
}

const PROJECT_PATHS = new Set<string>(CONFIG_FIELDS.filter((f: FlatField) => f.spec.layer === "project").map((f) => f.path));

/**
 * The real location a path will occupy, for a path that does not exist yet.
 *
 * `realpathSync` throws `ENOENT` on an absent target, and the settings this
 * guards normally name a directory nothing has created. So walk up to the
 * nearest ancestor that does exist, resolve that, and re-join the segments that
 * did not — which is enough to catch an existing symlink partway along the path,
 * the case a lexical resolve misses entirely.
 *
 * `lstatSync`, not `existsSync`: a dangling symlink does not exist by the latter,
 * so the walk would step straight over it and accept a path whose real location
 * is unknowable. Treating the link as present makes `realpathSync` throw, and a
 * throw is refused.
 *
 * `.native`, not the JS implementation: the latter hands back whatever casing the
 * caller passed, so on a case-insensitive filesystem `.GIT/worktrees` resolves to
 * itself and walks past the `.git` check below. The native resolver returns the
 * name the filesystem actually holds.
 */
function realpathOfPossiblyAbsent(candidate: string): string {
  const tail: string[] = [];
  let probe = candidate;
  while (!present(probe)) {
    const parent = dirname(probe);
    if (parent === probe) break; // the filesystem root always exists
    tail.unshift(basename(probe));
    probe = parent;
  }
  return join(realpathSync.native(probe), ...tail);
}

function present(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Where `candidate` sits relative to `anchor`, both already realpathed, or
 * `null` when it is not strictly below it.
 *
 * Never a string-prefix comparison: that reads `/a/bc` as inside `/a/b`. The
 * `isAbsolute` arm is the load-bearing one on Windows, where a drive-relative
 * `C:foo` is not absolute as written but resolves onto another drive, and
 * `relative` across drives answers with an absolute path.
 */
function insideRelative(anchor: string, candidate: string): string | null {
  const rel = relative(anchor, candidate);
  if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return null;
  return rel;
}

/**
 * Why a project file may not set this worktree root, or `null` when it may.
 *
 * A project config file is committed, so it arrives with whatever repository
 * the reader cloned, and this value decides where directories get created on
 * their disk. The value is therefore confined to the repository that supplied
 * it — not to that repository's parent, which on a normal machine is a projects
 * directory or the home directory and would let a clone name its neighbours.
 *
 * The same key set in the user's own config is not bounded and may be absolute.
 * Trust follows who wrote the file, not what the key is called.
 */
function refuseWorktreeRoot(value: unknown, anchor: string): string | null {
  if (typeof value !== "string") return "it must be a string";
  if (value.trim() === "") return "it is empty";
  if (/[\0\r\n]/.test(value)) return "it contains control characters";
  if (isAbsolute(value)) return "a project file may only set a relative path — set an absolute one in your user config";
  if (value.startsWith("~")) return "`~` is not expanded here — set a home-relative path in your user config instead";

  let realAnchor: string;
  let realCandidate: string;
  try {
    realAnchor = realpathSync.native(anchor);
    realCandidate = realpathOfPossiblyAbsent(resolve(anchor, value));
  } catch {
    return "it could not be resolved to a real path";
  }
  const rel = insideRelative(realAnchor, realCandidate);
  if (rel === null) return `it resolves outside ${realAnchor}`;
  // Inside the repository, but inside the part of it git owns. A checkout can be
  // created at `.git/worktrees/<name>`, where it collides with the admin
  // directory git makes for that same worktree; what prune and gc then do is
  // undefined. A clone does not get to aim anything at this machine's git
  // metadata.
  if (rel.split(sep)[0] === ".git") return "it resolves inside the repository's .git directory";
  return null;
}

/**
 * Project-layer keys whose *value* is checked, not just their key name.
 *
 * Almost every project key is safe whatever it says, because it names something
 * inside the repository by construction. A key that names a filesystem
 * destination is not, so it gets a check here — in the config layer, where every
 * consumer of `resolveConfig` inherits it — rather than in whichever script
 * happens to read it.
 */
type ValueCheck = (value: unknown, anchor: string) => string | null;

// Keyed by path, and most paths have no entry — so the lookup type has to admit
// that, or the guard at the call site is dead by type while still being needed.
const VALUE_CHECKS: Record<string, ValueCheck | undefined> = {
  "worktree.root": refuseWorktreeRoot,
};

export function filterProjectLayer(raw: unknown, sourcePath: string): FilterResult {
  if (raw === null || raw === undefined) return { layer: {}, dropped: [], warnings: [] };
  if (!isPlainObject(raw)) {
    return {
      layer: {},
      dropped: [],
      warnings: [`${sourcePath} does not contain a JSON object — the whole project layer was ignored`],
    };
  }

  const paths: string[] = [];
  presentPaths(raw, "", paths);

  const layer: Record<string, unknown> = {};
  const dropped: DroppedKey[] = [];
  const warnings: string[] = [];

  // The directory that owns the `.ariadnev/` the value came from: for
  // `<repo>/.ariadnev/config.json`, `<repo>`.
  const anchor = dirname(dirname(sourcePath));

  for (const path of paths) {
    if (PROJECT_PATHS.has(path)) {
      const value = readPath(raw, path);
      const check = VALUE_CHECKS[path];
      // An explicit null is the schema's own "unset" and needs no check.
      const refusal = check && value !== null && value !== undefined ? check(value, anchor) : null;
      if (refusal !== null) {
        dropped.push({ path, reason: "out-of-bounds value" });
        warnings.push(`${path} was ignored in ${sourcePath} — ${refusal}`);
        continue;
      }
      setPath(layer, path, value);
      continue;
    }
    const spec = specFor(path);
    if (spec) {
      dropped.push({ path, reason: "user-only key" });
      warnings.push(
        `${path} is a user-only setting and was ignored in ${sourcePath} — set it in your user config instead`,
      );
      continue;
    }
    dropped.push({ path, reason: "unknown key" });
    warnings.push(`${path} is not a known ariadnev setting and was ignored in ${sourcePath}`);
  }

  return { layer, dropped, warnings };
}
