import { describe, it, expect } from "vitest";
import { stripCwdEnvVcskillVars, dotenvKeys, DOTENV_FILES } from "./env-scope.js";

describe("dotenvKeys", () => {
  it("extracts assigned keys, ignoring comments and blanks", () => {
    expect(dotenvKeys("# c\nFOO=1\n\nexport BAR=2\n  BAZ = 3\nnot a line")).toEqual(["FOO", "BAR", "BAZ"]);
  });
});

// readEnvFile keyed by basename → simulate which dotenv file exists.
function filesystem(files: Record<string, string>) {
  return (path: string): string | null => {
    const name = path.split("/").pop() ?? path;
    return files[name] ?? null;
  };
}

describe("stripCwdEnvVcskillVars", () => {
  it("removes VCSKILL_* vars named in .env", () => {
    const env: Record<string, string | undefined> = { VCSKILL_CACHE_DIR: "/tmp/hijack", PATH: "/bin" };
    const stripped = stripCwdEnvVcskillVars({
      cwd: "/proj",
      env,
      readEnvFile: filesystem({ ".env": "VCSKILL_CACHE_DIR=/tmp/hijack\nOTHER=1\n" }),
    });
    expect(stripped).toEqual(["VCSKILL_CACHE_DIR"]);
    expect("VCSKILL_CACHE_DIR" in env).toBe(false);
    expect(env.PATH).toBe("/bin");
  });

  it("also closes the .env.local vector (higher precedence, was the bypass)", () => {
    const env: Record<string, string | undefined> = { VCSKILL_CACHE_DIR: "/tmp/evil" };
    const stripped = stripCwdEnvVcskillVars({
      cwd: "/proj",
      env,
      readEnvFile: filesystem({ ".env.local": "VCSKILL_CACHE_DIR=/tmp/evil\n" }),
    });
    expect(stripped).toEqual(["VCSKILL_CACHE_DIR"]);
    expect("VCSKILL_CACHE_DIR" in env).toBe(false);
  });

  it("closes the .env.production vector", () => {
    const env: Record<string, string | undefined> = { VCSKILL_INSTALL_DIR: "/tmp/x" };
    stripCwdEnvVcskillVars({
      cwd: "/proj",
      env,
      readEnvFile: filesystem({ ".env.production": "VCSKILL_INSTALL_DIR=/tmp/x\n" }),
    });
    expect("VCSKILL_INSTALL_DIR" in env).toBe(false);
  });

  it("leaves a VCSKILL_* var no dotenv file names untouched", () => {
    const env: Record<string, string | undefined> = { VCSKILL_INSTALL_DIR: "/opt/bin" };
    const stripped = stripCwdEnvVcskillVars({
      cwd: "/proj",
      env,
      readEnvFile: filesystem({ ".env": "VCSKILL_CACHE_DIR=/tmp/x\n" }), // different key
    });
    expect(stripped).toEqual([]);
    expect(env.VCSKILL_INSTALL_DIR).toBe("/opt/bin");
  });

  it("no-ops when no dotenv files exist", () => {
    const env = { VCSKILL_CACHE_DIR: "/keep" };
    expect(stripCwdEnvVcskillVars({ cwd: "/proj", env, readEnvFile: () => null })).toEqual([]);
    expect(env.VCSKILL_CACHE_DIR).toBe("/keep");
  });

  it("covers the full Bun-loaded dotenv set", () => {
    expect(DOTENV_FILES).toContain(".env");
    expect(DOTENV_FILES).toContain(".env.local");
    expect(DOTENV_FILES).toContain(".env.production");
    expect(DOTENV_FILES).toContain(".env.test.local");
  });
});
