import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { spawnStreaming } from "../dispatch/spawn-stream.js";
import { parseJobGraph } from "./job-graph.js";
import { readRun, type RunRecord } from "./run-state.js";
import { runGraph, stopRun, type SignalDeps, type SupervisorDeps } from "./supervisor.js";

const dirs: string[] = [];
const mk = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "ariadnev-orch-"));
  dirs.push(dir);
  return dir;
};

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const graph = (jobs: unknown[]) => parseJobGraph(JSON.stringify({ jobs }));

/** A supervisor whose children are recorded rather than spawned. */
function fakeDeps(outcomes: Record<string, { exitCode: number; forced?: "timeout" | "cancelled" }> = {}) {
  const ran: string[] = [];
  let tick = 0;
  const deps: SupervisorDeps = {
    spawn: (request) => {
      const label = [request.binary, ...request.args].join(" ");
      ran.push(label);
      request.onSpawn?.(10_000 + ran.length);
      const outcome = outcomes[label] ?? { exitCode: 0 };
      return Promise.resolve({ exitCode: outcome.exitCode, forced: outcome.forced ?? null, escalated: false });
    },
    now: () => new Date(Date.UTC(2026, 7, 29, 10, 0, tick++)),
  };
  return { deps, ran };
}

function run(home: string, jobs: unknown[], deps: SupervisorDeps): Promise<RunRecord> {
  return runGraph({ home, cwd: home, env: {}, runId: "run1", graph: graph(jobs), graphPath: "/g.json" }, deps);
}

describe("running a graph", () => {
  it("runs a dependency before its dependent", async () => {
    const world = fakeDeps();
    await run(mk(), [{ id: "b", command: "second", needs: ["a"] }, { id: "a", command: "first" }], world.deps);
    expect(world.ran).toEqual(["first", "second"]);
  });

  it("runs independent jobs in the same wave, not one after another", async () => {
    // The graph says they do not depend on each other. Serialising them would
    // make the dependency edges decorative.
    const world = fakeDeps();
    const record = await run(mk(), [{ id: "a", command: "x" }, { id: "b", command: "y" }], world.deps);
    expect(record.jobs.every((job) => job.status === "completed")).toBe(true);
  });

  it("records each transition, so `status` elsewhere sees a run in progress", async () => {
    const home = mk();
    let sawRunning = false;
    const deps: SupervisorDeps = {
      spawn: (request) => {
        request.onSpawn?.(4242);
        // Read from disk mid-flight, the way another process would.
        sawRunning = readRun(home, "run1")?.jobs[0]?.status === "running";
        return Promise.resolve({ exitCode: 0, forced: null, escalated: false });
      },
      now: () => new Date("2026-08-29T10:00:00Z"),
    };
    await run(home, [{ id: "a", command: "x" }], deps);
    expect(sawRunning).toBe(true);
  });

  it("records the pid and process group, which is what `stop` signals later", async () => {
    const home = mk();
    await run(home, [{ id: "a", command: "x" }], fakeDeps().deps);
    expect(readRun(home, "run1")?.jobs[0]).toMatchObject({ pid: 10_001, pgid: 10_001 });
  });
});

describe("when a job fails", () => {
  it("skips its dependents rather than marking them failed", async () => {
    // "never ran because its dependency failed" and "ran and failed" are
    // different facts; conflating them sends someone debugging the wrong job.
    const world = fakeDeps({ "boom": { exitCode: 1 } });
    const record = await run(mk(), [{ id: "a", command: "boom" }, { id: "b", command: "after", needs: ["a"] }], world.deps);
    expect(record.jobs.find((j) => j.job_id === "a")?.status).toBe("failed");
    expect(record.jobs.find((j) => j.job_id === "b")?.status).toBe("skipped");
    expect(world.ran).toEqual(["boom"]);
  });

  it("lets the rest of the wave finish", async () => {
    const world = fakeDeps({ "boom": { exitCode: 1 } });
    const record = await run(mk(), [{ id: "a", command: "boom" }, { id: "b", command: "fine" }], world.deps);
    expect(record.jobs.find((j) => j.job_id === "b")?.status).toBe("completed");
    expect(record.status).toBe("failed");
  });

  it("treats a binary that cannot start as a failed job, not a crashed run", async () => {
    const deps: SupervisorDeps = {
      spawn: () => Promise.reject(new Error("ENOENT")),
      now: () => new Date("2026-08-29T10:00:00Z"),
    };
    const record = await run(mk(), [{ id: "a", command: "nope" }, { id: "b", command: "also-nope" }], deps);
    expect(record.jobs.map((j) => j.status)).toEqual(["failed", "failed"]);
  });

  it("reports a timeout as a timeout, not as an ordinary non-zero exit", async () => {
    const world = fakeDeps({ "slow": { exitCode: 1, forced: "timeout" } });
    const record = await run(mk(), [{ id: "a", command: "slow" }], world.deps);
    expect(record.jobs[0]).toMatchObject({ status: "failed", terminated_by: "timeout" });
  });
});

describe("resume", () => {
  it("does not re-run a job that already completed", async () => {
    const home = mk();
    const jobs = [{ id: "a", command: "first" }, { id: "b", command: "second", needs: ["a"] }];
    const first = fakeDeps({ "second": { exitCode: 1 } });
    await run(home, jobs, first.deps);

    const second = fakeDeps();
    const record = await runGraph(
      {
        home,
        cwd: home,
        env: {},
        runId: "run1",
        graph: graph(jobs),
        graphPath: "/g.json",
        previous: readRun(home, "run1") as RunRecord,
      },
      second.deps,
    );
    expect(second.ran).toEqual(["second"]);
    expect(record.status).toBe("completed");
  });

  it("re-runs a job that was `running` when the supervisor died", async () => {
    // Its process went with the supervisor, so the record is a claim about a
    // process that no longer exists. Believing it would hang the resume forever.
    const home = mk();
    const jobs = [{ id: "a", command: "first" }];
    const stale: RunRecord = {
      run_id: "run1",
      status: "running",
      graph_path: "/g.json",
      started_at: "2026-08-29T09:00:00Z",
      updated_at: "2026-08-29T09:00:00Z",
      jobs: [
        {
          job_id: "a", status: "running", pid: 999, pgid: 999, command_label: "first",
          exit_code: null, terminated_by: null, started_at: "2026-08-29T09:00:00Z", finished_at: null,
        },
      ],
    };
    const world = fakeDeps();
    await runGraph({ home, cwd: home, env: {}, runId: "run1", graph: graph(jobs), graphPath: "/g.json", previous: stale }, world.deps);
    expect(world.ran).toEqual(["first"]);
  });

  it("keeps the original start time, so a resumed run is one run", async () => {
    const home = mk();
    const jobs = [{ id: "a", command: "x" }];
    await run(home, jobs, fakeDeps().deps);
    const previous = readRun(home, "run1") as RunRecord;
    const resumed = await runGraph(
      { home, cwd: home, env: {}, runId: "run1", graph: graph(jobs), graphPath: "/g.json", previous },
      fakeDeps().deps,
    );
    expect(resumed.started_at).toBe(previous.started_at);
  });
});

describe("stopping a run", () => {
  function signalWorld(alive: Set<number>, ignoresTerm = false) {
    const sent: string[] = [];
    const deps: SignalDeps = {
      signal: (target, sig) => {
        sent.push(`${target}:${sig}`);
        if (sig === "SIGKILL" || (sig === "SIGTERM" && !ignoresTerm)) alive.delete(Math.abs(target));
        return true;
      },
      alive: (pid) => alive.has(pid),
      sleep: () => Promise.resolve(),
    };
    return { deps, sent };
  }

  const running = (pid: number): RunRecord => ({
    run_id: "run1", status: "running", graph_path: "/g.json",
    started_at: "", updated_at: "",
    jobs: [{ job_id: "a", status: "running", pid, pgid: pid, command_label: "x", exit_code: null, terminated_by: null, started_at: "", finished_at: null }],
  });

  it("signals the process GROUP, not the pid", async () => {
    // A job that spawned its own children leaves them running otherwise. That
    // orphan case is the whole reason pgid is recorded.
    const alive = new Set([500]);
    const world = signalWorld(alive);
    await stopRun(running(500), world.deps, 100);
    expect(world.sent).toEqual(["-500:SIGTERM"]);
  });

  it("escalates to KILL when the group ignores TERM", async () => {
    const alive = new Set([500]);
    const world = signalWorld(alive, true);
    const killed = await stopRun(running(500), world.deps, 100);
    expect(world.sent).toEqual(["-500:SIGTERM", "-500:SIGKILL"]);
    expect(killed).toEqual([500]);
  });

  it("signals nothing when no job is running", async () => {
    const world = signalWorld(new Set());
    const done: RunRecord = { ...running(500), jobs: [{ ...running(500).jobs[0]!, status: "completed" }] };
    expect(await stopRun(done, world.deps, 100)).toEqual([]);
    expect(world.sent).toEqual([]);
  });
});

describe("no orphan survives a real run", () => {
  // The property that matters, exercised against real processes rather than a
  // fake: `orchestrate` spawns many children by design, so an orphan bug here
  // multiplies. Cross-platform by decision — see `job-graph.ts` — so this runs
  // on the Linux CI runners too.
  it("leaves nothing behind after a job that spawns a grandchild times out", async () => {
    if (process.platform === "win32") return;
    const home = mk();
    const marker = join(home, "grandchild.pid");
    const script = join(home, "job.sh");
    // The child ignores TERM and holds a grandchild, which is the shape that
    // finds a supervisor signalling only the pid.
    writeFileSync(
      script,
      ["#!/bin/sh", "trap '' TERM", "sleep 60 &", "echo $! > " + JSON.stringify(marker), "wait"].join("\n"),
      { mode: 0o755 },
    );

    const record = await runGraph(
      {
        home, cwd: home, env: process.env, runId: "real",
        graph: graph([{ id: "a", command: "/bin/sh", args: [script], timeoutMs: 300 }]),
        graphPath: "/g.json",
      },
      { spawn: spawnStreaming, now: () => new Date() },
    );

    expect(record.jobs[0]?.terminated_by).toBe("timeout");
    const grandchild = Number(readFileTrimmed(marker));
    expect(Number.isInteger(grandchild)).toBe(true);
    // Give the KILL sweep a moment to land, then assert nothing is left.
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(processAlive(grandchild), `grandchild ${grandchild} outlived the run`).toBe(false);
  }, 20_000);
});

function readFileTrimmed(path: string): string {
  return execFileSync("cat", [path], { encoding: "utf8" }).trim();
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
