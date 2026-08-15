// Resolve a skill's declared dependencies once, and write the pinned,
// hash-verified lock that `ariadnev skill install` replays.
//
// A maintainer runs this, not a user: it needs the network, and the point of a
// lock is that the resolution happened once and was reviewed. Users install
// from the committed result.
//
//   bun scripts/generate-skill-lock.ts <skill>...      # or --all
//   bun scripts/generate-skill-lock.ts --all --check   # fail if a lock is stale
//
// The resolution is universal — one lock for every platform and interpreter,
// with PEP 508 markers carried through. Resolving for this machine instead
// would produce a lock that installs here and nowhere else.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { LOCKFILE_VERSION, serializeLockfile, type LockedPackage, type Lockfile } from "../src/skill-env/lockfile.js";
import { isDevRequirementsPath, needsEnvironment, parseRequirements } from "../src/skill-env/read-requirements.js";
import { parseCompiled } from "../src/skill-env/parse-compiled.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const KIT_SKILLS = join(HERE, "..", "..", "..", "kit", "skills");
const LOCK_FILE = "ariadnev-lock.json";
/**
 * The floor the source skills state ("Python 3.10+ required"). Resolving at the
 * floor keeps the lock installable on the oldest interpreter the skills claim
 * to support; a universal resolution keeps it installable on newer ones too.
 */
const DEFAULT_PYTHON = "3.10";

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) walk(abs, acc);
    else acc.push(abs);
  }
  return acc;
}

/** The one file that says what a skill needs at run time, or null. */
function runtimeDeclaration(skillDir: string): string | null {
  const declarations = walk(skillDir)
    .filter((p) => /(?:^|[/\\])requirements[^/\\]*\.txt$/.test(p))
    .filter((p) => !isDevRequirementsPath(p))
    .filter((p) => needsEnvironment(parseRequirements(readFileSync(p, "utf8"))));
  if (declarations.length === 0) return null;
  if (declarations.length > 1) {
    throw new Error(
      `${skillDir} declares runtime dependencies in ${declarations.length} files; a skill gets one environment:\n  ${declarations.join("\n  ")}`,
    );
  }
  return declarations[0];
}

function resolve(requirements: string, python: string): LockedPackage[] {
  const run = spawnSync(
    "uv",
    [
      "pip",
      "compile",
      requirements,
      "--generate-hashes",
      "--universal",
      "--no-header",
      "--no-annotate",
      "--python-version",
      python,
      // No `--output-file`: uv prints the resolution to stdout by default, and
      // `--output-file -` creates a file literally named `-` beside the caller.
    ],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  if (run.error && (run.error as NodeJS.ErrnoException).code === "ENOENT") {
    throw new Error("uv is not installed — this script resolves with `uv pip compile` (https://docs.astral.sh/uv/)");
  }
  if (run.status !== 0) throw new Error(`uv could not resolve ${requirements}:\n${run.stderr}`);
  return parseCompiled(run.stdout);
}

function main(argv: string[]): number {
  const check = argv.includes("--check");
  const pythonAt = argv.indexOf("--python-version");
  const python = pythonAt === -1 ? DEFAULT_PYTHON : argv[pythonAt + 1];
  const named = argv.filter((a) => !a.startsWith("--") && a !== python);

  const skills = argv.includes("--all")
    ? readdirSync(KIT_SKILLS, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort()
    : named;
  if (skills.length === 0) {
    console.error("usage: bun scripts/generate-skill-lock.ts <skill>... | --all [--check] [--python-version X.Y]");
    return 2;
  }

  let stale = 0;
  for (const skill of skills) {
    const skillDir = join(KIT_SKILLS, skill);
    if (!existsSync(skillDir)) throw new Error(`unknown skill: ${skill}`);
    const declaration = runtimeDeclaration(skillDir);
    if (!declaration) {
      if (!argv.includes("--all")) console.log(`${skill}: declares no runtime dependencies — nothing to lock`);
      continue;
    }

    const lock: Lockfile = {
      lockfileVersion: LOCKFILE_VERSION,
      skill,
      python,
      packages: resolve(declaration, python),
    };
    const serialized = serializeLockfile(lock);
    const lockPath = join(dirname(declaration), LOCK_FILE);
    const previous = existsSync(lockPath) ? readFileSync(lockPath, "utf8") : null;

    if (check) {
      if (previous !== serialized) {
        stale += 1;
        console.error(`${skill}: ${relative(process.cwd(), lockPath)} does not match a fresh resolution`);
      }
      continue;
    }
    if (previous === serialized) {
      console.log(`${skill}: unchanged (${lock.packages.length} packages)`);
      continue;
    }
    writeFileSync(lockPath, serialized);
    console.log(`${skill}: wrote ${relative(process.cwd(), lockPath)} — ${lock.packages.length} packages, python ${python}`);
  }
  return stale > 0 ? 1 : 0;
}

process.exit(main(process.argv.slice(2)));
