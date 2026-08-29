import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { inspectWatcher, readAllowlist, recordWatcher } from "../watch/allowlist.js";
import { listIssues } from "../watch/poll.js";
import { parseRepo, readState } from "../watch/state.js";
import { UnavailableError } from "./exit-codes.js";
import {
  runWatchDryRun,
  runWatchStart,
  runWatchStatus,
  runWatchStop,
  type WatchDeps,
  type WatchOpts,
} from "./watch-command.js";

const dirs: string[] = [];
const mk = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "ariadnev-watch-cmd-"));
  dirs.push(dir);
  return dir;
};

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const ref = parseRepo("octo/repo");

const ISSUES = [
  { number: 2, title: "second", body: "b2", url: "u2", author: { login: "someone" } },
  { number: 1, title: "first", body: "b1", url: "u1", author: { login: "other" } },
];

interface Recorder {
  readonly deps: WatchDeps;
  readonly calls: string[][];
  readonly prompts: string[];
}

function deps(over: { issues?: unknown[]; ghStatus?: number } = {}): Recorder {
  const calls: string[][] = [];
  const prompts: string[] = [];
  return {
    calls,
    prompts,
    deps: {
      gh: (args) => {
        calls.push([...args]);
        if (args[1] === "list") {
          return { status: over.ghStatus ?? 0, stdout: JSON.stringify(over.issues ?? ISSUES), stderr: "" };
        }
        return { status: 0, stdout: "", stderr: "" };
      },
      dispatch: () => (prompt: string) => {
        prompts.push(prompt);
        return Promise.resolve({ ok: true, output: "here is a reply" });
      },
      now: () => new Date("2026-08-29T10:00:00.000Z"),
    },
  };
}

function opts(home: string, over: Partial<WatchOpts> = {}): WatchOpts {
  return { home, cwd: home, repo: "octo/repo", ...over };
}

describe("av watch dry-run", () => {
  it("previews and posts nothing at all", async () => {
    const home = mk();
    const world = deps();
    const result = await runWatchDryRun(opts(home), world.deps);
    expect(result.output).toMatch(/preview \(nothing was posted\)/);
    // The proof is that `gh issue comment` was never invoked.
    expect(world.calls.some((call) => call[1] === "comment")).toBe(false);
  });

  it("needs no allowlist entry — previewing is the default posture", async () => {
    const home = mk();
    await runWatchDryRun(opts(home), deps().deps);
    expect(readAllowlist(home)).toEqual([]);
  });

  it("tells the reader how to enable posting, and that it is revocable", async () => {
    const home = mk();
    const result = await runWatchDryRun(opts(home), deps().deps);
    expect(result.output).toMatch(/av watch start <repo> --yes/);
    expect(result.output).toMatch(/revocable/);
  });
});

describe("av watch start", () => {
  it("previews without --yes, and posts nothing", async () => {
    const home = mk();
    const world = deps();
    const result = await runWatchStart(opts(home), world.deps);
    expect(result.output).toMatch(/no --yes, so this was a preview/);
    expect(world.calls.some((call) => call[1] === "comment")).toBe(false);
    expect(readAllowlist(home)).toEqual([]);
  });

  it("with --yes records the decision and then posts", async () => {
    const home = mk();
    const world = deps();
    const result = await runWatchStart(opts(home, { yes: true }), world.deps);
    expect(readAllowlist(home)).toEqual(["octo/repo"]);
    expect(world.calls.filter((call) => call[1] === "comment")).toHaveLength(2);
    expect(result.output).toMatch(/allowlisted octo\/repo for posting/);
  });

  it("refuses to start a second watcher for the same repository", async () => {
    // Two would clobber each other's answered sets through last-write-wins
    // renames and both reply to the same issue.
    const home = mk();
    recordWatcher(home, ref, { pid: process.pid, port: 0, bind: "-", startedAt: "", version: "1" });
    await expect(runWatchStart(opts(home, { yes: true }), deps().deps)).rejects.toThrow(UnavailableError);
    await expect(runWatchStart(opts(home, { yes: true }), deps().deps)).rejects.toThrow(/already running/);
  });

  it("hands the agent a prompt whose issue text is fenced, never appended", async () => {
    const home = mk();
    const world = deps();
    await runWatchStart(opts(home, { yes: true }), world.deps);
    for (const prompt of world.prompts) {
      expect(prompt).toMatch(/<<<UNTRUSTED-[0-9a-f]{32}>>>/);
      expect(prompt.trimEnd()).toMatch(/<<<END-UNTRUSTED-[0-9a-f]{32}>>>$/);
    }
  });

  it("stops at the hourly cap rather than answering every open issue", async () => {
    const home = mk();
    const world = deps({
      issues: Array.from({ length: 6 }, (_, i) => ({ number: i + 1, title: `t${i}`, body: "b", url: "u", author: { login: "s" } })),
    });
    await runWatchStart(opts(home, { yes: true, maxPerHour: "2" }), world.deps);
    expect(world.calls.filter((call) => call[1] === "comment")).toHaveLength(2);
  });

  it("does not answer the same issue on a second run", async () => {
    const home = mk();
    const world = deps();
    await runWatchStart(opts(home, { yes: true }), world.deps);
    await runWatchStart(opts(home, { yes: true }), world.deps);
    expect(world.calls.filter((call) => call[1] === "comment")).toHaveLength(2);
  });
});

describe("av watch status", () => {
  it("says nothing is watched before anything happens", () => {
    expect(runWatchStatus(opts(mk(), { repo: undefined })).output).toMatch(/nothing watched/);
  });

  it("shows a repository that was only previewed, never allowlisted", async () => {
    // THE DEFECT THIS PINS. `status` listed the allowlist, and a watcher started
    // in preview mode is not allowlisted — so a running daemon that spawns
    // coding agents did not appear at all. Found on the binary, not here.
    const home = mk();
    await runWatchDryRun(opts(home), deps().deps);
    const result = runWatchStatus(opts(home, { repo: undefined }));
    expect(result.output).toMatch(/octo\/repo/);
    expect(result.output).toMatch(/preview-only/);
  });

  it("shows a running preview-mode watcher, which is the one worth finding", () => {
    const home = mk();
    recordWatcher(home, ref, { pid: process.pid, port: 0, bind: "-", startedAt: "", version: "1" });
    expect(runWatchStatus(opts(home, { repo: undefined })).output).toMatch(/daemon:running/);
  });

  it("makes the standing decision visible, which is what makes it revocable", async () => {
    const home = mk();
    await runWatchStart(opts(home, { yes: true }), deps().deps);
    const result = runWatchStatus(opts(home, { repo: undefined }));
    expect(result.output).toMatch(/octo\/repo {2}allowlisted/);
    expect(result.output).toMatch(/answered:2/);
  });

  it("reports the answered count and daemon state in JSON", async () => {
    const home = mk();
    await runWatchStart(opts(home, { yes: true }), deps().deps);
    const parsed = JSON.parse(runWatchStatus(opts(home, { repo: undefined, json: true })).output);
    expect(parsed.data.watches[0]).toMatchObject({ repo: "octo/repo", allowlisted: true, daemon: "stopped", responded: 2 });
  });
});

describe("av watch stop", () => {
  it("says so when nothing is running", () => {
    expect(runWatchStop(opts(mk())).output).toMatch(/not running/);
  });

  it("clears a record whose process is gone", () => {
    const home = mk();
    recordWatcher(home, ref, { pid: 0x7fff_fffe, port: 0, bind: "-", startedAt: "", version: "1" });
    expect(runWatchStop(opts(home)).output).toMatch(/removed a stale record/);
  });
});

describe("reading issues through gh", () => {
  it("asks only for open issues, and only for the fields it uses", () => {
    const world = deps();
    listIssues(world.deps.gh, ref, { label: "needs-response", limit: 5 });
    const call = world.calls[0]!.join(" ");
    expect(call).toContain("--state open");
    expect(call).toContain("--repo octo/repo");
    expect(call).toContain("--label needs-response");
    expect(call).toContain("--limit 5");
  });

  it("coerces every field, so a missing body never becomes the string undefined", () => {
    // This is where stranger-written JSON enters the process. A literal
    // "undefined" in a public comment is the visible version of trusting it.
    const world = deps({ issues: [{ number: 4 }] });
    const issues = listIssues(world.deps.gh, ref);
    expect(issues[0]).toEqual({ number: 4, title: "", body: "", url: "", author: "unknown" });
  });

  it("drops an entry with no issue number rather than guessing one", () => {
    const world = deps({ issues: [{ title: "no number" }, { number: 3, title: "ok" }] });
    expect(listIssues(world.deps.gh, ref).map((i) => i.number)).toEqual([3]);
  });

  it("reports a gh failure instead of treating it as an empty repository", () => {
    // Silence here would look like "no issues" and quietly stop the watch.
    const world = deps({ ghStatus: 1 });
    expect(() => listIssues(world.deps.gh, ref)).toThrow(UnavailableError);
  });
});

describe("state after a run", () => {
  it("records every answered issue so a restart cannot repeat them", async () => {
    const home = mk();
    await runWatchStart(opts(home, { yes: true }), deps().deps);
    expect([...readState(home, ref).responded].sort()).toEqual([1, 2]);
  });
});

describe("the detached watcher", () => {
  it("passes every filter through to the child, and adds --foreground", async () => {
    // A child that loses `--max-per-hour` runs at the default cap; one that
    // loses `--foreground` detaches again and nothing ever polls.
    const { watchSpawnArgs } = await import("./watch-command.js");
    const args = watchSpawnArgs(
      { home: "/h", cwd: "/c", repo: "octo/repo", yes: true, label: "bug", maxPerHour: "2", skill: "k/s", limit: 5 },
      ["/bin/av"],
      "/bin/av",
    );
    expect(args).toEqual([
      "--home", "/h", "--cwd", "/c", "--yes",
      "watch", "start", "octo/repo", "--foreground",
      "--label", "bug", "--max-per-hour", "2", "--skill", "k/s", "--limit", "5",
    ]);
  });

  it("does not pass --yes when the caller did not, so the child previews", async () => {
    const { watchSpawnArgs } = await import("./watch-command.js");
    expect(watchSpawnArgs({ home: "/h", cwd: "/c", repo: "octo/repo" }, ["/bin/av"], "/bin/av")).not.toContain("--yes");
  });

  it("records a pidfile while it runs and removes it on the way out", async () => {
    const { runWatchForeground } = await import("./watch-command.js");
    const home = mk();
    const stop = new AbortController();
    const world = deps();
    const running = runWatchForeground({ home, cwd: home, repo: "octo/repo", stop: stop.signal, json: true }, world.deps);
    // One sweep happens before the first sleep; ending it then is enough.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(inspectWatcher(home, ref).state).toBe("running");
    stop.abort();
    await running;
    expect(inspectWatcher(home, ref).record).toBeNull();
  });

  it("refuses to start a second one for the same repository", async () => {
    const { runWatchForeground } = await import("./watch-command.js");
    const home = mk();
    recordWatcher(home, ref, { pid: process.pid, port: 0, bind: "-", startedAt: "", version: "1" });
    await expect(runWatchForeground({ home, cwd: home, repo: "octo/repo" }, deps().deps)).rejects.toThrow(/already running/);
  });
});
