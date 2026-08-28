// Append-only JSONL, shared by the two logs this tool keeps.
//
// `history/` records what ariadnev did to this machine — installs, updates,
// doctor runs — and `av query` is a shipped contract over it. `activity/`
// records what agents did with the skills, aggregated by `av activity stats`.
// Different producers, different consumers, different retention, so they stay
// two vocabularies. What they share is the mechanism below, and sharing it is
// what stops the two from drifting into subtly different durability rules.
//
// THE RULE THAT MATTERS: recording is best-effort and never breaks the command
// being recorded. An install that fails because a log write failed is worse
// than an install with no log. But silence is not free either — a caller has to
// be able to tell "nothing happened" from "things happened and were lost", so a
// failed append drops a marker beside the log rather than vanishing.

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/** Directory mode for a log root: owner only. */
const LOG_DIRECTORY_MODE = 0o700;
/** File mode for a log: owner only. */
const LOG_FILE_MODE = 0o600;

/**
 * Append one line, creating the parent directory. Throws on I/O failure —
 * `appendLineSafe` is the wrapper that decides a failure is survivable.
 */
export function appendLine(path: string, line: string): void {
  if (line.includes("\n")) {
    // One record is one line by construction. A newline inside a serialized
    // record would silently become a second, corrupt line, and `readLines`
    // would then skip it without a word — a data-loss bug that reports itself
    // as nothing at all.
    throw new Error("a JSONL record cannot contain a newline");
  }
  mkdirSync(dirname(path), { recursive: true, mode: LOG_DIRECTORY_MODE });
  // `mode` on appendFileSync applies only when the file is created, which is
  // exactly the case that matters: after that the mode is already ours.
  appendFileSync(path, `${line}\n`, { mode: LOG_FILE_MODE });
}

/**
 * Read every parseable record, skipping any line that is not.
 *
 * Tolerant by design. The last line of an append-only log is the one a crash
 * truncates, and failing the whole read because of it would throw away every
 * good line written before it.
 */
export function readLines<T>(path: string): T[] {
  return readLinesCounted<T>(path).entries;
}

/**
 * Same read, but also reporting how many lines were unparseable.
 *
 * A caller that aggregates needs the skipped count: an aggregate that cannot
 * say what it failed to read silently under-reports. Counted here rather than
 * by re-reading the file, so the two numbers cannot disagree.
 */
export function readLinesCounted<T>(path: string): { entries: T[]; skipped: number } {
  if (!existsSync(path)) return { entries: [], skipped: 0 };
  const entries: T[] = [];
  let skipped = 0;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line) as T);
    } catch {
      // A truncated or corrupt line is skipped, not fatal.
      skipped += 1;
    }
  }
  return { entries, skipped };
}

/**
 * Append best-effort. Never throws; on failure writes `markerPath` so a reader
 * can distinguish an empty log from a broken one.
 */
export function appendLineSafe(
  input: { path: string; line: string; markerPath: string },
  deps: { append?: (path: string, line: string) => void } = {},
): void {
  try {
    (deps.append ?? appendLine)(input.path, input.line);
  } catch {
    try {
      mkdirSync(dirname(input.markerPath), { recursive: true, mode: LOG_DIRECTORY_MODE });
      writeFileSync(input.markerPath, new Date().toISOString(), { mode: LOG_FILE_MODE });
    } catch {
      // The marker is itself best-effort: a read-only home fails the append and
      // then fails the marker. Swallowing here is the difference between a
      // degraded logger and a logger that takes the command down with it.
    }
  }
}
