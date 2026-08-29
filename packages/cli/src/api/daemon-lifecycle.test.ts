import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  awaitDaemon,
  daemonSpawnPlan,
  inspectDaemon,
  selfInvocation,
  stopDaemon,
  type HealthReport,
  type LifecycleDeps,
} from "./daemon-lifecycle.js";
import { clearDaemonRecord, readDaemonRecord, writeDaemonRecord, type DaemonRecord } from "./daemon-state.js";

const dirs: string[] = [];
const mk = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "ariadnev-api-life-"));
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

interface FakeWorld {
  readonly deps: LifecycleDeps;
  readonly signals: { pid: number; sig: string }[];
  /** Pids that answer `kill(pid, 0)`. Mutated by tests and by SIGKILL. */
  readonly living: Set<number>;
  health: HealthReport | null;
  /** Pids that die once TERM reaches them, modelling a well-behaved daemon. */
  readonly obedient: Set<number>;
}

function world(over: Partial<Pick<FakeWorld, "health">> = {}): FakeWorld {
  const living = new Set<number>([4242]);
  const obedient = new Set<number>([4242]);
  const signals: { pid: number; sig: string }[] = [];
  let clock = 0;
  const self: FakeWorld = {
    living,
    obedient,
    signals,
    health: over.health === undefined ? { pid: 4242, version: "1.3.0", startedAt: "" } : over.health,
    deps: {
      probeHealth: () => Promise.resolve(self.health),
      // Time is advanced by sleeping rather than by waiting, so a five-second
      // grace period costs a test nothing and cannot flake on a loaded machine.
      sleep: (ms) => {
        clock += ms;
        return Promise.resolve();
      },
      signal: (pid, sig) => {
        signals.push({ pid, sig });
        if (sig === "SIGKILL" || (sig === "SIGTERM" && obedient.has(pid))) living.delete(pid);
        return true;
      },
      alive: (pid) => living.has(pid),
      now: () => clock,
    },
  };
  return self;
}

describe("inspecting the daemon", () => {
  it("reports stopped when nothing was ever recorded", async () => {
    expect((await inspectDaemon(mk(), world().deps)).state).toBe("stopped");
  });

  it("reports stopped when the recorded process is gone", async () => {
    const home = mk();
    writeDaemonRecord(home, record());
    const w = world();
    w.living.delete(4242);
    expect((await inspectDaemon(home, w.deps)).state).toBe("stopped");
  });

  it("reports running only when the port identifies the recorded pid", async () => {
    const home = mk();
    writeDaemonRecord(home, record());
    expect((await inspectDaemon(home, world().deps)).state).toBe("running");
  });

  it("refuses to call a live pid ours when nothing answers the port", async () => {
    // The recycled-pid case. Something is alive under 4242; that alone must
    // never be enough to earn a signal.
    const home = mk();
    writeDaemonRecord(home, record());
    const inspection = await inspectDaemon(home, world({ health: null }).deps);
    expect(inspection.state).toBe("unconfirmed");
    expect(inspection.reason).toMatch(/alive but nothing on port 8767 identified itself/);
  });

  it("refuses when the port answers with a different pid", async () => {
    const home = mk();
    writeDaemonRecord(home, record());
    const w = world({ health: { pid: 9999, version: "x", startedAt: "" } });
    const inspection = await inspectDaemon(home, w.deps);
    expect(inspection.state).toBe("unconfirmed");
    expect(inspection.reason).toMatch(/held by pid 9999/);
  });
});

describe("stopping the daemon", () => {
  it("terminates a confirmed daemon and removes its record", async () => {
    const home = mk();
    writeDaemonRecord(home, record());
    const w = world();
    const outcome = await stopDaemon(home, w.deps);
    expect(outcome).toMatchObject({ result: "stopped", escalated: false });
    expect(w.signals).toEqual([{ pid: 4242, sig: "SIGTERM" }]);
    expect(readDaemonRecord(home)).toBeNull();
  });

  it("escalates to KILL when the daemon ignores TERM", async () => {
    const home = mk();
    writeDaemonRecord(home, record());
    const w = world();
    w.obedient.delete(4242);
    const outcome = await stopDaemon(home, w.deps);
    expect(outcome).toMatchObject({ result: "stopped", escalated: true });
    expect(w.signals.map((s) => s.sig)).toEqual(["SIGTERM", "SIGKILL"]);
    expect(w.living.has(4242)).toBe(false);
  });

  it("cleans a stale record without signalling anything", async () => {
    // The pid is dead. Signalling it would mean signalling whoever inherits the
    // number next, which is the whole reason identity is checked first.
    const home = mk();
    writeDaemonRecord(home, record());
    const w = world();
    w.living.delete(4242);
    const outcome = await stopDaemon(home, w.deps);
    expect(outcome).toMatchObject({ result: "cleaned" });
    expect(w.signals).toEqual([]);
    expect(readDaemonRecord(home)).toBeNull();
  });

  it("refuses, and signals nothing, when identity cannot be confirmed", async () => {
    const home = mk();
    writeDaemonRecord(home, record());
    const w = world({ health: null });
    const outcome = await stopDaemon(home, w.deps);
    expect(outcome.result).toBe("refused");
    expect(w.signals).toEqual([]);
    // The record survives: removing it would silently discard the only evidence
    // the user needs to decide what that process is.
    expect(readDaemonRecord(home)).not.toBeNull();
    expect(outcome.result === "refused" && outcome.reason).toMatch(/api\.pid/);
  });

  it("says so plainly when there is nothing to stop", async () => {
    const home = mk();
    clearDaemonRecord(home);
    expect((await stopDaemon(home, world().deps)).result).toBe("not-running");
  });
});

describe("waiting for a daemon to come up", () => {
  it("returns the record once the child publishes one and answers", async () => {
    const home = mk();
    writeDaemonRecord(home, record());
    expect(await awaitDaemon(home, 4242, world().deps, null)).toMatchObject({ pid: 4242 });
  });

  it("gives up immediately when the child died before binding", async () => {
    // EADDRINUSE is the ordinary cause. Waiting the full ten seconds for a
    // process that has already exited helps nobody.
    const home = mk();
    const w = world();
    w.living.delete(4242);
    expect(await awaitDaemon(home, 4242, w.deps, null)).toBeNull();
  });

  it("does not accept a record left behind by some other daemon", async () => {
    const home = mk();
    writeDaemonRecord(home, record({ pid: 111 }));
    const w = world();
    w.living.add(4242);
    expect(await awaitDaemon(home, 4242, w.deps, null, 500)).toBeNull();
  });
});

describe("what the spawned daemon inherits", () => {
  const plan = (token: string | null) =>
    daemonSpawnPlan({
      home: "/h", cwd: "/c", bind: "127.0.0.1", port: 8767,
      env: { PATH: "/bin" }, execPath: "/bin/av", argv: ["/bin/av"], token,
    });

  it("forwards the token through the environment, and never on argv", () => {
    // THE REGRESSION THIS PINS. The first version passed neither, so
    // `av api start --auth-token secret` produced a daemon serving every route
    // unauthenticated: the parent validated a token the child never received.
    // Putting it on argv would have fixed that by publishing the token to every
    // process listing on the machine, so both halves are asserted.
    const spawned = plan("s3cret");
    expect(spawned.env.ARIADNEV_API_TOKEN).toBe("s3cret");
    expect(spawned.args.join(" ")).not.toContain("s3cret");
  });

  it("leaves the environment alone when there is no token", () => {
    expect(plan(null).env).toEqual({ PATH: "/bin" });
  });

  it("runs the daemon in the foreground, on the bind and port that were asked for", () => {
    // Without `--foreground` the child detaches again and nothing ever listens.
    expect(plan(null).args).toEqual([
      "--home", "/h", "--cwd", "/c", "api", "start", "--foreground", "--bind", "127.0.0.1", "--port", "8767",
    ]);
  });
});

describe("when the daemon wants a token the caller does not have", () => {
  it("says so, instead of reporting an unidentified process", async () => {
    // `stop` from a shell with no token gets a 401 on its identity probe, so it
    // correctly refuses — but "nothing identified itself" sends the user hunting
    // for a stray process rather than for their own token.
    const home = mk();
    writeDaemonRecord(home, record({ tokenRequired: true }));
    const inspection = await inspectDaemon(home, world({ health: null }).deps, null);
    expect(inspection.state).toBe("unconfirmed");
    expect(inspection.reason).toMatch(/requires an auth token.*ARIADNEV_API_TOKEN/s);
  });

  it("keeps the generic message when a token was supplied and still did not fit", async () => {
    const home = mk();
    writeDaemonRecord(home, record({ tokenRequired: true }));
    const inspection = await inspectDaemon(home, world({ health: null }).deps, "wrong");
    expect(inspection.reason).toMatch(/nothing on port 8767 identified itself/);
  });
});

describe("working out how to re-run this binary", () => {
  it("passes the script through when running under a runtime", () => {
    // Getting this wrong spawns a bare `bun` that never listens, and `start`
    // then times out with nothing to show for it.
    expect(selfInvocation("/usr/local/bin/bun", ["bun", "/repo/src/index.ts", "api"])).toEqual({
      command: "/usr/local/bin/bun",
      prefix: ["/repo/src/index.ts"],
    });
    expect(selfInvocation("/usr/bin/node", ["node", "/repo/dist/index.js"])).toEqual({
      command: "/usr/bin/node",
      prefix: ["/repo/dist/index.js"],
    });
  });

  it("passes nothing through for a compiled binary — there is no script", () => {
    expect(selfInvocation("/usr/local/bin/av", ["/usr/local/bin/av", "api"])).toEqual({
      command: "/usr/local/bin/av",
      prefix: [],
    });
  });
});
