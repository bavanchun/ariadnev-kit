import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { UsageError } from "../cli/exit-codes.js";
import { allow, inspectWatcher, isAllowed, readAllowlist, recordWatcher } from "./allowlist.js";
import { checkRate, parseMaxPerHour, pruneResponseTimes } from "./rate-limit.js";
import { claimIssue, parseRepo, readState, statePath, writeState, emptyState } from "./state.js";

const dirs: string[] = [];
const mk = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "ariadnev-watch-state-"));
  dirs.push(dir);
  return dir;
};

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const ref = parseRepo("octo/repo");

describe("parsing a repository", () => {
  it("accepts an ordinary owner/repo", () => {
    expect(parseRepo("octo/hello-world.js")).toEqual({ owner: "octo", name: "hello-world.js" });
  });

  it.each(["octo", "a/b/c", "", "/repo", "octo/"])("refuses %s", (raw) => {
    expect(() => parseRepo(raw)).toThrow(UsageError);
  });

  it("refuses anything that could escape the state directory", () => {
    // The slug becomes a path segment. This arrives from the command line rather
    // than from an issue body, which is exactly why it is easy to skip.
    for (const raw of ["../../etc/passwd", "octo/..", "../x/y", "octo/../../etc"]) {
      expect(() => parseRepo(raw), raw).toThrow(UsageError);
    }
  });

  it("keeps one repository's state out of another's directory", () => {
    const home = mk();
    expect(statePath(home, parseRepo("a/b"))).not.toBe(statePath(home, parseRepo("a/c")));
    expect(statePath(home, ref)).toMatch(/operational[/\\]watch[/\\]octo[/\\]repo[/\\]state\.json$/);
  });
});

describe("reading state", () => {
  it("is empty for a repository never watched", () => {
    expect(readState(mk(), ref)).toEqual(emptyState(ref));
  });

  it("refuses to continue on a corrupt file rather than answering everything again", () => {
    // The wrong direction to fail in for this file: an empty answered set means
    // every open issue looks unanswered.
    const home = mk();
    const path = statePath(home, ref);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, "{ truncated");
    expect(() => readState(home, ref)).toThrow(/unreadable/);
  });

  it("drops entries of the wrong type instead of trusting them", () => {
    const home = mk();
    writeState(home, ref, { ...emptyState(ref), responded: [1, 2] });
    const path = statePath(home, ref);
    writeFileSync(path, JSON.stringify({ responded: [1, "two", null, 3], lastSeenIssue: "nope" }));
    const state = readState(home, ref);
    expect(state.responded).toEqual([1, 3]);
    expect(state.lastSeenIssue).toBe(0);
  });
});

describe("claiming an issue", () => {
  it("records it and reports the claim", () => {
    const home = mk();
    expect(claimIssue(home, ref, 5, new Date("2026-08-29T10:00:00Z"))).toBe(true);
    expect(readState(home, ref).responded).toEqual([5]);
  });

  it("refuses a second claim on the same issue", () => {
    const home = mk();
    const now = new Date("2026-08-29T10:00:00Z");
    claimIssue(home, ref, 5, now);
    expect(claimIssue(home, ref, 5, now)).toBe(false);
    expect(readState(home, ref).responded).toEqual([5]);
  });

  it("records the dispatch time, which is what the rate limit counts", () => {
    const home = mk();
    claimIssue(home, ref, 5, new Date("2026-08-29T10:00:00Z"));
    expect(readState(home, ref).responseTimes).toEqual(["2026-08-29T10:00:00.000Z"]);
  });
});

describe("the local rate limit", () => {
  const now = new Date("2026-08-29T12:00:00Z");

  it("allows while the window has room", () => {
    expect(checkRate(["2026-08-29T11:30:00Z"], 3, now)).toMatchObject({ allowed: true, used: 1, max: 3 });
  });

  it("refuses once the window is full, and says when to retry", () => {
    const verdict = checkRate(["2026-08-29T11:30:00Z", "2026-08-29T11:45:00Z"], 2, now);
    expect(verdict.allowed).toBe(false);
    expect(verdict.retryAt).toBe("2026-08-29T12:30:00.000Z");
  });

  it("slides, so responses older than an hour stop counting", () => {
    expect(checkRate(["2026-08-29T10:00:00Z"], 1, now).allowed).toBe(true);
  });

  it("counts an unparseable timestamp rather than discarding it", () => {
    // Discarding would make a corrupt state file a way to lift the limit, and a
    // rate limit a bad write can lift is not a rate limit.
    expect(checkRate(["not a date"], 1, now).allowed).toBe(false);
  });

  it("refuses everything at zero", () => {
    expect(checkRate([], 0, now).allowed).toBe(false);
  });

  it("prunes aged-out stamps so the file does not grow forever", () => {
    expect(pruneResponseTimes(["2026-08-29T10:00:00Z", "2026-08-29T11:30:00Z"], now)).toEqual(["2026-08-29T11:30:00Z"]);
  });

  it.each(["-1", "1.5", "abc"])("refuses --max-per-hour %s", (raw) => {
    expect(() => parseMaxPerHour(raw)).toThrow(UsageError);
  });
});

describe("the allowlist", () => {
  it("is empty until someone opts in", () => {
    const home = mk();
    expect(readAllowlist(home)).toEqual([]);
    expect(isAllowed(home, ref)).toBe(false);
  });

  it("records a repository once, and says whether it was new", () => {
    const home = mk();
    expect(allow(home, ref)).toBe(true);
    expect(allow(home, ref)).toBe(false);
    expect(readAllowlist(home)).toEqual(["octo/repo"]);
    expect(isAllowed(home, ref)).toBe(true);
  });

  it("allowlisting one repository does not allow another", () => {
    const home = mk();
    allow(home, ref);
    expect(isAllowed(home, parseRepo("octo/other"))).toBe(false);
  });

  it("treats an unreadable allowlist as empty, which fails towards previewing", () => {
    const home = mk();
    allow(home, ref);
    writeFileSync(join(home, ".ariadnev", "operational", "watch", "allowlist.json"), "{ broken");
    expect(readAllowlist(home)).toEqual([]);
  });
});

describe("one watcher per repository", () => {
  it("reports stopped when nothing is recorded", () => {
    expect(inspectWatcher(mk(), ref).state).toBe("stopped");
  });

  it("reports running for a live pid", () => {
    const home = mk();
    recordWatcher(home, ref, { pid: process.pid, port: 0, bind: "-", startedAt: "", version: "1" });
    expect(inspectWatcher(home, ref).state).toBe("running");
  });

  it("reports stopped for a dead pid, so a crash does not block the next start", () => {
    const home = mk();
    recordWatcher(home, ref, { pid: 0x7fff_fffe, port: 0, bind: "-", startedAt: "", version: "1" });
    expect(inspectWatcher(home, ref).state).toBe("stopped");
  });

  it("keys the record per repository, not per machine", () => {
    // Two daemons on ONE repository clobber each other's answered sets through
    // last-write-wins renames and both reply. Two on different repositories are
    // fine, and must not be confused for each other.
    const home = mk();
    recordWatcher(home, ref, { pid: process.pid, port: 0, bind: "-", startedAt: "", version: "1" });
    expect(inspectWatcher(home, parseRepo("octo/other")).state).toBe("stopped");
  });
});
