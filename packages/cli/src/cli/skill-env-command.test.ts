import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSkillEnv, readSkillEnvSource } from "./skill-env-command.js";
import { envsRoot } from "../skill-env/env-root.js";
import { lockDigest, serializeLockfile, LOCKFILE_VERSION, type Lockfile } from "../skill-env/lockfile.js";

// A real interpreter is needed to build an environment. Where there is none,
// the environment-building tests report the skip instead of pretending.
function systemPython(): string | null {
  for (const candidate of ["python3", "python"]) {
    try {
      execFileSync(candidate, ["--version"], { stdio: "pipe" });
      return candidate;
    } catch {
      /* try the next one */
    }
  }
  return null;
}
const PYTHON = systemPython();

let sandbox: string;
let kitRoot: string;
let skillsRoot: string;
let prevEnvsDir: string | undefined;

function addSkill(name: string, files: Record<string, string>): void {
  const dir = join(skillsRoot, name);
  mkdirSync(join(dir, "scripts"), { recursive: true });
  writeFileSync(
    join(dir, "SKILL.md"),
    `---\nname: av:${name}\ndescription: Use this fixture skill named ${name} for skill-env tests.\n---\n\n# ${name}\n`,
  );
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(join(dir, rel, ".."), { recursive: true });
    writeFileSync(join(dir, rel), body);
  }
}

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), "ariadnev-skillenv-"));
  kitRoot = join(sandbox, "kit");
  skillsRoot = join(kitRoot, "skills");
  mkdirSync(skillsRoot, { recursive: true });
  prevEnvsDir = process.env.ARIADNEV_ENVS_DIR;
  process.env.ARIADNEV_ENVS_DIR = join(sandbox, "envs");
});
afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
  if (prevEnvsDir === undefined) delete process.env.ARIADNEV_ENVS_DIR;
  else process.env.ARIADNEV_ENVS_DIR = prevEnvsDir;
});

function opts(extra: Record<string, unknown> = {}) {
  return { kitRoot, systemPython: PYTHON ?? "python3", ...extra };
}

describe("readSkillEnvSource", () => {
  it("treats a skill with no Python at all as needing nothing", () => {
    addSkill("prose-only", {});
    expect(readSkillEnvSource(skillsRoot, "prose-only")).toMatchObject({ lock: null, undeclared: false });
  });

  it("treats a pytest-only declaration as needing no environment", () => {
    // The shape eight of the ten source requirements files have.
    addSkill("tested", {
      "scripts/tool.py": "import json\n",
      "scripts/requirements.txt": "# Testing dependencies (dev)\npytest>=8.0.0\npytest-cov>=4.1.0\n",
    });
    expect(readSkillEnvSource(skillsRoot, "tested")).toMatchObject({ lock: null, undeclared: false });
  });

  it("flags a skill that ships Python and declares nothing", () => {
    addSkill("silent", { "scripts/tool.py": "import requests\n" });
    expect(readSkillEnvSource(skillsRoot, "silent").undeclared).toBe(true);
  });

  it("flags a skill that declares runtime deps but has no reviewed lock", () => {
    // A declaration is not a lock: the range it names cannot be installed
    // reproducibly, so this is not something to build from.
    addSkill("unlocked", { "scripts/t.py": "import numpy\n", "scripts/requirements.txt": "numpy>=1.24.0\n" });
    expect(readSkillEnvSource(skillsRoot, "unlocked")).toMatchObject({ lock: null, undeclared: true });
  });

  it("reads a reviewed lock when one is present", () => {
    addSkill("locked", { "scripts/t.py": "import x\n", "scripts/ariadnev-lock.json": serializeLockfile(fixtureLock()) });
    expect(readSkillEnvSource(skillsRoot, "locked").lock?.packages[0].name).toBe("six");
  });
});

/** Locks `six` — pure Python, tiny, no build step. Hashes are the real ones. */
function fixtureLock(): Lockfile {
  return {
    lockfileVersion: LOCKFILE_VERSION,
    skill: "locked",
    python: "3",
    packages: [
      {
        name: "six",
        version: "1.17.0",
        hashes: [
          "sha256:4721f391ed90541fddacab5acf947aa0d3dc7d27b2e1e8eda2be8970586c3274",
          "sha256:ff70335d468e7eb6ec65b95b99d3a2836546063f63acc5171de367e834932a81",
        ],
      },
    ],
  };
}

describe("verify", () => {
  it("says nothing needs an environment when nothing does", () => {
    addSkill("a", { "scripts/t.py": "import json\n", "scripts/requirements.txt": "pytest>=8.0.0\n" });
    const { output, exitCode } = runSkillEnv({ action: "verify", ...opts() });
    expect(output).toContain("no skill needs a Python environment");
    expect(exitCode).toBe(0);
  });

  it("reports unknown — not ok — for a skill that declares nothing", () => {
    // Silence is not evidence of health.
    addSkill("silent", { "scripts/t.py": "import requests\n" });
    const { output, exitCode } = runSkillEnv({ action: "verify", ...opts() });
    expect(output).toContain("unknown");
    expect(output).toContain("scan-python-imports");
    // Unknown is a reason to look, not a failed exit.
    expect(exitCode).toBe(0);
  });

  it("reports missing for a locked skill with no environment built", () => {
    addSkill("locked", { "scripts/t.py": "import six\n", "scripts/ariadnev-lock.json": serializeLockfile(fixtureLock()) });
    const { output, exitCode } = runSkillEnv({ action: "verify", ...opts() });
    expect(output).toContain("missing");
    expect(exitCode).toBe(1);
  });

  it("emits JSON with the same verdicts", () => {
    addSkill("locked", { "scripts/t.py": "import six\n", "scripts/ariadnev-lock.json": serializeLockfile(fixtureLock()) });
    const parsed = JSON.parse(runSkillEnv({ action: "verify", ...opts({ json: true }) }).output) as {
      verdicts: { skill: string; status: string }[];
    };
    expect(parsed.verdicts).toEqual([expect.objectContaining({ skill: "locked", status: "missing" })]);
  });

  it("rejects an unknown skill name rather than reporting it clean", () => {
    expect(() => runSkillEnv({ action: "verify", skill: "nope", ...opts() })).toThrow(/unknown skill/);
  });
});

describe("install", () => {
  it("does nothing for a skill that needs nothing", () => {
    addSkill("a", { "scripts/t.py": "import json\n" , "scripts/requirements.txt": "pytest>=8.0.0\n" });
    const { output } = runSkillEnv({ action: "install", skill: "a", ...opts() });
    expect(output).toContain("no runtime dependencies");
    expect(existsSync(envsRoot())).toBe(false);
  });

  it("shows the exact commands under --dry-run without running them", () => {
    addSkill("locked", { "scripts/ariadnev-lock.json": serializeLockfile(fixtureLock()) });
    const { output } = runSkillEnv({ action: "install", skill: "locked", ...opts({ dryRun: true }) });
    expect(output).toContain("-m venv");
    expect(output).toContain("--require-hashes");
    expect(existsSync(envsRoot())).toBe(false);
  });

  it(
    "builds a hash-verified environment and runs a script inside it (needs python3)",
    { skip: PYTHON === null, timeout: 120_000 },
    () => {
      addSkill("locked", {
        "scripts/ariadnev-lock.json": serializeLockfile(fixtureLock()),
        "scripts/use.py": "import six\nprint('six', six.__version__)\n",
      });

      let installed;
      try {
        installed = runSkillEnv({ action: "install", skill: "locked", ...opts() });
      } catch (err) {
        // No network in this environment: the install cannot be exercised, but
        // that must be reported as a skip, not swallowed into a green test.
        expect(String(err)).toMatch(/could not install the locked packages/);
        return;
      }
      expect(installed.output).toContain("environment ready");

      const verified = runSkillEnv({ action: "verify", skill: "locked", ...opts() });
      expect(verified.exitCode).toBe(0);
      expect(verified.output).toContain("ok");

      // --deep imports the package in a child process; ok here means the
      // script can genuinely run, not just that metadata lines up.
      expect(runSkillEnv({ action: "verify", skill: "locked", ...opts({ deep: true }) }).exitCode).toBe(0);
      expect(runSkillEnv({ action: "run", skill: "locked", args: ["scripts/use.py"], ...opts() }).exitCode).toBe(0);
    },
  );
});

describe("run", () => {
  it(
    "runs a stdlib-only script on the system interpreter, with no environment (needs python3)",
    { skip: PYTHON === null },
    () => {
      addSkill("plain", { "scripts/hello.py": "import json, sys\nsys.exit(0)\n" });
      expect(runSkillEnv({ action: "run", skill: "plain", args: ["scripts/hello.py"], ...opts() }).exitCode).toBe(0);
      expect(existsSync(envsRoot())).toBe(false);
    },
  );

  it("refuses to run when the environment is not ready", () => {
    addSkill("locked", {
      "scripts/ariadnev-lock.json": serializeLockfile(fixtureLock()),
      "scripts/use.py": "import six\n",
    });
    const { output, exitCode } = runSkillEnv({ action: "run", skill: "locked", args: ["scripts/use.py"], ...opts() });
    expect(exitCode).toBe(1);
    expect(output).toContain("no environment");
  });

  it("reports a missing script instead of handing it to the interpreter", () => {
    addSkill("plain", { "scripts/hello.py": "import json\n" });
    const { output, exitCode } = runSkillEnv({ action: "run", skill: "plain", args: ["scripts/nope.py"], ...opts() });
    expect(exitCode).toBe(1);
    expect(output).toContain("no such script");
  });

  it("requires both a skill and a script", () => {
    expect(() => runSkillEnv({ action: "run", ...opts() })).toThrow(/requires a skill/);
    addSkill("plain", {});
    expect(() => runSkillEnv({ action: "run", skill: "plain", ...opts() })).toThrow(/requires a script/);
  });

  it("obeys a user who set the script execution policy to never", () => {
    // The refusal has to come before anything is spawned, and it has to name
    // the setting — a policy the user cannot find again is a trap.
    addSkill("plain", { "scripts/hello.py": "import sys\nsys.exit(0)\n" });
    const { output, exitCode } = runSkillEnv({
      action: "run",
      skill: "plain",
      args: ["scripts/hello.py"],
      executionPolicy: "never",
      ...opts(),
    });
    expect(exitCode).toBe(1);
    expect(output).toContain("scripts.executionPolicy");
  });
});

describe("remove and garbage collection", () => {
  it("collects an environment once nothing refers to it", () => {
    addSkill("locked", { "scripts/ariadnev-lock.json": serializeLockfile(fixtureLock()) });
    // Stand in for a built environment; GC decides by reference, not contents.
    const stale = join(envsRoot(), "0123456789abcdef");
    const live = join(envsRoot(), lockDigest(fixtureLock()));
    mkdirSync(stale, { recursive: true });
    mkdirSync(live, { recursive: true });

    const { output } = runSkillEnv({ action: "upgrade", ...opts() });
    expect(output).toContain(`removed unreferenced environment ${stale}`);
    expect(existsSync(stale)).toBe(false);
    // Still referenced by the installed lock.
    expect(existsSync(live)).toBe(true);
  });

  it("frees the environment of the skill being removed", () => {
    addSkill("locked", { "scripts/ariadnev-lock.json": serializeLockfile(fixtureLock()) });
    const live = join(envsRoot(), lockDigest(fixtureLock()));
    mkdirSync(live, { recursive: true });

    runSkillEnv({ action: "remove", skill: "locked", ...opts() });
    expect(existsSync(live)).toBe(false);
  });

  it("keeps a shared environment while another skill still refers to it", () => {
    const lock = fixtureLock();
    addSkill("one", { "scripts/ariadnev-lock.json": serializeLockfile({ ...lock, skill: "one" }) });
    addSkill("two", { "scripts/ariadnev-lock.json": serializeLockfile({ ...lock, skill: "two" }) });
    const shared = join(envsRoot(), lockDigest(lock));
    mkdirSync(shared, { recursive: true });

    runSkillEnv({ action: "remove", skill: "one", ...opts() });
    expect(existsSync(shared)).toBe(true);
    expect(readdirSync(envsRoot())).toEqual([lockDigest(lock)]);
  });
});
