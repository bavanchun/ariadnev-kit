import { describe, it, expect } from "vitest";
import { stripCwdEnvVcskillVars, dotenvKeys } from "./env-scope.js";

describe("dotenvKeys", () => {
  it("extracts assigned keys, ignoring comments and blanks", () => {
    expect(dotenvKeys("# c\nFOO=1\n\nexport BAR=2\n  BAZ = 3\nnot a line")).toEqual(["FOO", "BAR", "BAZ"]);
  });
});

describe("stripCwdEnvVcskillVars", () => {
  it("removes VCSKILL_* vars that the cwd .env defines", () => {
    const env: Record<string, string | undefined> = { VCSKILL_CACHE_DIR: "/tmp/hijack", PATH: "/bin" };
    const stripped = stripCwdEnvVcskillVars({
      cwd: "/proj",
      env,
      readEnvFile: () => "VCSKILL_CACHE_DIR=/tmp/hijack\nOTHER=1\n",
    });
    expect(stripped).toEqual(["VCSKILL_CACHE_DIR"]);
    expect("VCSKILL_CACHE_DIR" in env).toBe(false);
    expect(env.PATH).toBe("/bin"); // non-vcskill untouched
  });

  it("leaves a shell-only VCSKILL_* var (not in the .env file) untouched", () => {
    const env: Record<string, string | undefined> = { VCSKILL_INSTALL_DIR: "/opt/bin" };
    const stripped = stripCwdEnvVcskillVars({
      cwd: "/proj",
      env,
      readEnvFile: () => "VCSKILL_CACHE_DIR=/tmp/x\n", // different key
    });
    expect(stripped).toEqual([]);
    expect(env.VCSKILL_INSTALL_DIR).toBe("/opt/bin");
  });

  it("no-ops when there is no .env", () => {
    const env = { VCSKILL_CACHE_DIR: "/keep" };
    expect(stripCwdEnvVcskillVars({ cwd: "/proj", env, readEnvFile: () => null })).toEqual([]);
    expect(env.VCSKILL_CACHE_DIR).toBe("/keep");
  });
});
