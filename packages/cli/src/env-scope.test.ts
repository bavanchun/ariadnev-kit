import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { stripCwdEnvAriadnevVars, dotenvKeys, DOTENV_FILES, cwdDotenvDeclares } from "./env-scope.js";

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

describe("stripCwdEnvAriadnevVars", () => {
  it("removes ARIADNEV_* vars named in .env", () => {
    const env: Record<string, string | undefined> = { ARIADNEV_CACHE_DIR: "/tmp/hijack", PATH: "/bin" };
    const stripped = stripCwdEnvAriadnevVars({
      cwd: "/proj",
      env,
      readEnvFile: filesystem({ ".env": "ARIADNEV_CACHE_DIR=/tmp/hijack\nOTHER=1\n" }),
    });
    expect(stripped).toEqual(["ARIADNEV_CACHE_DIR"]);
    expect("ARIADNEV_CACHE_DIR" in env).toBe(false);
    expect(env.PATH).toBe("/bin");
  });

  it("also closes the .env.local vector (higher precedence, was the bypass)", () => {
    const env: Record<string, string | undefined> = { ARIADNEV_CACHE_DIR: "/tmp/evil" };
    const stripped = stripCwdEnvAriadnevVars({
      cwd: "/proj",
      env,
      readEnvFile: filesystem({ ".env.local": "ARIADNEV_CACHE_DIR=/tmp/evil\n" }),
    });
    expect(stripped).toEqual(["ARIADNEV_CACHE_DIR"]);
    expect("ARIADNEV_CACHE_DIR" in env).toBe(false);
  });

  it("closes the .env.production vector", () => {
    const env: Record<string, string | undefined> = { ARIADNEV_INSTALL_DIR: "/tmp/x" };
    stripCwdEnvAriadnevVars({
      cwd: "/proj",
      env,
      readEnvFile: filesystem({ ".env.production": "ARIADNEV_INSTALL_DIR=/tmp/x\n" }),
    });
    expect("ARIADNEV_INSTALL_DIR" in env).toBe(false);
  });

  it("leaves a ARIADNEV_* var no dotenv file names untouched", () => {
    const env: Record<string, string | undefined> = { ARIADNEV_INSTALL_DIR: "/opt/bin" };
    const stripped = stripCwdEnvAriadnevVars({
      cwd: "/proj",
      env,
      readEnvFile: filesystem({ ".env": "ARIADNEV_CACHE_DIR=/tmp/x\n" }), // different key
    });
    expect(stripped).toEqual([]);
    expect(env.ARIADNEV_INSTALL_DIR).toBe("/opt/bin");
  });

  it("no-ops when no dotenv files exist", () => {
    const env = { ARIADNEV_CACHE_DIR: "/keep" };
    expect(stripCwdEnvAriadnevVars({ cwd: "/proj", env, readEnvFile: () => null })).toEqual([]);
    expect(env.ARIADNEV_CACHE_DIR).toBe("/keep");
  });

  it("covers the full Bun-loaded dotenv set", () => {
    expect(DOTENV_FILES).toContain(".env");
    expect(DOTENV_FILES).toContain(".env.local");
    expect(DOTENV_FILES).toContain(".env.production");
    expect(DOTENV_FILES).toContain(".env.test.local");
  });
});

/**
 * `scopeProcessEnv()` is a security control: a repository's own dotenv must not
 * be able to set ariadnev's configuration for a run inside that repository. It
 * only protects reads that happen after it, and nothing structural puts them
 * there — a new `process.env.ARIADNEV_*` read in a module that loads at import
 * time would silently sit on the wrong side of it.
 */
describe("no ARIADNEV_* value is trusted before scoping", () => {
  const srcDir = join(fileURLToPath(new URL(".", import.meta.url)));

  function sourceFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) out.push(...sourceFiles(full));
      else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") && !entry.name.endsWith(".generated.ts")) {
        out.push(full);
      }
    }
    return out;
  }

  /**
   * Reads reachable before scoping. Every entry needs a reason, and the reason
   * has to be why scoping *cannot* run first — not why the read is convenient.
   */
  const ALLOWED_PRE_SCOPE = new Map([
    [
      "index.ts:ARIADNEV_RUN",
      "decides whether scoping runs at all; guarded by cwdDotenvDeclares instead, " +
        "which answers the same question without mutating a library importer's env",
    ],
  ]);

  it("reads ARIADNEV_* only from inside a command action, or from the allowlist", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(srcDir)) {
      const text = readFileSync(file, "utf8");
      for (const match of text.matchAll(/process\.env\.(ARIADNEV_[A-Z0-9_]+)/g)) {
        const key = `${relative(srcDir, file)}:${match[1]}`;
        // A read inside a `.action(...)` callback or a function the CLI calls
        // during `parseAsync` is after scoping by construction. The only module
        // that runs before it is the entry file's own top level.
        const isEntryModule = relative(srcDir, file) === "index.ts";
        if (isEntryModule && !ALLOWED_PRE_SCOPE.has(key)) offenders.push(key);
      }
    }
    expect(
      offenders,
      "a new ARIADNEV_* read in index.ts runs before scopeProcessEnv() — move it into a command action, or add it to ALLOWED_PRE_SCOPE with a reason",
    ).toEqual([]);
  });

  it("does not trust ARIADNEV_RUN when the cwd dotenv names it", () => {
    const declares = (content: string | null) =>
      cwdDotenvDeclares("ARIADNEV_RUN", { cwd: "/proj", readEnvFile: (p) => (p === "/proj/.env" ? content : null) });
    expect(declares("ARIADNEV_RUN=1\n")).toBe(true);
    expect(declares("export ARIADNEV_RUN=1\n")).toBe(true);
    expect(declares("# ARIADNEV_RUN=1\n")).toBe(false);
    expect(declares("OTHER=1\n")).toBe(false);
    expect(declares(null)).toBe(false);
  });
});
