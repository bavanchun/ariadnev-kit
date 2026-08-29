// `av orchestrate start | status | resume | stop`.
//
// CROSS-PLATFORM, WHERE UPSTREAM IS DARWIN-ONLY. That is open question 3
// answered, and the reasoning is in `job-graph.ts`: the supervisor is plain
// process handling with no platform-specific mechanism, and matching the
// restriction would mean this code could never be exercised by CI, whose
// runners are Linux. A restriction that also disables its own testing is not
// worth inheriting.

import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { recordActivity } from "../activity/emit.js";
import { parseJobGraph } from "../orchestrate/job-graph.js";
import { listRuns, readRun, writeRun, type RunRecord } from "../orchestrate/run-state.js";
import { realSignalDeps, realSupervisorDeps, runGraph, stopRun, type SignalDeps, type SupervisorDeps } from "../orchestrate/supervisor.js";
import { EXIT, UnavailableError, UsageError } from "./exit-codes.js";
import { jsonEnvelope } from "./json-envelope.js";

export const ORCHESTRATE_SCHEMA_VERSION = 1;

export interface OrchestrateOpts {
  readonly home: string;
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
  readonly graphPath?: string;
  readonly runId?: string;
  readonly json?: boolean;
}

export interface OrchestrateResult {
  readonly output: string;
  readonly exitCode: number;
}

function envelope(kind: string, data: unknown): string {
  return jsonEnvelope(ORCHESTRATE_SCHEMA_VERSION, kind, data);
}

export function newRunId(): string {
  return randomBytes(16).toString("hex");
}

function loadGraph(path: string | undefined) {
  if (!path) throw new UsageError("av orchestrate needs a job graph file: av orchestrate start jobs.json");
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (error) {
    throw new UnavailableError(`cannot read job graph ${path}: ${(error as NodeJS.ErrnoException).code}`);
  }
  return parseJobGraph(raw);
}

/** A run's exit code: a failed or cancelled run is a negative answer, not a crash. */
function exitFor(record: RunRecord): number {
  return record.status === "completed" ? EXIT.ok : EXIT.failed;
}

function render(record: RunRecord): string {
  const lines = [`orchestrate ${record.run_id} — ${record.status}`];
  for (const job of record.jobs) {
    const detail = [
      job.exit_code === null ? "" : `exit ${job.exit_code}`,
      job.terminated_by && job.terminated_by !== "exit" ? job.terminated_by : "",
      job.pid === null ? "" : `pid ${job.pid}`,
    ]
      .filter(Boolean)
      .join(" ");
    lines.push(`  ${job.job_id.padEnd(16)} ${job.status.padEnd(10)} ${detail}`);
  }
  return lines.join("\n");
}

export async function runOrchestrateStart(
  opts: OrchestrateOpts,
  deps: SupervisorDeps = realSupervisorDeps(),
): Promise<OrchestrateResult> {
  const graph = loadGraph(opts.graphPath);
  const runId = opts.runId ?? newRunId();
  recordActivity(opts.home, "orchestrate.started", { status: "ok" });
  const record = await runGraph(
    { home: opts.home, cwd: opts.cwd, env: opts.env, runId, graph, graphPath: opts.graphPath as string },
    deps,
  );
  recordActivity(opts.home, "orchestrate.finished", { status: record.status === "completed" ? "ok" : "failed" });
  return {
    output: opts.json ? envelope("orchestrate.start", record) : render(record),
    exitCode: exitFor(record),
  };
}

export async function runOrchestrateResume(
  opts: OrchestrateOpts,
  deps: SupervisorDeps = realSupervisorDeps(),
): Promise<OrchestrateResult> {
  if (!opts.runId) throw new UsageError("av orchestrate resume needs a run id: av orchestrate resume <run-id> jobs.json");
  const previous = readRun(opts.home, opts.runId);
  if (previous === null) throw new UnavailableError(`no run ${opts.runId} in this home — \`av orchestrate status\` lists what there is`);
  // The graph is re-read rather than remembered: the file is the source, and a
  // resume against a changed graph should run the changed graph.
  const graph = loadGraph(opts.graphPath ?? previous.graph_path);
  const record = await runGraph(
    {
      home: opts.home,
      cwd: opts.cwd,
      env: opts.env,
      runId: opts.runId,
      graph,
      graphPath: opts.graphPath ?? previous.graph_path,
      previous,
    },
    deps,
  );
  return { output: opts.json ? envelope("orchestrate.resume", record) : render(record), exitCode: exitFor(record) };
}

export function runOrchestrateStatus(opts: OrchestrateOpts): OrchestrateResult {
  if (!opts.runId) {
    const runs = listRuns(opts.home).map((run) => ({ run_id: run.run_id, status: run.status, started_at: run.started_at }));
    if (opts.json) return { output: envelope("orchestrate.status", { runs }), exitCode: EXIT.ok };
    if (runs.length === 0) return { output: "orchestrate: no runs recorded", exitCode: EXIT.ok };
    return { output: ["orchestrate:", ...runs.map((r) => `  ${r.run_id}  ${r.status}  ${r.started_at}`)].join("\n"), exitCode: EXIT.ok };
  }
  const record = readRun(opts.home, opts.runId);
  if (record === null) throw new UnavailableError(`no run ${opts.runId} in this home`);
  return { output: opts.json ? envelope("orchestrate.status", record) : render(record), exitCode: EXIT.ok };
}

export async function runOrchestrateStop(
  opts: OrchestrateOpts,
  deps: SignalDeps = realSignalDeps(),
): Promise<OrchestrateResult> {
  if (!opts.runId) throw new UsageError("av orchestrate stop needs a run id: av orchestrate stop <run-id>");
  const record = readRun(opts.home, opts.runId);
  if (record === null) throw new UnavailableError(`no run ${opts.runId} in this home`);

  const killed = await stopRun(record, deps);
  const stopped: RunRecord = {
    ...record,
    status: "cancelled",
    jobs: record.jobs.map((job) =>
      job.status === "running" || job.status === "pending"
        ? { ...job, status: "cancelled" as const, terminated_by: "cancelled" as const }
        : job,
    ),
  };
  writeRun(opts.home, stopped);
  return {
    output: opts.json
      ? envelope("orchestrate.stop", { run_id: record.run_id, killed })
      : killed.length > 0
        ? `orchestrate ${record.run_id}: stopped — ${killed.length} job group(s) ignored SIGTERM and were killed`
        : `orchestrate ${record.run_id}: stopped`,
    exitCode: EXIT.ok,
  };
}
