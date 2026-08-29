import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readActivity } from "../activity/event-log.js";
import { readDaemonRecord, writeDaemonRecord, type DaemonRecord } from "../api/daemon-state.js";
import type { HealthReport, LifecycleDeps } from "../api/daemon-lifecycle.js";
import { runApiForeground } from "./api-foreground.js";
import { dashboardUrl, runApiStart, runApiStatus, runApiStop, type ApiOpts } from "./api-command.js";
import { EXIT, UsageError } from "./exit-codes.js";

const dirs: string[] = [];
const mk = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "ariadnev-api-cmd-"));
  dirs.push(dir);
  return dir;
};

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const record = (over: Partial<DaemonRecord> = {}): DaemonRecord => ({
  pid: 4242,
  port: 8767,
  bind: "127.0.0.1",
  startedAt: "2026-08-29T04:00:00.000Z",
  version: "1.3.0",
  ...over,
});

function opts(home: string, over: Partial<ApiOpts> = {}): ApiOpts {
  return {
    home,
    cwd: home,
    version: "1.3.0",
    env: {},
    execPath: "/nowhere/av",
    argv: ["/nowhere/av"],
    ...over,
  };
}

interface Fake {
  readonly deps: LifecycleDeps;
  readonly signals: string[];
  health: HealthReport | null;
  living: Set<number>;
}

function fake(health: HealthReport | null = { pid: 4242, version: "1.3.0", startedAt: "" }): Fake {
  const signals: string[] = [];
  const living = new Set<number>([4242]);
  let clock = 0;
  const self: Fake = {
    signals,
    living,
    health,
    deps: {
      probeHealth: () => Promise.resolve(self.health),
      sleep: (ms) => {
        clock += ms;
        return Promise.resolve();
      },
      signal: (pid, sig) => {
        signals.push(`${pid}:${sig}`);
        living.delete(pid);
        return true;
      },
      alive: (pid) => living.has(pid),
      now: () => clock,
    },
  };
  return self;
}

describe("the URL a browser is sent to", () => {
  it("turns a wildcard bind into loopback — 0.0.0.0 is not an address to visit", () => {
    expect(dashboardUrl("0.0.0.0", 8767)).toBe("http://127.0.0.1:8767/");
    expect(dashboardUrl("127.0.0.1", 9000)).toBe("http://127.0.0.1:9000/");
    expect(dashboardUrl("::1", 8767)).toBe("http://[::1]:8767/");
  });
});

describe("av api start", () => {
  it("refuses a non-loopback bind with no token, before spawning anything", async () => {
    const home = mk();
    await expect(runApiStart(opts(home, { bind: "0.0.0.0" }), fake().deps)).rejects.toThrow(UsageError);
    // The proof that nothing was started: no record, no signal.
    expect(readDaemonRecord(home)).toBeNull();
  });

  it("does not spawn a second daemon when one is already confirmed running", async () => {
    // The failure this phase exists to prevent: every `start` adding a process.
    const home = mk();
    writeDaemonRecord(home, record());
    const result = await runApiStart(opts(home), fake().deps);
    expect(result.exitCode).toBe(EXIT.ok);
    expect(result.output).toMatch(/already running — pid 4242/);
  });

  it("says `started: false` in JSON when it found one already up", async () => {
    const home = mk();
    writeDaemonRecord(home, record());
    const result = await runApiStart(opts(home, { json: true }), fake().deps);
    expect(JSON.parse(result.output).data).toMatchObject({ running: true, started: false, pid: 4242 });
  });

  it("refuses to start over a daemon it could not identify", async () => {
    const home = mk();
    writeDaemonRecord(home, record());
    await expect(runApiStart(opts(home), fake(null).deps)).rejects.toThrow(/Refusing to start a second daemon/);
  });
});

describe("av api status", () => {
  it("reports not running with no record", async () => {
    expect((await runApiStatus(opts(mk()), fake().deps)).output).toBe("api: not running");
  });

  it("reports the address and pid of a confirmed daemon", async () => {
    const home = mk();
    writeDaemonRecord(home, record());
    const output = (await runApiStatus(opts(home), fake().deps)).output;
    expect(output).toMatch(/api: running/);
    expect(output).toMatch(/pid {6}4242/);
    expect(output).toMatch(/http:\/\/127\.0\.0\.1:8767\//);
  });

  it("names the port's actual holder when it is not ours", async () => {
    const home = mk();
    writeDaemonRecord(home, record());
    const w = fake({ pid: 9999, version: "?", startedAt: "" });
    expect((await runApiStatus(opts(home), w.deps)).output).toMatch(/unconfirmed — port 8767 is held by pid 9999/);
  });

  it("reports a null start time rather than a sentinel date when stopped", async () => {
    // The oracle prints `0001-01-01T00:00:00Z`, a timestamp a reader has to
    // recognise as fake. Null cannot be misread as a real one.
    const result = await runApiStatus(opts(mk(), { json: true }), fake().deps);
    expect(JSON.parse(result.output).data).toMatchObject({ running: false, started_at: null, pid: null });
  });
});

describe("av api stop", () => {
  it("terminates a confirmed daemon and clears the record", async () => {
    const home = mk();
    writeDaemonRecord(home, record());
    const w = fake();
    const result = await runApiStop(opts(home), w.deps);
    expect(result).toMatchObject({ exitCode: EXIT.ok });
    expect(result.output).toBe("api stopped — pid 4242");
    expect(w.signals).toEqual(["4242:SIGTERM"]);
    expect(readDaemonRecord(home)).toBeNull();
  });

  it("cleans a stale record and says so, without signalling", async () => {
    const home = mk();
    writeDaemonRecord(home, record());
    const w = fake();
    w.living.delete(4242);
    expect((await runApiStop(opts(home), w.deps)).output).toMatch(/removed a stale record for pid 4242/);
    expect(w.signals).toEqual([]);
  });

  it("exits non-zero when it refuses — the daemon is still there", async () => {
    const home = mk();
    writeDaemonRecord(home, record());
    const result = await runApiStop(opts(home), fake(null).deps);
    expect(result.exitCode).toBe(EXIT.failed);
    expect(result.output).toMatch(/Refusing to signal it/);
  });
});

describe("the foreground daemon", () => {
  it("publishes a record only once it is listening, and removes it on the way out", async () => {
    const home = mk();
    const stop = new AbortController();
    const run = runApiForeground({ home, cwd: home, bind: "127.0.0.1", port: 0, token: null, json: true, version: "1.3.0", stop: stop.signal });

    // Poll rather than sleep: the record appears after the bind, and how long
    // that takes is the machine's business.
    let published: DaemonRecord | null = null;
    for (let attempt = 0; attempt < 100 && published === null; attempt += 1) {
      published = readDaemonRecord(home);
      if (published === null) await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(published).toMatchObject({ pid: process.pid, bind: "127.0.0.1" });
    expect(published!.port).toBeGreaterThan(0);

    // It really is listening, not merely recorded.
    const health = await fetch(`http://127.0.0.1:${published!.port}/health`);
    expect((await health.json() as { data: { pid: number } }).data.pid).toBe(process.pid);

    stop.abort();
    await run;
    expect(readDaemonRecord(home)).toBeNull();
  });

  it("records that it started and stopped, so a daemon left running is visible later", async () => {
    const home = mk();
    const stop = new AbortController();
    const run = runApiForeground({ home, cwd: home, bind: "127.0.0.1", port: 0, token: null, json: true, version: "1.3.0", stop: stop.signal });
    stop.abort();
    await run;
    expect(readActivity(home, {}).map((event) => event.kind)).toEqual(["api.stopped", "api.started"]);
  });
});
