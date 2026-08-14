// Build, remove, and garbage-collect skill environments.
//
// The commands are *planned* here as argv arrays rather than executed, so the
// exact invocation is unit-testable without a network or an interpreter. The
// CLI layer runs them.
import { lockDigest, toPipRequirements, type Lockfile } from "./lockfile.js";
import { envPath, envPython, envSentinel, envsRoot } from "./env-root.js";

export interface EnvBuildPlan {
  digest: string;
  envDir: string;
  /** Written before the install so pip can read pinned hashes from a file. */
  requirementsPath: string;
  requirementsBody: string;
  /** Sentinel content, written only after the install succeeds. */
  sentinelPath: string;
  sentinelBody: string;
  steps: { argv: string[]; description: string }[];
}

/**
 * Plan a build. `--require-hashes` makes pip refuse anything whose artifact
 * hash is not listed, and `--no-deps` keeps it from quietly pulling a
 * transitive package the lock never vetted — with a complete lock, every
 * dependency is already named.
 */
export function planEnvBuild(lock: Lockfile, python: string, env?: NodeJS.ProcessEnv): EnvBuildPlan {
  const digest = lockDigest(lock);
  const envDir = envPath(digest, env);
  const requirementsPath = `${envDir}/.ariadnev-requirements.txt`;
  return {
    digest,
    envDir,
    requirementsPath,
    requirementsBody: toPipRequirements(lock),
    sentinelPath: envSentinel(envDir),
    sentinelBody: `${JSON.stringify({ digest, python: lock.python, packages: lock.packages.length }, null, 2)}\n`,
    steps: [
      { argv: [python, "-m", "venv", envDir], description: "create the virtual environment" },
      {
        argv: [
          envPython(envDir),
          "-m",
          "pip",
          "install",
          "--require-hashes",
          "--no-deps",
          "--disable-pip-version-check",
          "-r",
          requirementsPath,
        ],
        description: "install the locked packages",
      },
    ],
  };
}

export interface GcDeps {
  /** Directory names directly under the environments root. */
  listEnvs(root: string): string[];
}

export interface GcResult {
  /** Environment directories no installed skill refers to. */
  removable: string[];
  kept: string[];
}

/**
 * Environments no longer referenced by any lock. Keying environments by
 * dependency digest means two skills with identical dependencies share one, so
 * an environment is only removable once *every* referrer is gone.
 */
export function planEnvGc(locks: Lockfile[], deps: GcDeps, env?: NodeJS.ProcessEnv): GcResult {
  const root = envsRoot(env);
  const referenced = new Set(locks.map(lockDigest));
  const removable: string[] = [];
  const kept: string[] = [];
  for (const name of deps.listEnvs(root)) {
    (referenced.has(name) ? kept : removable).push(`${root}/${name}`);
  }
  return { removable, kept };
}

/**
 * Interpreter a skill's scripts must run under: its own environment when it
 * has one, otherwise the system interpreter. Most skills that ship Python
 * import nothing outside the standard library and legitimately take the
 * second path.
 */
export function interpreterFor(lock: Lockfile | null, systemPython: string, env?: NodeJS.ProcessEnv): string {
  if (lock === null) return systemPython;
  return envPython(envPath(lockDigest(lock), env));
}
