import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CHUNK_BYTES, readRecords, streamLines } from "./parse.js";

const dirs: string[] = [];
const mk = () => {
  const dir = mkdtempSync(join(tmpdir(), "ariadnev-sessions-"));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function fixture(content: string): string {
  const path = join(mk(), "session.jsonl");
  writeFileSync(path, content);
  return path;
}

const line = (n: number) => JSON.stringify({ type: "user", n });

describe("the four shapes a live session file takes", () => {
  it("reads a well-formed file", () => {
    const path = fixture(`${line(1)}\n${line(2)}\n${line(3)}\n`);
    const result = readRecords<{ n: number }>(path);
    expect(result.entries.map((entry) => entry.n)).toEqual([1, 2, 3]);
    expect(result.skipped).toBe(0);
  });

  it("skips a truncated last line instead of failing the whole read", () => {
    // THE NORMAL CASE, not an edge one. A live agent appends to these files
    // while they are being read, so landing mid-write is expected. Failing the
    // read would throw away every good line that came before.
    const path = fixture(`${line(1)}\n${line(2)}\n{"type":"user","n":3`);
    const result = readRecords<{ n: number }>(path);
    expect(result.entries.map((entry) => entry.n)).toEqual([1, 2]);
    expect(result.skipped).toBe(1);
  });

  it("reads an empty file as no records rather than an error", () => {
    const result = readRecords(fixture(""));
    expect(result.entries).toEqual([]);
    expect(result.skipped).toBe(0);
  });

  it("skips an unparseable line in the middle and keeps the ones after it", () => {
    // A mid-file corrupt line is the case that separates "tolerant" from
    // "stops at the first problem": everything after it must still be read.
    const path = fixture(`${line(1)}\nnot json at all\n${line(3)}\n`);
    const result = readRecords<{ n: number }>(path);
    expect(result.entries.map((entry) => entry.n)).toEqual([1, 3]);
    expect(result.skipped).toBe(1);
  });

  it("counts a blank line as neither a record nor a skip", () => {
    // A blank line is not corruption; reporting it as a skipped record would
    // make the count read as data loss where there was none.
    const path = fixture(`${line(1)}\n\n${line(2)}\n`);
    const result = readRecords<{ n: number }>(path);
    expect(result.entries).toHaveLength(2);
    expect(result.skipped).toBe(0);
  });

  it("reads a final line with no trailing newline", () => {
    const path = fixture(`${line(1)}\n${line(2)}`);
    expect(readRecords<{ n: number }>(path).entries).toHaveLength(2);
  });

  it("reports a file that is not there as empty rather than throwing", () => {
    // Sessions belong to another tool. One can be deleted between the listing
    // and the read, and that is not this tool's error to raise.
    const result = readRecords(join(mk(), "gone.jsonl"));
    expect(result.entries).toEqual([]);
  });
});

describe("memory does not scale with file size", () => {
  // The observed maximum on the machine this was designed against is 20 MB and
  // growing, in the file currently being appended to. `readFileSync` is not an
  // option, and a test that only checked the output would pass either way.

  function bigFile(lines: number): string {
    const padding = "x".repeat(400);
    const body = Array.from({ length: lines }, (_, i) => JSON.stringify({ type: "user", n: i, padding })).join("\n");
    return fixture(`${body}\n`);
  }

  it("stops reading once the caller stops consuming", () => {
    const path = bigFile(20_000);
    const stats = { bytesRead: 0 };
    const iterator = streamLines(path, stats);

    const first: string[] = [];
    for (const raw of iterator) {
      first.push(raw);
      if (first.length === 3) break;
    }

    expect(first).toHaveLength(3);
    // Three lines cost at most the chunk that contained them, not the file.
    expect(stats.bytesRead).toBeLessThanOrEqual(CHUNK_BYTES);
    expect(stats.bytesRead).toBeLessThan(200_000);
  });

  it("holds only the requested window, whatever the file holds", () => {
    const path = bigFile(20_000);
    const stats = { bytesRead: 0 };
    const result = readRecords(path, { limit: 5, stats });
    expect(result.entries).toHaveLength(5);
    expect(stats.bytesRead).toBeLessThanOrEqual(CHUNK_BYTES);
  });

  it("reads a line longer than one chunk without splitting the record", () => {
    // A record can exceed the chunk size — a large tool result does it easily.
    // Reassembly across chunk boundaries is what makes the reader correct
    // rather than merely fast.
    const huge = JSON.stringify({ type: "assistant", padding: "y".repeat(CHUNK_BYTES * 3) });
    const path = fixture(`${line(1)}\n${huge}\n${line(2)}\n`);
    const result = readRecords<{ type: string; padding?: string }>(path);
    expect(result.entries).toHaveLength(3);
    expect(result.entries[1].padding).toHaveLength(CHUNK_BYTES * 3);
    expect(result.skipped).toBe(0);
  });

  it("does not split a multi-byte character sitting on a chunk boundary", () => {
    // Decoding each chunk independently corrupts any character straddling the
    // boundary, which turns a valid record into a skipped one — and the
    // sessions on this machine are full of non-ASCII prose.
    const filler = "a".repeat(CHUNK_BYTES - 20);
    const path = fixture(`${JSON.stringify({ type: "user", text: `${filler}日本語のテキスト` })}\n`);
    const result = readRecords<{ text: string }>(path);
    expect(result.skipped).toBe(0);
    expect(result.entries[0].text).toContain("日本語のテキスト");
  });
});

describe("pagination", () => {
  it("returns a window from a cursor, and says whether more follows", () => {
    const path = fixture(`${[1, 2, 3, 4, 5].map(line).join("\n")}\n`);
    const page = readRecords<{ n: number }>(path, { cursor: 1, limit: 2 });
    expect(page.entries.map((entry) => entry.n)).toEqual([2, 3]);
    expect(page.nextCursor).toBe(3);
  });

  it("has no next cursor at the end", () => {
    const path = fixture(`${[1, 2, 3].map(line).join("\n")}\n`);
    expect(readRecords(path, { cursor: 2, limit: 5 }).nextCursor).toBeUndefined();
  });

  it("counts a skipped line against the cursor, so a page never silently shifts", () => {
    // The cursor is a line position, not a record index. If a corrupt line did
    // not advance it, re-reading the same cursor after the file grew would
    // return a different window.
    const path = fixture(`${line(1)}\nbroken\n${line(3)}\n`);
    const page = readRecords<{ n: number }>(path, { cursor: 2, limit: 5 });
    expect(page.entries.map((entry) => entry.n)).toEqual([3]);
  });
});
