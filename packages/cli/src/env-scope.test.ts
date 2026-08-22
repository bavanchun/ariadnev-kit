import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join, relative, dirname } from "node:path";
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

  /**
   * Files whose top level runs before `scopeProcessEnv()`: the entry module, and
   * everything it pulls in transitively, since an import's module scope executes
   * during the import itself.
   *
   * An earlier version of this walked all 191 source files and then discarded
   * every one that was not `index.ts` — so it asserted a property about the
   * import graph while only ever looking at one file. Following the imports is
   * the difference between the check and the appearance of one.
   */
  function importGraph(entry: string, seen = new Set<string>()): string[] {
    if (seen.has(entry) || !existsSync(entry)) return [];
    seen.add(entry);
    const text = readFileSync(entry, "utf8");
    for (const match of text.matchAll(/^\s*import\s[^"']*["'](\.[^"']+)["']/gm)) {
      const target = join(dirname(entry), match[1].replace(/\.js$/, ".ts"));
      importGraph(target, seen);
    }
    return [...seen];
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

  /** A read at module scope — not nested inside any function body. */
  function moduleScopeReads(text: string): string[] {
    const found: string[] = [];
    let depth = 0;
    for (const line of text.split("\n")) {
      const match = /process\.env\.(ARIADNEV_[A-Z0-9_]+)/.exec(line);
      if (match && depth === 0) found.push(match[1]);
      depth += (line.match(/\{/g)?.length ?? 0) - (line.match(/\}/g)?.length ?? 0);
    }
    return found;
  }

  it("reads ARIADNEV_* only from inside a function, or from the allowlist", () => {
    const graph = importGraph(join(srcDir, "index.ts"));
    // The walk has to actually reach the tree, or this passes by finding nothing.
    expect(graph.length).toBeGreaterThan(20);

    const offenders: string[] = [];
    for (const file of graph) {
      const text = readFileSync(file, "utf8");
      for (const key of moduleScopeReads(text)) {
        const id = `${relative(srcDir, file)}:${key}`;
        if (!ALLOWED_PRE_SCOPE.has(id)) offenders.push(id);
      }
    }
    expect(
      offenders,
      "an ARIADNEV_* read at module scope runs before scopeProcessEnv() — move it inside a function the CLI calls during parseAsync, or add it to ALLOWED_PRE_SCOPE with a reason",
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
