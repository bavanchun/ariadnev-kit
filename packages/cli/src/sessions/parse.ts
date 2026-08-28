// Streaming JSONL reader for session files this tool does not own.
//
// WHY NOT `log/jsonl-log.ts`. That module reads with `readFileSync`, which is
// correct for the logs ariadnev writes: they are small, and it controls their
// size with a per-record cap. A session file is neither. The largest observed
// on the machine this was designed against is 20,086,868 bytes — and it is the
// one currently being appended to. So this reads in chunks and yields lines,
// and the two modules stay separate because they have genuinely different
// constraints rather than because nobody merged them.
//
// TOLERANCE IS THE FEATURE, NOT A FALLBACK. A live agent appends to these files
// while they are being read, so the last line is routinely a partial write.
// Every parse failure is counted and skipped; none is fatal. A reader that
// threw on the trailing line would fail against a healthy session most of the
// time.
//
// READ-ONLY. Nothing in this module opens a file for writing.

import { closeSync, openSync, readSync, statSync } from "node:fs";
import { StringDecoder } from "node:string_decoder";

/**
 * Bytes per read. Large enough that a normal session costs few syscalls, small
 * enough that holding one chunk is not a memory concern.
 */
export const CHUNK_BYTES = 64 * 1024;

/** Bytes consumed so far, for callers that need to prove reads stayed bounded. */
export interface StreamStats {
  bytesRead: number;
}

/**
 * Yield one line at a time, reading only as far as the consumer asks.
 *
 * A generator rather than a callback so that `break` actually stops the read:
 * `list` needs a handful of lines from a 20 MB file, and the whole point is not
 * paying for the rest.
 *
 * Two details that are easy to get wrong and silently corrupting:
 *
 * - **A record can be longer than a chunk.** A large tool result does it
 *   easily, so the tail of each chunk is carried into the next rather than
 *   emitted as a short line.
 * - **A multi-byte character can straddle a chunk boundary.** Decoding each
 *   chunk independently would split it and turn a valid record into a skipped
 *   one. `StringDecoder` holds the incomplete bytes until the rest arrives,
 *   which matters because these sessions are full of non-ASCII prose.
 */
export function* streamLines(path: string, stats?: StreamStats): Generator<string> {
  let fd: number;
  try {
    fd = openSync(path, "r");
  } catch {
    // The file belongs to another tool and can be deleted between a listing
    // and a read. That is not this tool's error to raise.
    return;
  }
  const decoder = new StringDecoder("utf8");
  const buffer = Buffer.allocUnsafe(CHUNK_BYTES);
  let pending = "";
  try {
    for (;;) {
      const bytes = readSync(fd, buffer, 0, CHUNK_BYTES, null);
      if (stats) stats.bytesRead += bytes;
      if (bytes === 0) break;
      pending += decoder.write(buffer.subarray(0, bytes));
      let newline = pending.indexOf("\n");
      while (newline !== -1) {
        yield pending.slice(0, newline);
        pending = pending.slice(newline + 1);
        newline = pending.indexOf("\n");
      }
    }
    pending += decoder.end();
    // A last line with no trailing newline is a complete record; a last line
    // that is a partial write is not. Both arrive here looking identical, and
    // `readRecords` tells them apart by whether they parse.
    if (pending.length > 0) yield pending;
  } finally {
    closeSync(fd);
  }
}

export interface ReadOptions {
  /** 0-based line position to start from. Matches the oracle's `--cursor`. */
  readonly cursor?: number;
  /** Maximum records to return. */
  readonly limit?: number;
  readonly stats?: StreamStats;
}

export interface ParseResult<T> {
  readonly entries: T[];
  /** Lines that were not parseable JSON. Never fatal, always reported. */
  readonly skipped: number;
  /** Line position to resume from, absent when the file ended. */
  readonly nextCursor?: number;
}

/**
 * Parse a window of records.
 *
 * `cursor` counts **lines**, not records, and a skipped line advances it. A
 * cursor that only counted successful parses would name a different window
 * each time the file grew a corrupt line, which is precisely the situation
 * these files are in.
 */
export function readRecords<T>(path: string, options: ReadOptions = {}): ParseResult<T> {
  const cursor = options.cursor ?? 0;
  const limit = options.limit ?? Number.POSITIVE_INFINITY;
  const entries: T[] = [];
  let skipped = 0;
  let position = 0;
  let nextCursor: number | undefined;

  for (const raw of streamLines(path, options.stats)) {
    const at = position++;
    if (at < cursor) continue;
    if (entries.length >= limit) {
      // One line past the window is what proves there is a next page. Reported
      // rather than guessed from a count, because a guess would offer a cursor
      // to a page that turns out to be empty.
      nextCursor = at;
      break;
    }
    const line = raw.trim();
    // A blank line is not corruption. Counting it as skipped would report data
    // loss where there was none.
    if (line.length === 0) continue;
    try {
      entries.push(JSON.parse(line) as T);
    } catch {
      skipped += 1;
    }
  }

  return nextCursor === undefined ? { entries, skipped } : { entries, skipped, nextCursor };
}

/**
 * Count lines and bytes without holding any record.
 *
 * `list` needs a message count per session and must not pay for the content to
 * get it.
 */
export function scanCounts(path: string): { lines: number; sizeBytes: number } {
  let lines = 0;
  for (const raw of streamLines(path)) {
    if (raw.trim().length > 0) lines += 1;
  }
  let sizeBytes = 0;
  try {
    sizeBytes = statSync(path).size;
  } catch {
    sizeBytes = 0;
  }
  return { lines, sizeBytes };
}
