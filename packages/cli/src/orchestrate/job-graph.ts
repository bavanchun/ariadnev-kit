// Reading a job graph, and refusing the ones that cannot be run.
//
// Pure: parse, validate, order. No filesystem, no processes. Everything that can
// be wrong with a graph is decided here, before a single child is spawned —
// which is the point. A cycle discovered halfway through a run means some jobs
// already ran and the rest never will, and unwinding that is the supervisor's
// problem rather than the parser's.
//
// PLATFORM. Upstream restricts `orchestrate` to Darwin and returns an
// unsupported error everywhere else. ariadnev does not, and that is open
// question 3 answered: the supervisor here is phase 10's `spawn-stream.ts`,
// which is plain Node/Bun process handling with no platform-specific mechanism
// in it. Copying the restriction would import an implementation limit as though
// it were a contract, and — the deciding argument, from the question itself —
// it would mean CI could never exercise this code, because the runners are
// Linux. Cross-platform is the option that gets tested on every push.

import { UsageError } from "../cli/exit-codes.js";

const JOB_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export interface Job {
  readonly id: string;
  readonly command: string;
  readonly args: readonly string[];
  /** Job ids that must finish successfully first. */
  readonly needs: readonly string[];
  readonly cwd?: string;
  /** Milliseconds. Zero means no timeout, matching dispatch's own spelling. */
  readonly timeoutMs: number;
}

export interface JobGraph {
  readonly jobs: readonly Job[];
}

interface RawJob {
  id?: unknown;
  command?: unknown;
  args?: unknown;
  needs?: unknown;
  cwd?: unknown;
  timeoutMs?: unknown;
}

function strings(value: unknown, field: string, id: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new UsageError(`job ${JSON.stringify(id)}: ${field} must be an array of strings`);
  }
  return value as string[];
}

/**
 * Parse and validate a graph.
 *
 * Every failure names the job it is about. A graph file is hand-written, and
 * "invalid job graph" without a job id means reading the whole file to find the
 * typo.
 */
export function parseJobGraph(raw: string): JobGraph {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new UsageError(`job graph is not valid JSON: ${(error as Error).message}`);
  }
  const rawJobs = (parsed as { jobs?: unknown })?.jobs;
  if (!Array.isArray(rawJobs)) throw new UsageError(`job graph must have a "jobs" array`);
  if (rawJobs.length === 0) throw new UsageError("job graph has no jobs");

  const jobs: Job[] = rawJobs.map((entry: RawJob, index) => {
    const id = typeof entry?.id === "string" ? entry.id : "";
    if (!JOB_ID.test(id)) throw new UsageError(`job at index ${index} has no usable id (got ${JSON.stringify(entry?.id)})`);
    if (typeof entry.command !== "string" || entry.command === "") {
      throw new UsageError(`job ${JSON.stringify(id)}: command must be a non-empty string`);
    }
    const timeoutMs = entry.timeoutMs === undefined ? 0 : Number(entry.timeoutMs);
    if (!Number.isInteger(timeoutMs) || timeoutMs < 0) {
      throw new UsageError(`job ${JSON.stringify(id)}: timeoutMs must be a non-negative integer`);
    }
    return {
      id,
      command: entry.command,
      args: strings(entry.args, "args", id),
      needs: strings(entry.needs, "needs", id),
      ...(typeof entry.cwd === "string" ? { cwd: entry.cwd } : {}),
      timeoutMs,
    };
  });

  const ids = new Set<string>();
  for (const job of jobs) {
    if (ids.has(job.id)) throw new UsageError(`job graph has two jobs with the id ${JSON.stringify(job.id)}`);
    ids.add(job.id);
  }
  for (const job of jobs) {
    for (const need of job.needs) {
      if (!ids.has(need)) throw new UsageError(`job ${JSON.stringify(job.id)} needs ${JSON.stringify(need)}, which is not in the graph`);
    }
  }
  return { jobs };
}

/**
 * Jobs in an order where every dependency precedes its dependents.
 *
 * Kahn's algorithm, with ids broken alphabetically so two runs of the same graph
 * schedule identically — a supervisor whose order varies makes an intermittent
 * failure impossible to reproduce.
 *
 * Throws on a cycle, naming the jobs still stuck. "Cycle detected" alone means
 * reading the whole file; the remaining ids are the cycle.
 */
export function topologicalOrder(graph: JobGraph): Job[] {
  const remaining = new Map(graph.jobs.map((job) => [job.id, new Set(job.needs)]));
  const byId = new Map(graph.jobs.map((job) => [job.id, job]));
  const ordered: Job[] = [];

  while (remaining.size > 0) {
    const ready = [...remaining.entries()]
      .filter(([, needs]) => needs.size === 0)
      .map(([id]) => id)
      .sort();
    if (ready.length === 0) {
      throw new UsageError(
        `job graph has a cycle: ${[...remaining.keys()].sort().join(", ")} can never run because each waits on another`,
      );
    }
    for (const id of ready) {
      ordered.push(byId.get(id) as Job);
      remaining.delete(id);
    }
    for (const needs of remaining.values()) {
      for (const id of ready) needs.delete(id);
    }
  }
  return ordered;
}

/** The jobs whose dependencies are all satisfied and which have not run. */
export function readyJobs(graph: JobGraph, done: ReadonlySet<string>, started: ReadonlySet<string>): Job[] {
  return graph.jobs
    .filter((job) => !started.has(job.id) && job.needs.every((need) => done.has(need)))
    .sort((a, b) => a.id.localeCompare(b.id));
}
