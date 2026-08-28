// Search without FTS5, and the line-finding both engines share.
//
// WHY THIS EXISTS AT ALL. FTS5 is a compile-time SQLite option, and the binary
// ships on Bun, which bundles its own SQLite off macOS. Phase 1's smoke gate
// found FTS5 present on every target it could execute, but "present on the
// targets we tested" is not the same claim as "present", and a content-search
// command that simply fails on a runtime without FTS5 would be a feature that
// works until the day it does not. So the fallback is built rather than
// promised, and it is selected by asking the open database rather than by
// checking a platform name.
//
// IT IS SLOWER AND IT IS CORRECT. That is the whole trade. Both engines read
// the same `docs` rows, so a shard is not built differently depending on which
// one will read it, and the same suite runs against both.
//
// `locate` LIVES HERE BECAUSE IT IS A PLAIN SCAN. Even the FTS5 path needs it:
// FTS5 finds the document, and finding the line inside that document is a walk
// over its lines either way.

import type { StorageDatabase } from "../storage/driver.js";

/** Characters of context kept on each side of a hit. */
const SNIPPET_RADIUS = 60;
/** How many rows the scan reads before it checks the clock again. */
export const SCAN_PAGE = 200;

export interface SearchHit {
  readonly path: string;
  readonly line: number;
  readonly snippet: string;
}

export interface EngineResult {
  readonly hits: SearchHit[];
  /** True when the deadline stopped the search before it ran out of documents. */
  readonly timedOut: boolean;
}

/**
 * The first line containing every token, with a little context around it.
 *
 * All tokens on one line, rather than anywhere in the file: a hit the user
 * cannot see when they open the file is worse than no hit, because it costs
 * them the trip.
 */
export function locate(body: string, tokens: readonly string[]): { line: number; snippet: string } | undefined {
  const needles = tokens.map((token) => token.toLowerCase());
  const lines = body.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const haystack = line.toLowerCase();
    if (!needles.every((needle) => haystack.includes(needle))) continue;
    const at = haystack.indexOf(needles[0] ?? "");
    const from = Math.max(0, at - SNIPPET_RADIUS);
    const to = Math.min(line.length, at + SNIPPET_RADIUS);
    return {
      line: index + 1,
      snippet: `${from > 0 ? "…" : ""}${line.slice(from, to).trim()}${to < line.length ? "…" : ""}`,
    };
  }
  return undefined;
}

/**
 * Scan every document in the shard, paged.
 *
 * Paged rather than read whole for two reasons that are really one: the
 * deadline can only be honoured between batches, and a shard of large documents
 * read in a single statement would materialise the whole project in memory
 * before the first check. Rows come back ordered by path so two runs over the
 * same shard produce the same answer in the same order.
 */
export function searchPlain(
  database: StorageDatabase,
  tokens: readonly string[],
  limit: number,
  deadline: number,
): EngineResult {
  const statement = database.prepare("SELECT path, body FROM docs ORDER BY path LIMIT ? OFFSET ?");
  const hits: SearchHit[] = [];
  for (let offset = 0; ; offset += SCAN_PAGE) {
    if (Date.now() > deadline) return { hits, timedOut: true };
    const rows = statement.all(SCAN_PAGE, offset);
    if (rows.length === 0) return { hits, timedOut: false };
    for (const row of rows) {
      const located = locate(String(row.body ?? ""), tokens);
      if (!located) continue;
      hits.push({ path: String(row.path ?? ""), line: located.line, snippet: located.snippet });
      if (hits.length >= limit) return { hits, timedOut: false };
    }
  }
}
