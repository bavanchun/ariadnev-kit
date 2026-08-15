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
import { evaluateMarker, markerEnvironment, type MarkerEnvironment } from "./marker.js";

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

/**
 * Which interpreter an environment was built with, read from files rather than
 * by running it. `pyvenv.cfg` records the exact version; failing that, the
 * `lib/pythonX.Y` directory gives the pair, which is what markers ask about
 * nearly always.
 */
function venvVersion(
  envDir: string,
  siteDirs: string[],
  deps: VerifyDeps,
  platform: NodeJS.Platform,
): { full: string; implementation: string } | null {
  const cfg = deps.readFile(`${envDir}/pyvenv.cfg`);
  if (cfg) {
    const version = /^\s*version(?:_info)?\s*=\s*(\d+(?:\.\d+)*)/m.exec(cfg);
    const implementation = /^\s*implementation\s*=\s*(\S+)/m.exec(cfg);
    if (version) return { full: version[1], implementation: implementation?.[1] ?? "CPython" };
  }
  if (platform !== "win32") {
    const dir = siteDirs.map((s) => /python(\d+\.\d+)/.exec(s)).find((m) => m !== null);
    if (dir) return { full: `${dir[1]}.0`, implementation: "CPython" };
  }
  return null;
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
 * Top-level modules a distribution installs, read from its RECORD.
 *
 * Derived rather than guessed, because a distribution's name routinely is not
 * its import name: `python-docx` imports as `docx`, `pillow` as `PIL`,
 * `scikit-learn` as `sklearn`. Turning hyphens into underscores — the obvious
 * shortcut — gets all three wrong and would report a healthy environment as
 * corrupt.
 */
export function topLevelModules(record: string): string[] {
  const modules = new Set<string>();
  for (const path of recordedFiles(record)) {
    const [head, ...rest] = path.split("/");
    // Anything outside site-packages (`../../bin/f2py`) or beside it
    // (`numpy-2.1.0.dist-info/…`, `*.data/…`) is not importable.
    if (head === "" || head === ".." || head.endsWith(".dist-info") || head.endsWith(".data")) continue;
    // `__pycache__` sits beside the packages and is listed in their RECORDs; it
    // is a cache directory, not something importable.
    if (head.startsWith("__")) continue;
    const name = rest.length > 0 ? head : head.endsWith(".py") ? head.slice(0, -3) : "";
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) modules.add(name);
  }
  return [...modules].sort();
}

/**
 * The modules a `--deep` check should import: every top-level module belonging
 * to a locked package that applies here. Marker-excluded packages are not
 * installed, so importing them would fail by design.
 */
export function importableModules(lock: Lockfile, deps: VerifyDeps, opts: VerifyOpts = {}): string[] {
  const platform = opts.platform ?? process.platform;
  const envDir = envPath(lockDigest(lock), opts.env);
  const siteDirs = sitePackages(envDir, deps, platform);
  const installed = installedPackages(siteDirs, deps);
  const version = venvVersion(envDir, siteDirs, deps, platform);
  const markerEnv = version ? markerEnvironment(version.full, platform, process.arch, version.implementation) : null;

  const modules = new Set<string>();
  for (const pkg of lock.packages) {
    if (pkg.marker && (!markerEnv || !evaluateMarker(pkg.marker, markerEnv))) continue;
    const hit = installed.get(pkg.name);
    const record = hit ? deps.readFile(`${hit.distInfo}/RECORD`) : null;
    if (record) for (const name of topLevelModules(record)) modules.add(name);
  }
  return [...modules].sort();
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

  // Only needed once a package is conditional, so an environment whose lock has
  // no markers never has to answer "which interpreter is this".
  let markerEnv: MarkerEnvironment | null = null;
  if (lock.packages.some((p) => p.marker)) {
    const version = venvVersion(envDir, siteDirs, deps, platform);
    if (!version) {
      return { status: "corrupt", detail: `cannot read the interpreter version of ${skill}'s environment`, envDir };
    }
    markerEnv = markerEnvironment(version.full, platform, process.arch, version.implementation);
  }

  const installed = installedPackages(siteDirs, deps);
  for (const pkg of lock.packages) {
    // A package its marker excludes is meant to be absent here. Requiring it
    // would call every healthy non-Windows environment corrupt.
    if (markerEnv && !evaluateMarker(pkg.marker, markerEnv)) continue;
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
      const gone = recordedFiles(record)
        // RECORD lists the bytecode pip compiled at install time, down to the
        // interpreter that compiled it (`…cpython-314.pyc`). Python regenerates
        // it on demand and renames it on an upgrade, so a missing `.pyc` is
        // routine — calling it corruption would flag healthy environments.
        .filter((rel) => !rel.includes("__pycache__/"))
        .find((rel) => !deps.fileExists(`${site}/${rel}`));
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
        ? // Not "run install": installing replays a lock, it does not resolve
          // one. Resolving needs the network and a review, so it is a
          // maintainer's step and the message has to say so.
          `${skill} declares Python dependencies but has no pinned lock — a maintainer runs \`generate-skill-lock.ts ${skill}\` and commits the result`
        : `${skill} ships Python but declares no dependencies — run scan-python-imports.mjs and review the draft`,
  };
}
