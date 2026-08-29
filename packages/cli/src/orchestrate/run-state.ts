// What a run leaves on disk, so `status`, `resume` and `stop` can work from a
// different process than the one that started it.
//
// WRITTEN AFTER EVERY TRANSITION, NOT AT THE END. A supervisor that records its
// result on completion has nothing to say about the run that killed it, which is
// exactly the run someone needs to resume. Each transition is an atomic
// whole-file write; there is one writer per run, so last-write-wins is not the
// hazard here that it is for `watch`.
//
// `pid` and `pgid` are recorded per job because they are what `stop` signals
// from another process. The group id is the one that matters: a job that spawns
// its own children leaves them behind if only its own pid is signalled.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { atomicWritePrivate } from "../install/fs-atomic.js";
import { ensureOperationalDirectory, operationalPath } from "../storage/operational-paths.js";

export type JobStatus = "pending" | "running" | "completed" | "failed" | "cancelled" | "skipped";
export type RunStatus = "running" | "completed" | "failed" | "cancelled";

export interface JobRecord {
  readonly job_id: string;
  readonly status: JobStatus;
  readonly pid: number | null;
  /** The process group. What `stop` signals, so grandchildren go too. */
  readonly pgid: number | null;
  readonly command_label: string;
  readonly exit_code: number | null;
  readonly terminated_by: "exit" | "timeout" | "cancelled" | null;
  readonly started_at: string | null;
  readonly finished_at: string | null;
}

export interface RunRecord {
  readonly run_id: string;
  readonly status: RunStatus;
  readonly graph_path: string;
  readonly started_at: string;
  readonly updated_at: string;
  readonly jobs: readonly JobRecord[];
}

export function orchestrateRoot(home: string): string {
  return operationalPath(home, "orchestrate");
}

export function runPath(home: string, runId: string): string {
  return join(orchestrateRoot(home), `${runId}.json`);
}

export function writeRun(home: string, record: RunRecord): void {
  ensureOperationalDirectory(home, orchestrateRoot(home));
  atomicWritePrivate(runPath(home, record.run_id), `${JSON.stringify(record, null, 2)}\n`);
}

export function readRun(home: string, runId: string): RunRecord | null {
  try {
    return JSON.parse(readFileSync(runPath(home, runId), "utf8")) as RunRecord;
  } catch {
    return null;
  }
}

/** Every run this home knows about, newest first. */
export function listRuns(home: string): RunRecord[] {
  let names: string[];
  try {
    names = readdirSync(orchestrateRoot(home));
  } catch {
    return [];
  }
  return names
    .filter((name) => name.endsWith(".json"))
    .map((name) => readRun(home, name.slice(0, -5)))
    .filter((run): run is RunRecord => run !== null)
    .sort((a, b) => b.started_at.localeCompare(a.started_at));
}

/** Replace one job's record, leaving the rest of the run untouched. */
export function withJob(record: RunRecord, jobId: string, patch: Partial<JobRecord>, now: string): RunRecord {
  return {
    ...record,
    updated_at: now,
    jobs: record.jobs.map((job) => (job.job_id === jobId ? { ...job, ...patch } : job)),
  };
}

/**
 * The run's status, derived from its jobs rather than tracked separately.
 *
 * Two facts that could disagree are worse than one that has to be recomputed:
 * a run marked `completed` holding a failed job is a report nobody can act on.
 */
export function deriveRunStatus(jobs: readonly JobRecord[]): RunStatus {
  if (jobs.some((job) => job.status === "running" || job.status === "pending")) return "running";
  if (jobs.some((job) => job.status === "cancelled")) return "cancelled";
  if (jobs.some((job) => job.status === "failed")) return "failed";
  return "completed";
}
