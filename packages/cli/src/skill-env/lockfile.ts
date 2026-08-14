// A resolved, pinned dependency set for one skill.
//
// The source declares ranges (`scrapling>=0.2`, `whoisdomain>=1.20260326`).
// Hashing a range is integrity theatre: two installs a week apart resolve to
// different package sets while the declaration's hash never moves. So the
// resolution happens once, is written here with exact versions and artifact
// hashes, and every install replays it with `--require-hashes`.
import { createHash } from "node:crypto";

export const LOCKFILE_VERSION = 1;

export interface LockedPackage {
  /** PEP 503 normalized distribution name. */
  name: string;
  /** Exact version — never a range. */
  version: string;
  /** Artifact hashes, `sha256:<hex>`, one per acceptable wheel/sdist. */
  hashes: string[];
}

export interface Lockfile {
  lockfileVersion: number;
  /** Skill this lock belongs to. */
  skill: string;
  /** Interpreter the resolution was performed against, e.g. "3.11". */
  python: string;
  packages: LockedPackage[];
}

export class LockfileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LockfileError";
  }
}

const HASH = /^sha256:[a-f0-9]{64}$/;
// An exact version only. A lock that admits a range is not a lock.
const VERSION = /^[A-Za-z0-9][A-Za-z0-9.!+*-]*$/;

/**
 * Validate a parsed lock. Fails loudly rather than installing from a lock it
 * cannot vouch for — a silently-accepted unhashed entry defeats the point of
 * `--require-hashes`.
 */
export function validateLockfile(lock: Lockfile): void {
  if (lock.lockfileVersion !== LOCKFILE_VERSION) {
    throw new LockfileError(
      `unsupported lockfileVersion ${lock.lockfileVersion} (expected ${LOCKFILE_VERSION})`,
    );
  }
  if (!lock.skill) throw new LockfileError("lock is missing the skill it belongs to");
  if (!lock.python) throw new LockfileError(`lock for ${lock.skill} does not record a python version`);

  const seen = new Set<string>();
  for (const pkg of lock.packages) {
    if (!VERSION.test(pkg.version)) {
      throw new LockfileError(`${pkg.name}: "${pkg.version}" is not an exact version`);
    }
    if (pkg.hashes.length === 0) {
      throw new LockfileError(`${pkg.name}==${pkg.version} has no hashes — refusing to install unverifiable packages`);
    }
    for (const hash of pkg.hashes) {
      if (!HASH.test(hash)) throw new LockfileError(`${pkg.name}: malformed hash "${hash}"`);
    }
    if (seen.has(pkg.name)) throw new LockfileError(`${pkg.name} is locked twice`);
    seen.add(pkg.name);
  }
}

export function parseLockfile(json: string): Lockfile {
  let parsed: Lockfile;
  try {
    parsed = JSON.parse(json) as Lockfile;
  } catch (err) {
    throw new LockfileError(`lock is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
  validateLockfile(parsed);
  return parsed;
}

/** Serialize with packages in a stable order, so the file does not churn. */
export function serializeLockfile(lock: Lockfile): string {
  validateLockfile(lock);
  const ordered: Lockfile = {
    lockfileVersion: lock.lockfileVersion,
    skill: lock.skill,
    python: lock.python,
    packages: [...lock.packages]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((p) => ({ name: p.name, version: p.version, hashes: [...p.hashes].sort() })),
  };
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

/**
 * Identity of the resolved dependency set. Environments are keyed by this, so
 * two skills that resolve to the same packages share one environment and a
 * changed lock never writes into the old environment.
 *
 * Deliberately excludes the skill name: the identity is the package set, not
 * who asked for it.
 */
export function lockDigest(lock: Lockfile): string {
  const canonical = [...lock.packages]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((p) => `${p.name}==${p.version}#${[...p.hashes].sort().join(",")}`)
    .join("\n");
  return createHash("sha256").update(`${lock.python}\n${canonical}`).digest("hex").slice(0, 16);
}

/** The `requirements.txt` body pip installs from, with hashes inline. */
export function toPipRequirements(lock: Lockfile): string {
  const lines: string[] = [];
  for (const pkg of [...lock.packages].sort((a, b) => a.name.localeCompare(b.name))) {
    const hashes = [...pkg.hashes].sort().map((h) => `    --hash=${h}`);
    lines.push([`${pkg.name}==${pkg.version} \\`, ...hashes.map((h, i) => (i === hashes.length - 1 ? h : `${h} \\`))].join("\n"));
  }
  return `${lines.join("\n")}\n`;
}
