import { appendFileSync, chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { appendLine, appendLineSafe, readLines } from "./jsonl-log.js";

const dirs: string[] = [];
const mk = () => {
  const dir = mkdtempSync(join(tmpdir(), "ariadnev-jsonl-"));
  dirs.push(dir);
  return dir;
};

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    try {
      chmodSync(dir, 0o700);
    } catch {
      // Already removable.
    }
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("appendLine", () => {
  it("creates the parent directory and terminates every line", () => {
    const path = join(mk(), "nested", "deeper", "log.jsonl");
    appendLine(path, JSON.stringify({ a: 1 }));
    appendLine(path, JSON.stringify({ a: 2 }));
    expect(readFileSync(path, "utf8")).toBe('{"a":1}\n{"a":2}\n');
  });

  it("creates the file 0600 and the directory 0700", () => {
    // Both logs record what a user did on their machine. Default umask would
    // leave them group- and world-readable on a shared host.
    if (process.platform === "win32") return;
    const root = mk();
    const path = join(root, "log", "log.jsonl");
    appendLine(path, "{}");
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(statSync(join(root, "log")).mode & 0o777).toBe(0o700);
  });

  it("refuses a line containing a newline instead of writing two records", () => {
    // A newline inside a serialized record silently becomes a second, corrupt
    // line — and the tolerant reader would then skip it without a word. The
    // record is one line by construction, so this can only be a bug upstream.
    const path = join(mk(), "log.jsonl");
    expect(() => appendLine(path, '{"a":"one\ntwo"}')).toThrow(/newline/i);
    expect(existsSync(path)).toBe(false);
  });
});

describe("readLines", () => {
  it("returns [] for a file that does not exist", () => {
    expect(readLines(join(mk(), "absent.jsonl"))).toEqual([]);
  });

  it("skips a corrupt line rather than failing the whole read", () => {
    // The last line of an append-only log is the one a crash truncates. Losing
    // the read entirely because of it would lose every good line before it.
    const path = join(mk(), "log.jsonl");
    appendLine(path, JSON.stringify({ n: 1 }));
    appendFileSync(path, "{ not json\n");
    appendLine(path, JSON.stringify({ n: 2 }));
    appendFileSync(path, '{"n":3');
    expect(readLines<{ n: number }>(path).map((entry) => entry.n)).toEqual([1, 2]);
  });

  it("ignores blank lines", () => {
    const path = join(mk(), "log.jsonl");
    appendFileSync(path, '\n\n{"n":1}\n\n');
    expect(readLines<{ n: number }>(path)).toEqual([{ n: 1 }]);
  });
});

describe("appendLineSafe", () => {
  it("writes the line and leaves no marker when the append succeeds", () => {
    const root = mk();
    const path = join(root, "log.jsonl");
    const markerPath = join(root, "log.degraded");
    appendLineSafe({ path, line: '{"n":1}', markerPath });
    expect(readLines<{ n: number }>(path)).toEqual([{ n: 1 }]);
    expect(existsSync(markerPath)).toBe(false);
  });

  it("never throws on a failing append, and records that recording is broken", () => {
    // The whole contract. An install must not fail because a log write did,
    // and "no events" must stay distinguishable from "events were lost".
    const root = mk();
    const markerPath = join(root, "log.degraded");
    const boom = () => {
      throw new Error("disk full");
    };
    expect(() => appendLineSafe({ path: join(root, "log.jsonl"), line: "{}", markerPath }, { append: boom })).not.toThrow();
    expect(existsSync(markerPath)).toBe(true);
  });

  it("still does not throw when even the marker cannot be written", () => {
    // The failure mode that would otherwise turn a best-effort logger into the
    // thing that takes down the command: a read-only home directory fails the
    // append and then fails the marker too.
    const boom = () => {
      throw new Error("disk full");
    };
    expect(() =>
      appendLineSafe(
        { path: "/nonexistent-root-ariadnev/log.jsonl", line: "{}", markerPath: "/nonexistent-root-ariadnev/log.degraded" },
        { append: boom },
      ),
    ).not.toThrow();
  });
});
