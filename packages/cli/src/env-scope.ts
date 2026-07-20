// A Bun compiled binary auto-loads a `.env` from its cwd into process.env
// (verified empirically). That lets a hostile target repo inject VCSKILL_* vars
// — e.g. redirect VCSKILL_CACHE_DIR — just by shipping a `.env`. vcskill's own
// config is owned by the user's shell, never by a project file: strip any
// VCSKILL_* key that appears in the cwd `.env`. Shell-provided values that are
// NOT in that file are left untouched.

import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface EnvScopeDeps {
  cwd: string;
  env: Record<string, string | undefined>;
  /** Read the cwd `.env`; return null if absent/unreadable. */
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

/** Delete VCSKILL_* keys that the cwd `.env` defines. Returns the stripped keys. */
export function stripCwdEnvVcskillVars(deps: EnvScopeDeps): string[] {
  const content = deps.readEnvFile(join(deps.cwd, ".env"));
  if (content === null) return [];
  const stripped: string[] = [];
  for (const key of dotenvKeys(content)) {
    if (key.startsWith("VCSKILL_") && key in deps.env) {
      delete deps.env[key];
      stripped.push(key);
    }
  }
  return stripped;
}

/** Real invocation: strip against process.cwd()/.env and process.env. */
export function scopeProcessEnv(): string[] {
  return stripCwdEnvVcskillVars({
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
