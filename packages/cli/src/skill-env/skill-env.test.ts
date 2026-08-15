import { describe, it, expect } from "vitest";
import {
  parseRequirements,
  parseRequirementLine,
  normalizeName,
  needsEnvironment,
  isDevRequirementsPath,
} from "./read-requirements.js";
import { parseLockfile, serializeLockfile, validateLockfile, lockDigest, toPipRequirements, LockfileError, LOCKFILE_VERSION, type Lockfile } from "./lockfile.js";
import { envsRoot, envPython, envSentinel } from "./env-root.js";
import { verifyEnv, unknownEnv, topLevelModules, importableModules, type VerifyDeps } from "./verify-env.js";
import { planEnvBuild, planEnvGc, interpreterFor } from "./venv-manager.js";

const ENV = { ARIADNEV_ENVS_DIR: "/envs" } as NodeJS.ProcessEnv;

function lock(overrides: Partial<Lockfile> = {}): Lockfile {
  return {
    lockfileVersion: LOCKFILE_VERSION,
    skill: "cti-expert",
    python: "3.11",
    packages: [{ name: "numpy", version: "2.1.0", hashes: [`sha256:${"a".repeat(64)}`] }],
    ...overrides,
  };
}

describe("parseRequirements", () => {
  // Verbatim shapes from the source skills' requirements files.
  it("separates test tooling from runtime dependencies", () => {
    // Eight of the ten source files look exactly like this: a header, prose,
    // and pytest. Reading it as a runtime declaration would install a test
    // runner the skill never imports.
    const file = parseRequirements(`# Shopify Skill Dependencies
# Python 3.10+ required

# No Python package dependencies - uses only standard library

# Testing dependencies (dev)
pytest>=8.0.0
pytest-cov>=4.1.0
pytest-mock>=3.12.0
`);
    expect(file.runtime).toEqual([]);
    expect(file.dev.map((d) => d.name)).toEqual(["pytest", "pytest-cov", "pytest-mock"]);
    expect(needsEnvironment(file)).toBe(false);
  });

  it("reads a real runtime declaration", () => {
    const file = parseRequirements(`python-docx>=1.0.0
matplotlib>=3.8.0
networkx>=3.2.0
numpy>=1.24.0
whoisdomain>=1.20260326
scrapling>=0.2
`);
    expect(file.runtime.map((r) => r.name)).toEqual([
      "python-docx", "matplotlib", "networkx", "numpy", "whoisdomain", "scrapling",
    ]);
    expect(file.runtime[0].specifier).toBe(">=1.0.0");
    expect(needsEnvironment(file)).toBe(true);
  });

  it("keeps extras and markers, and records -r includes", () => {
    const file = parseRequirements(`requests[security,socks]>=2.0 ; python_version >= "3.9"
-r tests/requirements.txt
--index-url https://example.invalid/simple
`);
    expect(file.runtime[0]).toMatchObject({
      name: "requests",
      extras: ["security", "socks"],
      specifier: ">=2.0",
      marker: 'python_version >= "3.9"',
    });
    expect(file.includes).toEqual(["tests/requirements.txt"]);
    // A pip flag is not a dependency and must not land in either bucket.
    expect(file.runtime).toHaveLength(1);
  });

  it("reports a line it cannot honestly pin instead of guessing", () => {
    const file = parseRequirements("git+https://example.invalid/pkg.git#egg=pkg\n");
    expect(file.runtime).toEqual([]);
    expect(file.unparsed).toHaveLength(1);
  });

  it("strips a comment only at a boundary, and reports the rest as unparsed", () => {
    // pip only treats `#` as a comment at the start of a line or after
    // whitespace. `pkg==1.0#x` is therefore not a comment — and not a valid
    // requirement either, so it must surface rather than be read as "pkg".
    expect(parseRequirements("pkg==1.0  # pin\n").runtime[0].specifier).toBe("==1.0");
    expect(parseRequirements("pkg==1.0#x\n").unparsed).toEqual(["pkg==1.0#x"]);
    expect(parseRequirementLine("pkg>=1.0,<2.0")?.specifier).toBe(">=1.0,<2.0");
  });

  it("normalizes names per PEP 503", () => {
    expect(normalizeName("Python_Docx")).toBe("python-docx");
    expect(normalizeName("zope.interface")).toBe("zope-interface");
  });

  it("reads a requirements file's directory as the statement of what it is for", () => {
    expect(isDevRequirementsPath("skills/databases/scripts/tests/requirements.txt")).toBe(true);
    expect(isDevRequirementsPath("skills/databases/scripts/test/requirements.txt")).toBe(true);
    expect(isDevRequirementsPath("skills/databases/scripts/requirements.txt")).toBe(false);
    // A skill whose name contains "test" is not a test directory.
    expect(isDevRequirementsPath("skills/tests-writer/scripts/requirements.txt")).toBe(false);
  });
});

describe("lockfile", () => {
  it("round-trips with stable ordering", () => {
    const l = lock({
      packages: [
        { name: "numpy", version: "2.1.0", hashes: [`sha256:${"b".repeat(64)}`, `sha256:${"a".repeat(64)}`] },
        { name: "matplotlib", version: "3.9.0", hashes: [`sha256:${"c".repeat(64)}`] },
      ],
    });
    const parsed = parseLockfile(serializeLockfile(l));
    expect(parsed.packages.map((p) => p.name)).toEqual(["matplotlib", "numpy"]);
    expect(parsed.packages[1].hashes[0]).toBe(`sha256:${"a".repeat(64)}`);
  });

  it("refuses a range, a missing hash, a malformed hash, and a duplicate", () => {
    expect(() => validateLockfile(lock({ packages: [{ name: "numpy", version: ">=1.0", hashes: [`sha256:${"a".repeat(64)}`] }] })))
      .toThrow(/not an exact version/);
    expect(() => validateLockfile(lock({ packages: [{ name: "numpy", version: "1.0", hashes: [] }] })))
      .toThrow(/no hashes/);
    expect(() => validateLockfile(lock({ packages: [{ name: "numpy", version: "1.0", hashes: ["md5:abc"] }] })))
      .toThrow(/malformed hash/);
    const dup = { name: "numpy", version: "1.0", hashes: [`sha256:${"a".repeat(64)}`] };
    expect(() => validateLockfile(lock({ packages: [dup, dup] }))).toThrow(/locked twice/);
  });

  it("locks one name twice only when the markers keep them apart", () => {
    // A universal resolution pins numpy differently per interpreter range, and
    // refusing that would make every scientific lock impossible. Twice under
    // the same condition is still a contradiction.
    const hashes = [`sha256:${"a".repeat(64)}`];
    const split = lock({
      packages: [
        { name: "numpy", version: "2.2.6", hashes, marker: "python_full_version < '3.11'" },
        { name: "numpy", version: "2.5.2", hashes, marker: "python_full_version >= '3.11'" },
      ],
    });
    expect(() => validateLockfile(split)).not.toThrow();
    expect(lockDigest(split)).not.toBe(lockDigest(lock({ packages: split.packages.map((p) => ({ ...p, marker: undefined })) })));
  });

  it("refuses a marker that could smuggle a second requirement into the pip file", () => {
    // Every package is one line of a requirements file. A marker carrying a
    // newline or a continuation writes a line of its own — one nothing hashed.
    const hashes = [`sha256:${"a".repeat(64)}`];
    expect(() => validateLockfile(lock({ packages: [{ name: "numpy", version: "1.0", hashes, marker: "x\nevil==1" }] })))
      .toThrow(/spans lines/);
    expect(() => validateLockfile(lock({ packages: [{ name: "numpy", version: "1.0", hashes, marker: "weather == 'x'" }] })))
      .toThrow(/unknown marker variable/);
  });

  it("writes the marker into the pip requirements, where pip can act on it", () => {
    const body = toPipRequirements(
      lock({
        packages: [
          { name: "pywin32", version: "312", hashes: [`sha256:${"a".repeat(64)}`], marker: "sys_platform == 'win32'" },
        ],
      }),
    );
    expect(body).toContain("pywin32==312 ; sys_platform == 'win32'");
  });

  it("rejects an unsupported lockfileVersion rather than reading it optimistically", () => {
    expect(() => parseLockfile(JSON.stringify({ ...lock(), lockfileVersion: 99 }))).toThrow(/unsupported lockfileVersion/);
  });

  it("reports unparseable JSON as a lock error", () => {
    expect(() => parseLockfile("{not json")).toThrow(LockfileError);
  });

  it("digests the package set, not the skill that asked for it", () => {
    // Two skills with identical dependencies must share one environment.
    const a = lock({ skill: "design" });
    const b = lock({ skill: "cti-expert" });
    expect(lockDigest(a)).toBe(lockDigest(b));
    expect(lockDigest(a)).toMatch(/^[a-f0-9]{16}$/);
  });

  it("changes the digest when a version, a hash, or the interpreter changes", () => {
    const base = lockDigest(lock());
    expect(lockDigest(lock({ packages: [{ name: "numpy", version: "2.2.0", hashes: [`sha256:${"a".repeat(64)}`] }] }))).not.toBe(base);
    expect(lockDigest(lock({ packages: [{ name: "numpy", version: "2.1.0", hashes: [`sha256:${"d".repeat(64)}`] }] }))).not.toBe(base);
    expect(lockDigest(lock({ python: "3.12" }))).not.toBe(base);
  });

  it("emits pip requirements with every hash inline", () => {
    const body = toPipRequirements(lock({
      packages: [{ name: "numpy", version: "2.1.0", hashes: [`sha256:${"a".repeat(64)}`, `sha256:${"b".repeat(64)}`] }],
    }));
    expect(body).toContain("numpy==2.1.0 \\");
    expect(body.match(/--hash=sha256:/g)).toHaveLength(2);
  });
});

describe("env-root", () => {
  it("keeps environments out of the version-stamped cache", () => {
    // An environment under the kit cache would be orphaned by every update,
    // and rebuilding needs the network.
    const root = envsRoot({ XDG_DATA_HOME: "/data" } as NodeJS.ProcessEnv);
    expect(root).toBe("/data/ariadnev/envs");
    expect(root).not.toContain("cache");
  });

  it("honours an explicit override and falls back to XDG data, not cache", () => {
    expect(envsRoot(ENV)).toBe("/envs");
    expect(envsRoot({ HOME: "/home/u" } as NodeJS.ProcessEnv)).toContain(".local/share/ariadnev/envs");
  });

  it("locates the interpreter per platform", () => {
    expect(envPython("/envs/abc", "darwin")).toBe("/envs/abc/bin/python");
    expect(envPython("/envs/abc", "win32")).toBe("/envs/abc/Scripts/python.exe");
  });
});

/** A fake environment tree: set of paths, plus file contents. */
function fakeFs(files: Record<string, string>, dirs: string[]): VerifyDeps {
  const allDirs = new Set(dirs);
  return {
    fileExists: (p) => p in files,
    dirExists: (p) => allDirs.has(p),
    listDir: (p) => {
      const names = new Set<string>();
      for (const path of [...Object.keys(files), ...allDirs]) {
        if (!path.startsWith(`${p}/`)) continue;
        names.add(path.slice(p.length + 1).split("/")[0]);
      }
      return [...names];
    },
    readFile: (p) => files[p] ?? null,
  };
}

const DIGEST = lockDigest(lock());
const DIR = `/envs/${DIGEST}`;
const SITE = `${DIR}/lib/python3.11/site-packages`;

function healthyEnv(extra: Record<string, string> = {}): VerifyDeps {
  return fakeFs(
    {
      [envSentinel(DIR)]: "{}",
      [`${DIR}/bin/python`]: "",
      [`${SITE}/numpy-2.1.0.dist-info/RECORD`]: "numpy/__init__.py,sha256=x,10\n",
      [`${SITE}/numpy/__init__.py`]: "",
      ...extra,
    },
    [DIR, `${DIR}/lib`, `${DIR}/lib/python3.11`, SITE],
  );
}

describe("verifyEnv", () => {
  it("calls a skill with no runtime dependencies ok, with no environment at all", () => {
    // The common case: 17 of the 22 Python skills import nothing outside the
    // standard library.
    const verdict = verifyEnv("threejs", null, fakeFs({}, []), { env: ENV });
    expect(verdict.status).toBe("ok");
    expect(verdict.envDir).toBeUndefined();
  });

  it("reports missing when the environment was never built", () => {
    const verdict = verifyEnv("cti-expert", lock(), fakeFs({}, []), { env: ENV, platform: "darwin" });
    expect(verdict.status).toBe("missing");
    expect(verdict.detail).toContain("ariadnev skill install cti-expert");
  });

  it("reports ok for a complete environment", () => {
    expect(verifyEnv("cti-expert", lock(), healthyEnv(), { env: ENV, platform: "darwin" }).status).toBe("ok");
  });

  it("reports corrupt for an interrupted build (no sentinel)", () => {
    const deps = fakeFs({ [`${DIR}/bin/python`]: "" }, [DIR]);
    const verdict = verifyEnv("cti-expert", lock(), deps, { env: ENV, platform: "darwin" });
    expect(verdict.status).toBe("corrupt");
    expect(verdict.detail).toContain("never completed");
  });

  it("reports corrupt when the interpreter or site-packages is gone", () => {
    const noPython = fakeFs({ [envSentinel(DIR)]: "{}" }, [DIR]);
    expect(verifyEnv("cti-expert", lock(), noPython, { env: ENV, platform: "darwin" }).detail).toContain("no interpreter");
    const noSite = fakeFs({ [envSentinel(DIR)]: "{}", [`${DIR}/bin/python`]: "" }, [DIR]);
    expect(verifyEnv("cti-expert", lock(), noSite, { env: ENV, platform: "darwin" }).detail).toContain("no site-packages");
  });

  it("reports corrupt when a locked package is absent or the wrong version", () => {
    const empty = fakeFs(
      { [envSentinel(DIR)]: "{}", [`${DIR}/bin/python`]: "" },
      [DIR, `${DIR}/lib`, `${DIR}/lib/python3.11`, SITE],
    );
    expect(verifyEnv("cti-expert", lock(), empty, { env: ENV, platform: "darwin" }).detail).toContain("numpy is missing");

    const wrong = fakeFs(
      {
        [envSentinel(DIR)]: "{}",
        [`${DIR}/bin/python`]: "",
        [`${SITE}/numpy-1.0.0.dist-info/RECORD`]: "numpy/__init__.py,,\n",
      },
      [DIR, `${DIR}/lib`, `${DIR}/lib/python3.11`, SITE],
    );
    expect(verifyEnv("cti-expert", lock(), wrong, { env: ENV, platform: "darwin" }).detail).toContain("but the lock pins 2.1.0");
  });

  it("only checks RECORD's files when asked to be thorough", () => {
    const gutted = fakeFs(
      {
        [envSentinel(DIR)]: "{}",
        [`${DIR}/bin/python`]: "",
        [`${SITE}/numpy-2.1.0.dist-info/RECORD`]: "numpy/__init__.py,sha256=x,10\n",
      },
      [DIR, `${DIR}/lib`, `${DIR}/lib/python3.11`, SITE],
    );
    // The package's own files were deleted; the metadata still says it is there.
    expect(verifyEnv("cti-expert", lock(), gutted, { env: ENV, platform: "darwin" }).status).toBe("ok");
    const deep = verifyEnv("cti-expert", lock(), gutted, { env: ENV, platform: "darwin", thorough: true });
    expect(deep.status).toBe("corrupt");
    expect(deep.detail).toContain("missing an installed file");
  });

  it("does not call a healthy environment corrupt over discarded bytecode", () => {
    // RECORD names the `.pyc` pip compiled, down to the interpreter that
    // compiled it. Python regenerates it on demand and renames it after an
    // interpreter upgrade, so requiring it reports corruption on upgrade day.
    const noBytecode = fakeFs(
      {
        [envSentinel(DIR)]: "{}",
        [`${DIR}/bin/python`]: "",
        [`${SITE}/numpy-2.1.0.dist-info/RECORD`]:
          "numpy/__init__.py,sha256=x,10\nnumpy/__pycache__/__init__.cpython-314.pyc,,\n",
        [`${SITE}/numpy/__init__.py`]: "",
      },
      [DIR, `${DIR}/lib`, `${DIR}/lib/python3.11`, SITE],
    );
    expect(verifyEnv("cti-expert", lock(), noBytecode, { env: ENV, platform: "darwin", thorough: true }).status).toBe("ok");
  });

  it("executes nothing — the deps it is given cannot run anything", () => {
    // Guard on the shape of the contract: VerifyDeps exposes reads only.
    const deps = healthyEnv();
    expect(Object.keys(deps).sort()).toEqual(["dirExists", "fileExists", "listDir", "readFile"]);
  });

  it("does not require a package this platform's marker excludes", () => {
    // `mcp` locks `pywin32 ; sys_platform == "win32"`. On a Mac it is meant to
    // be absent, and calling that corrupt would fail every healthy environment
    // outside Windows.
    const windowsOnly: Lockfile = {
      ...lock(),
      packages: [
        ...lock().packages,
        { name: "pywin32", version: "312", hashes: [`sha256:${"d".repeat(64)}`], marker: "sys_platform == 'win32'" },
      ],
    };
    const dir = `/envs/${lockDigest(windowsOnly)}`;
    const site = `${dir}/lib/python3.11/site-packages`;
    const deps = fakeFs(
      {
        [envSentinel(dir)]: "{}",
        [`${dir}/pyvenv.cfg`]: "version = 3.11.9\n",
        [`${dir}/bin/python`]: "",
        [`${site}/numpy-2.1.0.dist-info/RECORD`]: "numpy/__init__.py,sha256=x,10\n",
      },
      [dir, `${dir}/lib`, `${dir}/lib/python3.11`, site],
    );
    expect(verifyEnv("mcp-builder", windowsOnly, deps, { env: ENV, platform: "darwin" }).status).toBe("ok");
    // The same environment on Windows is missing something it should have.
    const onWindows = verifyEnv("mcp-builder", windowsOnly, deps, { env: ENV, platform: "win32" });
    expect(onWindows.status).toBe("corrupt");
  });

  it("refuses to judge a marked lock when it cannot tell which interpreter built the environment", () => {
    const marked: Lockfile = {
      ...lock(),
      packages: [{ ...lock().packages[0], marker: "python_version >= '3.10'" }],
    };
    // No pyvenv.cfg and a Windows layout: nothing says what version this is.
    const dir = `/envs/${lockDigest(marked)}`;
    const deps = fakeFs(
      { [envSentinel(dir)]: "{}", [`${dir}/Scripts/python.exe`]: "" },
      [dir, `${dir}/Lib`, `${dir}/Lib/site-packages`],
    );
    const verdict = verifyEnv("cti-expert", marked, deps, { env: ENV, platform: "win32" });
    expect(verdict.status).toBe("corrupt");
    expect(verdict.detail).toContain("interpreter version");
  });

  it("reads import names from RECORD instead of guessing them from the package name", () => {
    // `python-docx` imports as `docx`, `pillow` as `PIL`. Replacing hyphens
    // with underscores — the obvious shortcut — gets both wrong and reports a
    // healthy environment as broken.
    expect(topLevelModules("docx/__init__.py,sha256=x,10\npython_docx-1.1.2.dist-info/RECORD,,\n")).toEqual(["docx"]);
    expect(topLevelModules("PIL/Image.py,,\nsix.py,,\n../../bin/f2py,,\npillow.libs/x.dylib,,\n__pycache__/six.pyc,,\n")).toEqual([
      "PIL",
      "six",
    ]);
    expect(importableModules(lock(), healthyEnv(), { env: ENV, platform: "darwin" })).toEqual(["numpy"]);
  });

  it("distinguishes unknown from ok", () => {
    const verdict = unknownEnv("design");
    expect(verdict.status).toBe("unknown");
    expect(verdict.detail).toContain("scan-python-imports");
  });
});

describe("venv-manager", () => {
  it("plans a hash-pinned, dependency-closed install", () => {
    const plan = planEnvBuild(lock(), "/usr/bin/python3", ENV);
    expect(plan.envDir).toBe(DIR);
    expect(plan.steps[0].argv).toEqual(["/usr/bin/python3", "-m", "venv", DIR]);
    const pip = plan.steps[1].argv;
    expect(pip[0]).toBe(`${DIR}/bin/python`);
    // Without --require-hashes the lock's hashes are decoration; without
    // --no-deps pip may install a transitive package the lock never vetted.
    expect(pip).toContain("--require-hashes");
    expect(pip).toContain("--no-deps");
    expect(plan.requirementsBody).toContain("numpy==2.1.0");
  });

  it("writes the sentinel only as a separate step from the install", () => {
    // The sentinel is what verify trusts, so it must not be part of creating
    // the directory — an interrupted build has to stay detectable.
    const plan = planEnvBuild(lock(), "python3", ENV);
    expect(plan.sentinelPath).toBe(envSentinel(DIR));
    expect(plan.steps.some((s) => s.argv.includes(plan.sentinelPath))).toBe(false);
  });

  it("collects only environments nothing refers to", () => {
    const keep = lockDigest(lock());
    const result = planEnvGc([lock()], { listEnvs: () => [keep, "deadbeefdeadbeef"] }, ENV);
    expect(result.kept).toEqual([`/envs/${keep}`]);
    expect(result.removable).toEqual(["/envs/deadbeefdeadbeef"]);
  });

  it("keeps a shared environment while any skill still refers to it", () => {
    const shared = [lock({ skill: "design" }), lock({ skill: "cti-expert" })];
    const result = planEnvGc(shared, { listEnvs: () => [DIGEST] }, ENV);
    expect(result.removable).toEqual([]);
  });

  it("runs stdlib-only skills on the system interpreter", () => {
    expect(interpreterFor(null, "/usr/bin/python3", ENV)).toBe("/usr/bin/python3");
    expect(interpreterFor(lock(), "/usr/bin/python3", ENV)).toBe(`${DIR}/bin/python`);
  });
});
