// Bounded search over one project's shard.
//
// THE QUERY IS PARSED, NOT PASSED THROUGH. FTS5's MATCH syntax has operators —
// `NEAR`, prefix `*`, column filters, boolean nesting — and a user string handed
// to it directly is both an injection surface and a way to write a query whose
// cost is nothing like its length. Reducing the input to plain tokens removes
// that entire class: what reaches SQLite is a quoted token list, and there is no
// spelling of `--query` that produces anything else.
//
// TWO BOUNDS, BOTH DEFAULTS. `--limit` and `--timeout` move them; nothing
// removes them. That asymmetry is the point — an agent invoking this
// non-interactively cannot Ctrl-C, so a query with no ceiling is a hung agent
// rather than a slow one. Neither bound is sufficient alone: the parser stops a
// pathological expression, the limit stops an enormous match, and the deadline
// stops a large corpus of large documents.
//
// THE TWO ENGINES SHARE THIS FILE'S CONTRACT AND ITS BOUNDS. FTS5 and the plain
// scan differ in how they find a document and in nothing else, so a result
// cannot depend on which one ran except in its ordering, which is stated.

import type { StorageDatabase } from "../storage/driver.js";
import { UsageError } from "../cli/exit-codes.js";
import { locate, searchPlain, type EngineResult, type SearchHit } from "./plain-scan.js";

export const DEFAULT_LIMIT = 20;
export const DEFAULT_TIMEOUT_MS = 2_000;
/** More tokens than this is not a query anyone typed. */
const MAX_TOKENS = 16;

export type { SearchHit } from "./plain-scan.js";

export interface SearchResult {
  readonly hits: readonly SearchHit[];
  readonly engine: "fts5" | "plain-scan";
  readonly tokens: readonly string[];
  readonly limit: number;
  /** True when the deadline stopped the search before it ran out of documents. */
  readonly timed_out: boolean;
  readonly elapsedMs: number;
}

export interface SearchOptions {
  readonly limit?: number;
  readonly timeoutMs?: number;
}

/**
 * A user string as plain tokens.
 *
 * Everything that is not a letter, digit, `_`, `-`, `.` or `/` is a separator.
 * Paths and dotted identifiers survive, which is most of what someone searches a
 * codebase for; operators do not survive at all.
 */
export function parseQuery(raw: string): string[] {
  const tokens = raw
    .split(/[^\p{L}\p{N}_./-]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
  if (tokens.length === 0) {
    throw new UsageError("--query must contain at least one searchable token");
  }
  return tokens.slice(0, MAX_TOKENS);
}

export function normalizeLimit(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1) throw new UsageError("--limit must be a whole number of at least 1");
  return Math.min(limit, 1_000);
}

export function normalizeTimeout(timeoutMs: number | undefined): number {
  if (timeoutMs === undefined) return DEFAULT_TIMEOUT_MS;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
    throw new UsageError("--timeout must be a whole number of milliseconds");
  }
  return Math.min(timeoutMs, 60_000);
}

/**
 * FTS5's MATCH expression over quoted tokens.
 *
 * Each token is wrapped in double quotes with its own quotes doubled, which is
 * FTS5's string literal and leaves no way for a token to become an operator.
 */
export function ftsExpression(tokens: readonly string[]): string {
  return tokens.map((token) => `"${token.split('"').join('""')}"`).join(" AND ");
}

/**
 * Search through the FTS5 index, then find the line inside each match.
 *
 * The `LIMIT` bounds the result set inside SQLite; the deadline bounds the
 * line-finding pass over the documents it returned.
 */
function searchFts(
  database: StorageDatabase,
  tokens: readonly string[],
  limit: number,
  deadline: number,
): EngineResult {
  const rows = database
    .prepare("SELECT path, body FROM docs_fts WHERE docs_fts MATCH ? ORDER BY rank LIMIT ?")
    .all(ftsExpression(tokens), limit);
  const hits: SearchHit[] = [];
  for (const row of rows) {
    if (Date.now() > deadline) return { hits, timedOut: true };
    const located = locate(String(row.body ?? ""), tokens);
    // FTS5 matches a document on tokens that may be spread across it. Reporting
    // that document with no line would be worse than omitting it: the user
    // would open the file and find nothing.
    if (located) hits.push({ path: String(row.path ?? ""), line: located.line, snippet: located.snippet });
  }
  return { hits, timedOut: false };
}

/**
 * Run a bounded query against an open shard.
 *
 * `fts5` selects the engine and is measured when the shard is opened rather than
 * guessed from the platform: a shard built by an FTS5-capable binary and read by
 * one without it must still answer, which is the whole reason the documents live
 * in an ordinary table with FTS5 as an index over it.
 */
export function searchShard(
  shard: { database: StorageDatabase; fts5: boolean },
  rawQuery: string,
  options: SearchOptions = {},
): SearchResult {
  const started = Date.now();
  const tokens = parseQuery(rawQuery);
  const limit = normalizeLimit(options.limit);
  const deadline = started + normalizeTimeout(options.timeoutMs);
  const { hits, timedOut } = shard.fts5
    ? searchFts(shard.database, tokens, limit, deadline)
    : searchPlain(shard.database, tokens, limit, deadline);
  return {
    hits: hits.slice(0, limit),
    engine: shard.fts5 ? "fts5" : "plain-scan",
    tokens,
    limit,
    timed_out: timedOut,
    elapsedMs: Date.now() - started,
  };
}
