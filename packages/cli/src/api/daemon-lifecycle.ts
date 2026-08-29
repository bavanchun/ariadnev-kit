// Starting, inspecting and stopping the daemon — the stateful half, and the one
// that can leave a process running on this machine after the command returns.
//
// IDENTITY IS PROVEN, NOT ASSUMED. A pidfile is a claim about the past: the
// process it names may have exited hours ago and had its number handed to
// something unrelated, and signalling that is how a tool kills a stranger's
// work. So `stop` never signals a pid on the strength of the file alone. It
// asks the process listening on the recorded port to identify itself over
// `/health`, and only a matching pid earns a signal.
//
// The consequence is deliberate: a daemon that is alive but wedged — bound, not
// answering — cannot be confirmed, so it is REPORTED AND NOT SIGNALLED. That is
// the phase's own instruction ("if identity cannot be confirmed, report and
// refuse") and the safe direction to fail in. The message names the pidfile so
// the user can decide, which is the one judgement that should not be automated.
//
// STOPPING ESCALATES, BUT ONLY OVER THE PID. TERM first so the daemon can close
// its listener, then KILL if it ignores that. Not the process group: this daemon
// spawns no children, and `kill(-pid)` on a group we did not verify the
// membership of is a wider blast radius bought for nothing.

import { spawn } from "node:child_process";
import { request as httpRequest } from "node:http";
import { basename } from "node:path";
import {
  clearDaemonRecord,
  pidfilePath,
  processAlive,
  readDaemonRecord,
  type DaemonRecord,
} from "./daemon-state.js";
import { TOKEN_ENV, isLoopback } from "./server.js";

/** How long a daemon gets to exit on TERM before it is killed. */
export const STOP_GRACE_MS = 5_000;
/** How long `start` waits for the child to bind and publish its record. */
export const START_TIMEOUT_MS = 10_000;

export type DaemonState =
  /** Listening, and it proved the recorded pid is its own. */
  | "running"
  /** No pidfile, or one describing a process that no longer exists. */
  | "stopped"
  /** A pidfile naming a live process that would not identify itself. */
  | "unconfirmed";

export interface DaemonInspection {
  readonly state: DaemonState;
  readonly record: DaemonRecord | null;
  /** Why the state is `unconfirmed`, for the message the user reads. */
  readonly reason?: string;
}

export interface HealthReport {
  readonly pid: number;
  readonly version: string;
  readonly startedAt: string;
}

export interface LifecycleDeps {
  /** Null when nothing answered, or the answer was not this daemon's shape. */
  probeHealth(record: DaemonRecord, token: string | null): Promise<HealthReport | null>;
  sleep(ms: number): Promise<void>;
  signal(pid: number, sig: NodeJS.Signals): boolean;
  alive(pid: number): boolean;
  now(): number;
}

export function realLifecycleDeps(): LifecycleDeps {
  return {
    probeHealth,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    signal: (pid, sig) => {
      try {
        process.kill(pid, sig);
        return true;
      } catch {
        return false;
      }
    },
    alive: processAlive,
    now: () => Date.now(),
  };
}

/**
 * Ask the recorded port who is listening.
 *
 * A wildcard bind is reached over loopback: `0.0.0.0` is not an address a
 * client connects to, and this probe is always local by definition.
 */
export function probeHealth(record: DaemonRecord, token: string | null): Promise<HealthReport | null> {
  const host = isLoopback(record.bind) ? record.bind : "127.0.0.1";
  return new Promise<HealthReport | null>((resolve) => {
    const req = httpRequest(
      {
        host,
        port: record.port,
        path: "/health",
        method: "GET",
        timeout: 2_000,
        ...(token ? { headers: { authorization: `Bearer ${token}` } } : {}),
      },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk: string) => (body += chunk));
        response.on("end", () => resolve(parseHealth(body)));
      },
    );
    // Every failure mode is the same answer — nothing identified itself — and
    // none of them should crash the command that asked.
    req.on("error", () => resolve(null));
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
    req.end();
  });
}

function parseHealth(body: string): HealthReport | null {
  try {
    const parsed = JSON.parse(body) as { kind?: string; data?: Partial<HealthReport> & { started_at?: string } };
    // The `kind` check is what stops an unrelated web server on this port from
    // being mistaken for the daemon because it happened to return some JSON.
    if (parsed.kind !== "api.health" || typeof parsed.data?.pid !== "number") return null;
    return {
      pid: parsed.data.pid,
      version: parsed.data.version ?? "unknown",
      startedAt: parsed.data.started_at ?? "",
    };
  } catch {
    return null;
  }
}

export async function inspectDaemon(home: string, deps: LifecycleDeps, token: string | null = null): Promise<DaemonInspection> {
  const record = readDaemonRecord(home);
  if (record === null) return { state: "stopped", record: null };
  if (!deps.alive(record.pid)) {
    // A pid that no longer exists cannot be anything but a leftover, and this is
    // the one case safe to decide without asking anyone.
    return { state: "stopped", record };
  }
  const health = await deps.probeHealth(record, token);
  if (health === null) {
    return {
      state: "unconfirmed",
      record,
      reason: record.tokenRequired && token === null
        ? `the daemon on port ${record.port} requires an auth token, and none was given, so it could not be identified. ` +
          `Set ${TOKEN_ENV} or pass --auth-token`
        : `pid ${record.pid} is alive but nothing on port ${record.port} identified itself as ariadnev's daemon`,
    };
  }
  if (health.pid !== record.pid) {
    return {
      state: "unconfirmed",
      record,
      reason: `port ${record.port} is held by pid ${health.pid}, not the recorded ${record.pid}`,
    };
  }
  return { state: "running", record };
}

export type StopOutcome =
  | { readonly result: "stopped"; readonly record: DaemonRecord; readonly escalated: boolean }
  | { readonly result: "not-running" }
  | { readonly result: "cleaned"; readonly record: DaemonRecord }
  | { readonly result: "refused"; readonly record: DaemonRecord; readonly reason: string };

export async function stopDaemon(home: string, deps: LifecycleDeps, token: string | null = null): Promise<StopOutcome> {
  const inspection = await inspectDaemon(home, deps, token);
  if (inspection.record === null) return { result: "not-running" };
  if (inspection.state === "stopped") {
    // The process is gone; only the file is left. Removing it is the whole fix,
    // and doing it here is what keeps a crash from blocking the next start.
    clearDaemonRecord(home);
    return { result: "cleaned", record: inspection.record };
  }
  if (inspection.state === "unconfirmed") {
    return {
      result: "refused",
      record: inspection.record,
      reason: `${inspection.reason ?? "identity could not be confirmed"}. Refusing to signal it. ` +
        `If you are sure it is stale, remove ${pidfilePath(home)}.`,
    };
  }

  const { pid } = inspection.record;
  deps.signal(pid, "SIGTERM");
  const escalated = !(await waitForExit(pid, deps, STOP_GRACE_MS)) && deps.signal(pid, "SIGKILL");
  if (escalated) await waitForExit(pid, deps, 1_000);
  clearDaemonRecord(home);
  return { result: "stopped", record: inspection.record, escalated };
}

async function waitForExit(pid: number, deps: LifecycleDeps, budgetMs: number): Promise<boolean> {
  const deadline = deps.now() + budgetMs;
  while (deps.now() < deadline) {
    if (!deps.alive(pid)) return true;
    await deps.sleep(50);
  }
  return !deps.alive(pid);
}

/**
 * The argv that re-runs this binary.
 *
 * Under `bun src/index.ts` the executable is bun and the script is argv[1];
 * as a compiled binary there is no script to pass. Getting this wrong spawns a
 * bun REPL that never listens, and `start` then times out with nothing to show
 * for it — so it is derived from the running process rather than assumed.
 */
export function selfInvocation(execPath: string, argv: readonly string[]): { command: string; prefix: string[] } {
  const runtime = basename(execPath).toLowerCase();
  const isRuntime = runtime.startsWith("node") || runtime.startsWith("bun");
  return { command: execPath, prefix: isRuntime && argv[1] ? [argv[1]] : [] };
}

export interface SpawnPlan {
  readonly command: string;
  readonly args: readonly string[];
  readonly env: NodeJS.ProcessEnv;
}

export interface SpawnDaemonOptions {
  readonly home: string;
  readonly cwd: string;
  readonly bind: string;
  readonly port: number;
  readonly env: NodeJS.ProcessEnv;
  readonly execPath: string;
  readonly argv: readonly string[];
  /** The resolved token, forwarded through the child's environment. */
  readonly token: string | null;
}

/**
 * Exactly what will be executed, computed without executing it.
 *
 * Split out from the spawn so the argv and the environment can be asserted
 * directly: the two defects this has already had — a dropped token and a nearly
 * shipped token-on-argv — both live entirely in this function, and neither is
 * observable from a test that has to start a real process to see it.
 */
export function daemonSpawnPlan(opts: SpawnDaemonOptions): SpawnPlan {
  const { command, prefix } = selfInvocation(opts.execPath, opts.argv);
  return {
    command,
    args: [
      ...prefix,
      "--home", opts.home,
      "--cwd", opts.cwd,
      "api", "start",
      "--foreground",
      "--bind", opts.bind,
      "--port", String(opts.port),
    ],
    env: opts.token === null ? opts.env : { ...opts.env, [TOKEN_ENV]: opts.token },
  };
}

/**
 * Launch the daemon and hand back its pid.
 *
 * Detached with `stdio: "ignore"`: a daemon holding the terminal's pipes keeps
 * the shell from returning, and one that inherits stdin gets SIGTTIN the first
 * time anything reads. `unref` lets the parent exit while it keeps running,
 * which is the entire point of a daemon.
 *
 * THE TOKEN IS FORWARDED THROUGH THE CHILD'S ENVIRONMENT, AND NEVER ON ARGV.
 * Both halves were found the hard way. Not forwarding it at all is what the
 * first version did, and `av api start --auth-token secret` then produced a
 * daemon serving every route unauthenticated — the parent validated a token the
 * child never received. Putting it on argv instead would fix that by publishing
 * the token to every process listing on the machine, which is precisely why
 * upstream's own help text steers users to the environment variable.
 */
export function spawnDaemon(opts: SpawnDaemonOptions): number {
  const plan = daemonSpawnPlan(opts);
  const child = spawn(plan.command, plan.args, {
    cwd: opts.cwd,
    env: plan.env,
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  if (child.pid === undefined) throw new Error("could not start the api daemon: the process has no pid");
  return child.pid;
}

/** Wait until the child publishes a record for itself and answers `/health`. */
export async function awaitDaemon(
  home: string,
  pid: number,
  deps: LifecycleDeps,
  token: string | null,
  timeoutMs = START_TIMEOUT_MS,
): Promise<DaemonRecord | null> {
  const deadline = deps.now() + timeoutMs;
  while (deps.now() < deadline) {
    const record = readDaemonRecord(home);
    if (record?.pid === pid && (await deps.probeHealth(record, token))?.pid === pid) return record;
    // A child that died before binding — EADDRINUSE is the usual reason — will
    // never publish anything, and waiting the full budget for it helps nobody.
    if (!deps.alive(pid)) return null;
    await deps.sleep(100);
  }
  return null;
}
