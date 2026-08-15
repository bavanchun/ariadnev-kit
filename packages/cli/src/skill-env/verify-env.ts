// Four-state check on a skill's Python environment.
//
// The costly definition of "corrupt" would be "importing it failed", but that
// means running third-party code every time someone asks for status. The
// default here reads installed metadata only — `.dist-info` directories and
// their RECORD listings — and never executes anything. `--deep` opts into a
// real import, which the caller runs in a separate, timed-out child process;
// this module still executes nothing itself.
import { lockDigest, type Lockfile } from "./lockfile.js";
import { envPath, envPython, envSentinel } from "./env-root.js";

export type EnvStatus = "ok" | "missing" | "corrupt" | "unknown";

export interface EnvVerdict {
  status: EnvStatus;
  /** One line a human can act on. */
  detail: string;
  /** Environment directory, when the skill has one at all. */
  envDir?: string;
}

export interface VerifyDeps {
  fileExists(path: string): boolean;
  dirExists(path: string): boolean;
  /** Entry names directly inside a directory; [] when absent. */
  listDir(path: string): string[];
  /** File contents, or null when unreadable. */
  readFile(path: string): string | null;
}

export interface VerifyOpts {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  /** Also verify every file RECORD lists, not just that the package is present. */
  thorough?: boolean;
}

/** `site-packages` under a venv, across layouts. */
function sitePackages(envDir: string, deps: VerifyDeps, platform: NodeJS.Platform): string[] {
  if (platform === "win32") return [`${envDir}/Lib/site-packages`];
  const lib = `${envDir}/lib`;
  // A venv holds exactly one pythonX.Y directory, but its name depends on the
  // interpreter that built it, so it is discovered rather than assumed.
  return deps
    .listDir(lib)
    .filter((n) => n.startsWith("python"))
    .map((n) => `${lib}/${n}/site-packages`);
}

/** Installed distributions, keyed by normalized name → version. */
function installedPackages(siteDirs: string[], deps: VerifyDeps): Map<string, { version: string; distInfo: string }> {
  const found = new Map<string, { version: string; distInfo: string }>();
  for (const dir of siteDirs) {
    for (const entry of deps.listDir(dir)) {
      if (!entry.endsWith(".dist-info")) continue;
      const base = entry.slice(0, -".dist-info".length);
      const dash = base.lastIndexOf("-");
      if (dash === -1) continue;
      const name = base.slice(0, dash).toLowerCase().replace(/[-_.]+/g, "-");
      found.set(name, { version: base.slice(dash + 1), distInfo: `${dir}/${entry}` });
    }
  }
  return found;
}

/** Paths RECORD claims were installed, relative to site-packages. */
function recordedFiles(record: string): string[] {
  const paths: string[] = [];
  for (const line of record.split("\n")) {
    if (line.trim() === "") continue;
    // RECORD is CSV: path,hash,size. Paths containing commas are quoted.
    const path = line.startsWith('"') ? line.slice(1, line.indexOf('"', 1)) : line.split(",")[0];
    if (path) paths.push(path);
  }
  return paths;
}

/**
 * Verify one skill's environment. `lock` is null when the skill declares no
 * runtime dependencies — the common case, and an `ok` one: there is nothing to
 * build and nothing that can rot.
 */
export function verifyEnv(skill: string, lock: Lockfile | null, deps: VerifyDeps, opts: VerifyOpts = {}): EnvVerdict {
  if (lock === null) {
    return { status: "ok", detail: `${skill} declares no runtime dependencies — no environment needed` };
  }

  const platform = opts.platform ?? process.platform;
  const digest = lockDigest(lock);
  const envDir = envPath(digest, opts.env);

  if (!deps.dirExists(envDir)) {
    return { status: "missing", detail: `no environment for ${skill} — run "ariadnev skill install ${skill}"`, envDir };
  }
  if (!deps.fileExists(envSentinel(envDir))) {
    // The directory exists but was never finished: an interrupted build, not a
    // usable environment.
    return { status: "corrupt", detail: `environment for ${skill} was never completed`, envDir };
  }
  if (!deps.fileExists(envPython(envDir, platform))) {
    return { status: "corrupt", detail: `environment for ${skill} has no interpreter`, envDir };
  }

  const siteDirs = sitePackages(envDir, deps, platform);
  if (siteDirs.length === 0) {
    return { status: "corrupt", detail: `environment for ${skill} has no site-packages`, envDir };
  }

  const installed = installedPackages(siteDirs, deps);
  for (const pkg of lock.packages) {
    const hit = installed.get(pkg.name);
    if (!hit) {
      return { status: "corrupt", detail: `${pkg.name} is missing from the environment for ${skill}`, envDir };
    }
    if (hit.version !== pkg.version) {
      return {
        status: "corrupt",
        detail: `${pkg.name} is ${hit.version} but the lock pins ${pkg.version}`,
        envDir,
      };
    }
    const record = deps.readFile(`${hit.distInfo}/RECORD`);
    if (record === null) {
      return { status: "corrupt", detail: `${pkg.name} has no RECORD — its install did not finish`, envDir };
    }
    if (opts.thorough) {
      const site = hit.distInfo.slice(0, hit.distInfo.lastIndexOf("/"));
      const gone = recordedFiles(record).find((rel) => !deps.fileExists(`${site}/${rel}`));
      if (gone) {
        return { status: "corrupt", detail: `${pkg.name} is missing an installed file: ${gone}`, envDir };
      }
    }
  }

  return { status: "ok", detail: `${lock.packages.length} package(s) present and pinned`, envDir };
}

/**
 * No honest claim about the environment is possible. Two different situations
 * reach here and they need different sentences: nothing states what the skill
 * needs, or something does but there is no pinned lock to build and verify
 * against. Reporting the first sentence for the second case tells the reader to
 * go declare dependencies that are already declared.
 *
 * Distinct from `ok` on purpose: silence is not evidence of health.
 */
export function unknownEnv(skill: string, reason: "undeclared" | "unlocked" = "undeclared"): EnvVerdict {
  return {
    status: "unknown",
    detail:
      reason === "unlocked"
        ? `${skill} declares Python dependencies but has no pinned lock — run \`ariadnev skill install ${skill}\` to build and pin one`
        : `${skill} ships Python but declares no dependencies — run scan-python-imports.mjs and review the draft`,
  };
}
