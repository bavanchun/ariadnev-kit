// A Bun compiled binary auto-loads project dotenv files from its cwd into
// process.env (verified empirically: `.env`, `.env.local`, and
// `.env.{NODE_ENV}` all load). That lets a hostile target repo inject ARIADNEV_*
// vars — e.g. redirect ARIADNEV_CACHE_DIR — just by shipping one of those files.
//
// ariadnev's own config is owned by the user's shell, never by a project file:
// any ARIADNEV_* key NAMED in any of those cwd dotenv files is dropped from
// process.env. This is a security control, so it fails toward stripping — if a
// user also exports the same key in their shell AND a project dotenv names it,
// the shell value is dropped too (ariadnev falls back to its default). Set
// ariadnev config via your shell in a directory without such a project file.

import { readFileSync } from "node:fs";
import { join } from "node:path";

// The dotenv files Bun may auto-load, across every NODE_ENV. Scanning a file
// that doesn't exist is a harmless no-op, so this over-covers on purpose.
const NODE_ENVS = ["development", "production", "test"];
export const DOTENV_FILES = [
  ".env",
  ".env.local",
  ...NODE_ENVS.flatMap((e) => [`.env.${e}`, `.env.${e}.local`]),
];

export interface EnvScopeDeps {
  cwd: string;
  env: Record<string, string | undefined>;
  /** Read a dotenv file; return null if absent/unreadable. */
  readEnvFile(path: string): string | null;
}

/** Keys assigned in a dotenv file (LHS of `KEY=…`, ignoring comments). */
export function dotenvKeys(content: string): string[] {
  const keys: string[] = [];
  for (const line of content.split("\n")) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (m) keys.push(m[1]);
  }
  return keys;
}

/**
 * Delete every ARIADNEV_* key named in any of the cwd's auto-loaded dotenv files.
 * Returns the stripped keys (deduped).
 */
export function stripCwdEnvAriadnevVars(deps: EnvScopeDeps): string[] {
  const stripped = new Set<string>();
  for (const file of DOTENV_FILES) {
    const content = deps.readEnvFile(join(deps.cwd, file));
    if (content === null) continue;
    for (const key of dotenvKeys(content)) {
      if (key.startsWith("ARIADNEV_") && key in deps.env) {
        delete deps.env[key];
        stripped.add(key);
      }
    }
  }
  return [...stripped];
}

/** Real invocation: strip against process.cwd()'s dotenv files and process.env. */
export function scopeProcessEnv(): string[] {
  return stripCwdEnvAriadnevVars({
    cwd: process.cwd(),
    env: process.env,
    readEnvFile: (p) => {
      try {
        return readFileSync(p, "utf8");
      } catch {
        return null;
      }
    },
  });
}
