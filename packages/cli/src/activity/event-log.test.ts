import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { isDerived } from "../storage/operational-paths.js";
import { appendActivityEvent, listSegments, readActivity, segmentPath } from "./event-log.js";
import { toActivityEvent, type ActivityEventV1 } from "./event-types.js";

const dirs: string[] = [];
const mk = () => {
  const dir = mkdtempSync(join(tmpdir(), "ariadnev-activity-"));
  dirs.push(dir);
  return dir;
};

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const at = (iso: string) => new Date(iso);

describe("segmentPath", () => {
  it("names a segment by UTC day, not by the machine's timezone", () => {
    // A local-timezone segment name makes the file a user sees depend on where
    // they are sitting, and makes any rollover test pass or fail by TZ.
    expect(segmentPath("/home/u", at("2026-08-28T23:30:00.000Z"))).toMatch(/activity-20260828\.jsonl$/);
    expect(segmentPath("/home/u", at("2026-08-29T00:30:00.000Z"))).toMatch(/activity-20260829\.jsonl$/);
  });

  it("puts segments in authoritative storage, never under derived/", () => {
    // The doctrine from ADR 0014, asserted rather than trusted: `derived/` can
    // be deleted between two commands. These events cannot be rebuilt.
    const home = "/home/u";
    expect(isDerived(home, segmentPath(home, at("2026-08-28T00:00:00.000Z")))).toBe(false);
  });
});

describe("appendActivityEvent", () => {
  it("round-trips an event through its segment", () => {
    const home = mk();
    const event = toActivityEvent("workflow.completed", { runtime: "codex", status: "ok" }, at("2026-08-28T10:00:00.000Z"));
    appendActivityEvent(home, event, at("2026-08-28T10:00:00.000Z"));
    expect(readActivity(home)).toEqual([event]);
  });

  it("segments by day, so retention is a file unlink rather than a rewrite", () => {
    // An append-only log that must be rewritten to prune is not append-only.
    const home = mk();
    appendActivityEvent(home, toActivityEvent("install.completed", {}, at("2026-08-27T10:00:00.000Z")), at("2026-08-27T10:00:00.000Z"));
    appendActivityEvent(home, toActivityEvent("install.completed", {}, at("2026-08-28T10:00:00.000Z")), at("2026-08-28T10:00:00.000Z"));
    expect(listSegments(home).map((path) => path.split(/[\\/]/).pop())).toEqual([
      "activity-20260827.jsonl",
      "activity-20260828.jsonl",
    ]);
  });

  it("writes segments 0600", () => {
    if (process.platform === "win32") return;
    const home = mk();
    const when = at("2026-08-28T10:00:00.000Z");
    appendActivityEvent(home, toActivityEvent("install.completed", {}, when), when);
    expect(statSync(segmentPath(home, when)).mode & 0o777).toBe(0o600);
  });

  it("never throws when the log directory cannot be written", () => {
    // The contract that matters more than the log itself: an install must not
    // fail because a log write did.
    const home = join(mk(), "file-not-a-directory");
    writeFileSync(home, "");
    expect(() => appendActivityEvent(home, toActivityEvent("install.completed", {}))).not.toThrow();
  });

  it("drops an oversized event rather than tearing a line, and stays silent", () => {
    // Serialization refuses past the atomic-append ceiling. That refusal must
    // not escape into the command being observed.
    const home = mk();
    const when = at("2026-08-28T10:00:00.000Z");
    const oversized = { ...toActivityEvent("workflow.failed", {}, when), status: "s".repeat(8000) } as ActivityEventV1;
    expect(() => appendActivityEvent(home, oversized, when)).not.toThrow();
    expect(readActivity(home)).toEqual([]);
  });
});

describe("readActivity", () => {
  const seed = (home: string) => {
    const days = ["2026-08-26", "2026-08-27", "2026-08-28"];
    const written: ActivityEventV1[] = [];
    for (const day of days) {
      for (const n of [0, 1]) {
        const when = at(`${day}T0${n}:00:00.000Z`);
        const event = toActivityEvent("workflow.completed", { runtime: n === 0 ? "codex" : "claude-code", kit: "engineer" }, when);
        appendActivityEvent(home, event, when);
        written.push(event);
      }
    }
    return written;
  };

  it("returns newest first", () => {
    const home = mk();
    const written = seed(home);
    const read = readActivity(home);
    expect(read.map((event) => event.id)).toEqual([...written].reverse().map((event) => event.id));
  });

  it("honors a limit", () => {
    const home = mk();
    seed(home);
    expect(readActivity(home, { limit: 2 })).toHaveLength(2);
  });

  it("returns only events strictly after a `--since` cursor, across a day rollover", () => {
    // The cursor case that segmentation makes easy to get wrong: the events
    // after the cursor are in a different file from the cursor itself.
    const home = mk();
    const written = seed(home);
    const cursor = written[2].id;
    const after = readActivity(home, { since: cursor });
    expect(after.map((event) => event.id)).toEqual([...written.slice(3)].reverse().map((event) => event.id));
    expect(after.some((event) => event.id === cursor)).toBe(false);
  });

  it("returns nothing for a cursor at the newest event", () => {
    const home = mk();
    const written = seed(home);
    expect(readActivity(home, { since: written[written.length - 1].id })).toEqual([]);
  });

  it("returns [] on an empty or absent log", () => {
    expect(readActivity(mk())).toEqual([]);
    expect(listSegments(mk())).toEqual([]);
  });

  it("skips a corrupt line and still returns the good ones", () => {
    const home = mk();
    const when = at("2026-08-28T10:00:00.000Z");
    appendActivityEvent(home, toActivityEvent("install.completed", {}, when), when);
    writeFileSync(segmentPath(home, when), `${readFileSync(segmentPath(home, when), "utf8")}{ truncated\n`);
    expect(readActivity(home)).toHaveLength(1);
  });

  it("ignores a file that is not a segment", () => {
    // The directory is a user's to look at, so something else will end up in
    // it. A stray file must not become events.
    const home = mk();
    const when = at("2026-08-28T10:00:00.000Z");
    appendActivityEvent(home, toActivityEvent("install.completed", {}, when), when);
    writeFileSync(join(segmentPath(home, when), "..", "notes.txt"), "hello\n");
    expect(listSegments(home)).toHaveLength(1);
  });
});

describe("concurrent appends", () => {
  it("never tear a line, across processes", () => {
    // The claim the size cap exists to support. Four processes appending at
    // once; every resulting line must still parse, and none may be lost.
    const home = mk();
    const script = join(home, "append.mjs");
    const target = segmentPath(home, at("2026-08-28T10:00:00.000Z"));
    writeFileSync(
      script,
      [
        'import { appendFileSync, mkdirSync } from "node:fs";',
        'import { dirname } from "node:path";',
        "const [, , path, tag] = process.argv;",
        "mkdirSync(dirname(path), { recursive: true, mode: 0o700 });",
        "for (let i = 0; i < 150; i += 1) {",
        '  appendFileSync(path, `${JSON.stringify({ v: 1, tag, i, pad: "x".repeat(200) })}\\n`, { mode: 0o600 });',
        "}",
      ].join("\n"),
    );

    const workers = ["a", "b", "c", "d"].map((tag) =>
      new Promise<void>((resolve, reject) => {
        try {
          execFileSync(process.execPath, [script, target, tag], { timeout: 30000 });
          resolve();
        } catch (error) {
          reject(error);
        }
      }),
    );

    return Promise.all(workers).then(() => {
      const lines = readFileSync(target, "utf8").split("\n").filter((line) => line.length > 0);
      expect(lines).toHaveLength(600);
      for (const line of lines) expect(() => JSON.parse(line)).not.toThrow();
    });
  });
});

describe("the log directory", () => {
  it("is created only when something is written to it", () => {
    // A tool that materializes storage during an unrelated command is worse
    // than one that does not. Reading must not create.
    const home = mk();
    readActivity(home);
    listSegments(home);
    expect(existsSync(join(home, ".ariadnev"))).toBe(false);
  });
});
