// Running a job graph, and making sure nothing survives it.
//
// THE CHILD LIFECYCLE IS PHASE 10'S `spawn-stream.ts`, NOT A SECOND COPY. That
// module already puts each child in its own process group, forwards SIGINT to
// the group, escalates a timeout from TERM to KILL after a grace period, and
// sweeps the group again once the child is reaped. `orchestrate` spawns many
// children by design, so it is the command with the most to lose from an orphan
// bug — and fixing that bug in two places is how one of them stays broken.
//
// WHAT IS NEW HERE is that a run outlives the process that started it. `stop`
// and `status` run later, from a different process, and can only work from what
// was written to disk: hence the recorded pid and **process group** per job. The
// group is the one that matters — a job that spawns its own children leaves them
// behind if only its own pid is signalled.
//
// A FAILED JOB SKIPS ITS DEPENDENTS RATHER THAN FAILING THEM. "This never ran
// because its dependency failed" and "this ran and failed" are different facts,
// and a status that conflates them sends someone debugging the wrong job.

import { spawnStreaming, type SpawnOutcome, type SpawnRequest } from "../dispatch/spawn-stream.js";
import { readyJobs, topologicalOrder, type Job, type JobGraph } from "./job-graph.js";
import {
  deriveRunStatus,
  writeRun,
  type JobRecord,
  type JobStatus,
  type RunRecord,
} from "./run-state.js";

export type SpawnFn = (request: SpawnRequest) => Promise<SpawnOutcome>;

export interface SupervisorDeps {
  readonly spawn: SpawnFn;
  readonly now: () => Date;
}

export function realSupervisorDeps(): SupervisorDeps {
  return { spawn: spawnStreaming, now: () => new Date() };
}

export interface RunOptions {
  readonly home: string;
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
  readonly runId: string;
  readonly graph: JobGraph;
  readonly graphPath: string;
  /** Existing records, when resuming. Completed jobs are not run again. */
  readonly previous?: RunRecord;
  readonly signal?: AbortSignal;
}

function pending(job: Job): JobRecord {
  return {
    job_id: job.id,
    status: "pending",
    pid: null,
    pgid: null,
    command_label: job.command,
    exit_code: null,
    terminated_by: null,
    started_at: null,
    finished_at: null,
  };
}

/**
 * Run every job whose dependencies are satisfied, in waves.
 *
 * Jobs in one wave run concurrently — the graph says they do not depend on each
 * other, and serialising them would make the dependency edges decorative. The
 * run record is written after every transition, so a `status` from another
 * process sees a wave in progress rather than nothing until the end.
 */
export async function runGraph(opts: RunOptions, deps: SupervisorDeps): Promise<RunRecord> {
  // Ordering is validated before anything spawns: a cycle found halfway through
  // would leave some jobs run and the rest unrunnable.
  topologicalOrder(opts.graph);

  const startedAt = opts.previous?.started_at ?? deps.now().toISOString();
  const carried = new Map((opts.previous?.jobs ?? []).map((job) => [job.job_id, job]));
  let record: RunRecord = {
    run_id: opts.runId,
    status: "running",
    graph_path: opts.graphPath,
    started_at: startedAt,
    updated_at: deps.now().toISOString(),
    jobs: opts.graph.jobs.map((job) => {
      const before = carried.get(job.id);
      // Only a completed job is carried forward. Anything that was `running`
      // when the supervisor died is not running now — its process went with it —
      // so it is re-run rather than believed.
      return before?.status === "completed" ? before : pending(job);
    }),
  };
  writeRun(opts.home, record);

  const done = new Set(record.jobs.filter((job) => job.status === "completed").map((job) => job.job_id));
  const finished = new Set(done);

  for (;;) {
    const wave = readyJobs(opts.graph, done, finished);
    if (wave.length === 0) break;

    const results = await Promise.all(
      wave.map(async (job) => {
        const started = deps.now().toISOString();
        let pid: number | null = null;
        record = patch(record, job.id, { status: "running", started_at: started }, deps.now().toISOString());
        writeRun(opts.home, record);

        let outcome: SpawnOutcome;
        try {
          outcome = await deps.spawn({
            binary: job.command,
            args: job.args,
            cwd: job.cwd ?? opts.cwd,
            env: opts.env,
            timeoutMs: job.timeoutMs,
            onStdout: () => undefined,
            onStderr: () => undefined,
            // Recorded the moment it exists, because `stop` runs elsewhere.
            // The child is its own group leader, so pid and pgid are the same
            // number — recorded separately anyway, since that is a property of
            // `spawn-stream`'s `detached: true` rather than a law.
            onSpawn: (spawned) => {
              pid = spawned;
              record = patch(record, job.id, { pid: spawned, pgid: spawned }, deps.now().toISOString());
              writeRun(opts.home, record);
            },
            ...(opts.signal ? { signal: opts.signal } : {}),
          });
        } catch (error) {
          // The binary could not be started at all. A failure, not a crash of
          // the run: the other jobs in the wave still deserve to finish.
          return { job, status: "failed" as const, exitCode: null, terminatedBy: "exit" as const, pid, error };
        }
        const status: JobStatus = outcome.forced === "cancelled" ? "cancelled" : outcome.exitCode === 0 ? "completed" : "failed";
        const terminatedBy: JobRecord["terminated_by"] =
          outcome.forced === "timeout" ? "timeout" : outcome.forced === "cancelled" ? "cancelled" : "exit";
        return { job, status, exitCode: outcome.exitCode, terminatedBy, pid, error: undefined };
      }),
    );

    for (const result of results) {
      finished.add(result.job.id);
      if (result.status === "completed") done.add(result.job.id);
      record = patch(
        record,
        result.job.id,
        {
          status: result.status,
          exit_code: result.exitCode,
          terminated_by: result.terminatedBy,
          finished_at: deps.now().toISOString(),
        },
        deps.now().toISOString(),
      );
    }
    writeRun(opts.home, record);
  }

  // Anything still pending is blocked behind something that did not complete.
  record = {
    ...record,
    jobs: record.jobs.map((job) => (job.status === "pending" ? { ...job, status: "skipped" as const } : job)),
  };
  record = { ...record, status: deriveRunStatus(record.jobs), updated_at: deps.now().toISOString() };
  writeRun(opts.home, record);
  return record;
}

function patch(record: RunRecord, jobId: string, changes: Partial<JobRecord>, now: string): RunRecord {
  return {
    ...record,
    updated_at: now,
    jobs: record.jobs.map((job) => (job.job_id === jobId ? { ...job, ...changes } : job)),
  };
}

export interface SignalDeps {
  signal(target: number, sig: NodeJS.Signals): boolean;
  alive(pid: number): boolean;
  sleep(ms: number): Promise<void>;
}

export function realSignalDeps(): SignalDeps {
  const send = (target: number, sig: NodeJS.Signals | 0): boolean => {
    try {
      process.kill(target, sig);
      return true;
    } catch {
      return false;
    }
  };
  return {
    signal: (target, sig) => send(target, sig),
    alive: (pid) => send(pid, 0),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  };
}

export const STOP_GRACE_MS = 5_000;

/**
 * Terminate a run's live jobs: TERM to each group, then KILL to whatever ignored it.
 *
 * The **group** is signalled, not the pid: a job that spawned its own children
 * leaves them running otherwise, which is the orphan case this whole design is
 * arranged around. `process.kill(-pgid)` is how a group is addressed.
 */
export async function stopRun(record: RunRecord, deps: SignalDeps, graceMs = STOP_GRACE_MS): Promise<number[]> {
  const live = record.jobs.filter((job) => job.status === "running" && job.pgid !== null);
  for (const job of live) deps.signal(-(job.pgid as number), "SIGTERM");
  if (live.length === 0) return [];

  const deadline = graceMs;
  for (let waited = 0; waited < deadline; waited += 50) {
    if (live.every((job) => !deps.alive(job.pid as number))) break;
    await deps.sleep(50);
  }
  const killed: number[] = [];
  for (const job of live) {
    if (job.pid !== null && deps.alive(job.pid)) {
      deps.signal(-(job.pgid as number), "SIGKILL");
      killed.push(job.pid);
    }
  }
  return killed;
}
