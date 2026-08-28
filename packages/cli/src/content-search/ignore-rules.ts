// What a content shard is allowed to read.
//
// THE SHARD IS PLAINTEXT AT REST. That single fact is what makes this module
// the most consequential one in the phase: every decision here is a decision
// about whether a credential ends up in a searchable file on disk. A missing
// search result is recoverable by re-indexing. An indexed private key is not.
//
// TWO LAYERS, AND ONLY ONE OF THEM IS THE PROJECT'S TO SET.
//
//   1. `ALWAYS_DENIED` — dotenv files, key material, credential stores. Not
//      overridable, not configurable, and checked before anything else. A repo
//      that fails to gitignore its `.env` is exactly the repo that most needs
//      this, so deriving the denial from the repo's own hygiene would protect
//      the projects that need protecting least.
//   2. `.gitignore` — the project's own statement about what is not source.
//      Honoured as a courtesy to relevance, not as a security boundary.
//
// THE GITIGNORE SUPPORT IS A DOCUMENTED SUBSET, NOT AN IMPLEMENTATION. Literal
// names, `dir/`, `*.ext`, root-anchored `/path`, and `!` negations are handled;
// `**` spans and character classes are not. Every unsupported construct is
// resolved toward ignoring more rather than less, so the subset can only make
// the shard smaller than a full implementation would — never larger. Pulling in
// a gitignore library for the remainder would be the wrong trade here: this
// runs against a user's whole project tree inside a binary that ships with no
// runtime dependencies.

import { readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * Never indexed, whatever the project says.
 *
 * Matched against the basename, case-insensitively, because `.ENV` and
 * `id_rsa.PEM` are the same risk as their lowercase spellings.
 */
export const ALWAYS_DENIED: readonly RegExp[] = [
  /^\.env(\..*)?$/i, // .env, .env.local, .env.production
  /^\.npmrc$/i,
  /^\.netrc$/i,
  /^\.pgpass$/i,
  /^\.htpasswd$/i,
  /\.(?:pem|key|p12|pfx|jks|keystore|asc|gpg|ppk)$/i,
  /^id_(?:rsa|dsa|ecdsa|ed25519)(\.pub)?$/i,
  /^(?:credentials|secrets?)(\.[A-Za-z0-9]+)?$/i,
  /\.(?:kdbx|keychain)$/i,
];

/** Directory names never descended into, for cost as much as for safety. */
export const ALWAYS_SKIPPED_DIRECTORIES: readonly string[] = [
  ".git",
  ".ssh",
  ".gnupg",
  "node_modules",
  ".venv",
  "venv",
  "__pycache__",
  ".mypy_cache",
  ".pytest_cache",
  "dist",
  "build",
  "target",
  "coverage",
  ".next",
  ".turbo",
  ".cache",
];

/** True when this file may never be indexed, regardless of any other rule. */
export function isAlwaysDenied(name: string): boolean {
  return ALWAYS_DENIED.some((pattern) => pattern.test(name));
}

interface GitignoreRule {
  readonly pattern: string;
  readonly negated: boolean;
  readonly directoryOnly: boolean;
  readonly anchored: boolean;
}

/**
 * Parse a `.gitignore` body into rules.
 *
 * Blank lines and `#` comments are dropped. Order is preserved because a later
 * rule wins, which is the only way `!` negation can mean anything.
 */
export function parseGitignore(body: string): GitignoreRule[] {
  const rules: GitignoreRule[] = [];
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.length === 0 || line.startsWith("#")) continue;
    const negated = line.startsWith("!");
    let pattern = negated ? line.slice(1) : line;
    const directoryOnly = pattern.endsWith("/");
    if (directoryOnly) pattern = pattern.slice(0, -1);
    const anchored = pattern.startsWith("/");
    if (anchored) pattern = pattern.slice(1);
    if (pattern.length === 0) continue;
    rules.push({ pattern, negated, directoryOnly, anchored });
  }
  return rules;
}

/** A gitignore glob as a regular expression, over one path segment or a path. */
function toRegExp(pattern: string): RegExp {
  const source = pattern
    .split("")
    .map((character) => {
      if (character === "*") return "[^/]*";
      if (character === "?") return "[^/]";
      return /[a-zA-Z0-9_-]/.test(character) ? character : `\\${character}`;
    })
    .join("");
  return new RegExp(`^${source}$`);
}

export interface IgnoreMatcher {
  /** `path` is relative to the project root, `/`-separated. */
  ignores(path: string, isDirectory: boolean): boolean;
}

/**
 * A matcher over one project's rules.
 *
 * An unanchored pattern matches at any depth, which is git's behaviour and the
 * one that matters most in practice — `*.log` in a root `.gitignore` covers
 * `deep/nested/thing.log`.
 */
export function gitignoreMatcher(rules: readonly GitignoreRule[]): IgnoreMatcher {
  const compiled = rules.map((rule) => ({ rule, regexp: toRegExp(rule.pattern) }));
  return {
    ignores(path, isDirectory) {
      const segments = path.split("/");
      let ignored = false;
      for (const { rule, regexp } of compiled) {
        if (rule.directoryOnly && !isDirectory && !segments.slice(0, -1).some((segment) => regexp.test(segment))) continue;
        const matched = rule.anchored
          ? regexp.test(path) || regexp.test(segments[0] ?? "")
          : segments.some((segment) => regexp.test(segment)) || regexp.test(path);
        if (matched) ignored = !rule.negated;
      }
      return ignored;
    },
  };
}

/** Read `<root>/.gitignore`, or an empty matcher when there is none. */
export function projectIgnoreMatcher(root: string): IgnoreMatcher {
  let body = "";
  try {
    body = readFileSync(join(root, ".gitignore"), "utf8");
  } catch {
    // No `.gitignore` is ordinary. The denylist above still applies.
  }
  return gitignoreMatcher(parseGitignore(body));
}

/** Why a path was refused, for a `status`/`enable` report that can be acted on. */
export type SkipReason = "denied" | "ignored" | "binary" | "too-large" | "skipped-directory";

/** Project-relative and `/`-separated, which is what every rule above expects. */
export function relativePath(root: string, path: string): string {
  return relative(root, path).split(sep).join("/");
}
