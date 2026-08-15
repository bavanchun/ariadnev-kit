// `ariadnev skill …` — manage the Python environments some skills need to run
// their scripts, and run those scripts under the right interpreter.
//
// Most skills that ship Python import nothing outside the standard library, so
// the common answers here are "no environment needed" and "run it on the
// system interpreter". Only a skill with a reviewed lock gets one built.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getKitRoot } from "../kit/embedded-kit.js";
import { parseLockfile, type Lockfile } from "../skill-env/lockfile.js";
import { needsEnvironment, parseRequirements } from "../skill-env/read-requirements.js";
import { envsRoot } from "../skill-env/env-root.js";
import { interpreterFor, planEnvBuild, planEnvGc } from "../skill-env/venv-manager.js";
import { unknownEnv, verifyEnv, type EnvVerdict, type VerifyDeps } from "../skill-env/verify-env.js";

export type SkillEnvAction = "install" | "verify" | "repair" | "upgrade" | "remove" | "run";

export interface SkillEnvOpts {
  action: SkillEnvAction;
  /** Skill name; omitted means every skill for verify/upgrade. */
  skill?: string;
  /** Remaining argv for `run`: script path, then its own arguments. */
  args?: string[];
  kitRoot?: string;
  /** Interpreter used to create environments and to run stdlib-only scripts. */
  systemPython?: string;
  /** Verify RECORD's files too, and (for verify) import in a child process. */
  deep?: boolean;
  /** `scripts.executionPolicy` from the user's config; `never` blocks `run`. */
  executionPolicy?: "allow" | "never";
  json?: boolean;
  dryRun?: boolean;
}

export interface SkillEnvResult {
  output: string;
  exitCode: 0 | 1;
}

const LOCK_FILE = "ariadnev-lock.json";
/** A locked import is allowed this long to prove itself before we give up. */
const DEEP_IMPORT_TIMEOUT_MS = 30_000;

const realVerifyDeps: VerifyDeps = {
  fileExists: (p) => existsSync(p),
  dirExists: (p) => existsSync(p) && statSync(p).isDirectory(),
  listDir: (p) => {
    try {
      return readdirSync(p);
    } catch {
      return [];
    }
  },
  readFile: (p) => {
    try {
      return readFileSync(p, "utf8");
    } catch {
      return null;
    }
  },
};

interface SkillEnvSource {
  name: string;
  dir: string;
  /** Reviewed, pinned dependency set; null when the skill needs no environment. */
  lock: Lockfile | null;
  /** The skill ships Python but nothing says what it needs. */
  undeclared: boolean;
}

function filesRecursive(dir: string, predicate: (name: string) => boolean, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) filesRecursive(abs, predicate, acc);
    else if (predicate(entry.name)) acc.push(abs);
  }
  return acc;
}

/** Read one skill's dependency situation from the kit. */
export function readSkillEnvSource(skillsRoot: string, name: string): SkillEnvSource {
  const dir = join(skillsRoot, name);
  const lockPath = join(dir, "scripts", LOCK_FILE);
  if (existsSync(lockPath)) {
    return { name, dir, lock: parseLockfile(readFileSync(lockPath, "utf8")), undeclared: false };
  }

  const hasPython = filesRecursive(dir, (f) => f.endsWith(".py")).length > 0;
  if (!hasPython) return { name, dir, lock: null, undeclared: false };

  // Python present but no lock: is there at least a declaration saying it needs
  // nothing at runtime? That is a real answer. Silence is not.
  const declarations = filesRecursive(dir, (f) => /^requirements.*\.txt$/.test(f));
  if (declarations.length === 0) return { name, dir, lock: null, undeclared: true };
  const declaresRuntime = declarations.some((p) => needsEnvironment(parseRequirements(readFileSync(p, "utf8"))));
  return { name, dir, lock: null, undeclared: declaresRuntime };
}

function skillsRootOf(opts: SkillEnvOpts): string {
  const kitRoot = opts.kitRoot ?? getKitRoot(dirname(fileURLToPath(import.meta.url)));
  return join(kitRoot, "skills");
}

function listSkills(skillsRoot: string): string[] {
  if (!existsSync(skillsRoot)) return [];
  return readdirSync(skillsRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

/**
 * Import every locked package in a child process. Kept out of the default
 * path: this executes third-party code, so it happens only on request, only
 * in a separate process, and only with a timeout.
 */
function deepImport(source: SkillEnvSource, python: string): EnvVerdict | null {
  if (!source.lock) return null;
  const modules = source.lock.packages.map((p) => p.name.replace(/-/g, "_"));
  const program = `import importlib,sys\nfor m in ${JSON.stringify(modules)}:\n    importlib.import_module(m)\n`;
  const run = spawnSync(python, ["-c", program], { timeout: DEEP_IMPORT_TIMEOUT_MS, encoding: "utf8" });
  if (run.error && (run.error as NodeJS.ErrnoException).code === "ETIMEDOUT") {
    return { status: "corrupt", detail: `importing ${source.name}'s packages timed out after ${DEEP_IMPORT_TIMEOUT_MS}ms` };
  }
  if (run.status !== 0) {
    const why = (run.stderr ?? "").trim().split("\n").pop() ?? "import failed";
    return { status: "corrupt", detail: `import check failed: ${why}` };
  }
  return null;
}

function verifyOne(source: SkillEnvSource, opts: SkillEnvOpts): EnvVerdict {
  if (source.undeclared) return unknownEnv(source.name);
  const verdict = verifyEnv(source.name, source.lock, realVerifyDeps, { thorough: opts.deep });
  if (verdict.status !== "ok" || !opts.deep) return verdict;
  const python = interpreterFor(source.lock, opts.systemPython ?? "python3");
  return deepImport(source, python) ?? verdict;
}

function buildEnv(source: SkillEnvSource, opts: SkillEnvOpts): string[] {
  if (!source.lock) return [`  ${source.name}: no runtime dependencies — nothing to install`];
  const plan = planEnvBuild(source.lock, opts.systemPython ?? "python3");
  if (opts.dryRun) {
    return [`  ${source.name}: would build ${plan.envDir}`, ...plan.steps.map((s) => `      ${s.argv.join(" ")}`)];
  }
  mkdirSync(plan.envDir, { recursive: true });
  for (const step of plan.steps) {
    // The requirements file has to exist before pip reads it, and only after
    // the venv step has created the directory tree it lives in.
    if (step.argv.includes(plan.requirementsPath)) writeFileSync(plan.requirementsPath, plan.requirementsBody);
    const [cmd, ...rest] = step.argv;
    const run = spawnSync(cmd, rest, { encoding: "utf8" });
    if (run.status !== 0) {
      // Leave no sentinel: a half-built environment must read as corrupt, not
      // as one that is ready to use.
      const why = (run.stderr ?? run.error?.message ?? "").trim().split("\n").pop() ?? "failed";
      throw new Error(`${source.name}: could not ${step.description} — ${why}`);
    }
  }
  writeFileSync(plan.sentinelPath, plan.sentinelBody);
  return [`  ${source.name}: environment ready at ${plan.envDir}`];
}

function collectSources(opts: SkillEnvOpts): SkillEnvSource[] {
  const skillsRoot = skillsRootOf(opts);
  const names = opts.skill ? [opts.skill] : listSkills(skillsRoot);
  if (opts.skill && !existsSync(join(skillsRoot, opts.skill))) {
    throw new Error(`unknown skill: ${opts.skill}`);
  }
  return names.map((n) => readSkillEnvSource(skillsRoot, n));
}

function runScript(opts: SkillEnvOpts): SkillEnvResult {
  if (!opts.skill) throw new Error("ariadnev skill run requires a skill name");
  const [script, ...rest] = opts.args ?? [];
  if (!script) throw new Error("ariadnev skill run requires a script path");

  // Checked before the skill is even resolved: a user who turned execution off
  // gets a refusal, not a partial run with a nicer error later.
  if (opts.executionPolicy === "never") {
    return {
      output: "ariadnev skill run — refused: scripts.executionPolicy is set to `never` in your ariadnev config",
      exitCode: 1,
    };
  }

  const source = collectSources(opts)[0];
  const verdict = verifyOne(source, opts);
  // `missing` and `corrupt` are states we know are broken and can fix, so
  // running would only produce a confusing failure. `unknown` is different: it
  // means nothing declared what the skill needs — the majority of skills that
  // ship Python import only the standard library. Refusing there would make
  // them unusable, so the script runs and the interpreter gets to speak for
  // itself if an import really is missing.
  if (verdict.status === "missing" || verdict.status === "corrupt") {
    return { output: `ariadnev skill run — ${verdict.detail}`, exitCode: 1 };
  }

  const python = interpreterFor(source.lock, opts.systemPython ?? "python3");
  const abs = join(source.dir, script);
  if (!existsSync(abs)) return { output: `ariadnev skill run — no such script: ${script}`, exitCode: 1 };

  // The installed script keeps the bytes it shipped with — no shebang rewrite,
  // no chmod. The interpreter is chosen here instead, which is also what makes
  // an environment-backed skill work without touching its files.
  const run = spawnSync(python, [abs, ...rest], { stdio: "inherit" });
  return { output: "", exitCode: run.status === 0 ? 0 : 1 };
}

export function runSkillEnv(opts: SkillEnvOpts): SkillEnvResult {
  if (opts.action === "run") return runScript(opts);

  const sources = collectSources(opts);

  if (opts.action === "verify") {
    const verdicts = sources.map((s) => ({ skill: s.name, ...verifyOne(s, opts) }));
    const relevant = verdicts.filter((v) => v.envDir !== undefined || v.status !== "ok");
    if (opts.json) {
      return {
        output: JSON.stringify({ verdicts: relevant }, null, 2),
        exitCode: relevant.some((v) => v.status === "corrupt" || v.status === "missing") ? 1 : 0,
      };
    }
    const lines = ["ariadnev skill verify"];
    for (const v of relevant) lines.push(`  ${v.status.padEnd(8)} ${v.skill}: ${v.detail}`);
    if (relevant.length === 0) lines.push("  no skill needs a Python environment");
    return {
      output: lines.join("\n"),
      exitCode: relevant.some((v) => v.status === "corrupt" || v.status === "missing") ? 1 : 0,
    };
  }

  if (opts.action === "install" || opts.action === "upgrade") {
    // Upgrade differs only in that a kit update may have shipped a new lock,
    // which is a new digest and therefore a new environment; the old one is
    // then unreferenced and collected below.
    const lines = [`ariadnev skill ${opts.action}`];
    for (const source of sources) lines.push(...buildEnv(source, opts));
    if (opts.action === "upgrade") lines.push(...collectGarbage(opts));
    return { output: lines.join("\n"), exitCode: 0 };
  }

  if (opts.action === "repair") {
    const lines = ["ariadnev skill repair"];
    for (const source of sources) {
      const verdict = verifyEnv(source.name, source.lock, realVerifyDeps);
      if (verdict.status === "ok" && !opts.deep) {
        lines.push(`  ${source.name}: already ok`);
        continue;
      }
      if (verdict.envDir && !opts.dryRun) rmSync(verdict.envDir, { recursive: true, force: true });
      lines.push(...buildEnv(source, opts));
    }
    return { output: lines.join("\n"), exitCode: 0 };
  }

  // remove: drop this skill's environment, then collect whatever is now unreferenced.
  const lines = ["ariadnev skill remove"];
  const removedFor = new Set(sources.map((s) => s.name));
  const remaining = collectSources({ ...opts, skill: undefined }).filter((s) => !removedFor.has(s.name));
  lines.push(...collectGarbage(opts, remaining.map((s) => s.lock).filter((l): l is Lockfile => l !== null)));
  return { output: lines.join("\n"), exitCode: 0 };
}

/** Remove environments no remaining lock refers to. */
function collectGarbage(opts: SkillEnvOpts, locks?: Lockfile[]): string[] {
  const referenced =
    locks ?? collectSources({ ...opts, skill: undefined }).map((s) => s.lock).filter((l): l is Lockfile => l !== null);
  const root = envsRoot();
  const plan = planEnvGc(referenced, {
    listEnvs: () => {
      if (!existsSync(root)) return [];
      return readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
    },
  });
  if (plan.removable.length === 0) return ["  no unreferenced environments"];
  const lines: string[] = [];
  for (const dir of plan.removable) {
    if (!opts.dryRun) rmSync(dir, { recursive: true, force: true });
    lines.push(`  ${opts.dryRun ? "would remove" : "removed"} unreferenced environment ${dir}`);
  }
  return lines;
}
