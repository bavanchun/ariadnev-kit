// Spawn a coding agent, stream its output, and guarantee nothing survives it.
//
// THIS IS THE FILE THAT CAN WRECK A MACHINE. Every other part of dispatch
// computes a string; this one starts a process that starts processes. A missed
// signal here does not fail a test, it leaves a language model running in the
// background — and this project has already lost a machine to runaway workers
// once. So the invariant is stated as three properties and asserted as three
// tests: SIGINT reaches the child, `--timeout` escalates, and no path leaves an
// orphan.
//
// WHY A PROCESS GROUP. `spawn(..., { detached: true })` puts the child in its
// own group, and `process.kill(-pid, sig)` signals the whole group. A coding
// agent spawns its own children — shells, language servers, MCP servers — and
// signalling only the agent leaves those behind. Detaching costs one thing: the
// terminal's own Ctrl-C no longer reaches the child for free, which is why
// SIGINT is forwarded explicitly below rather than relied upon.
//
// WHY STDIN IS IGNORED. The prompt travels on argv. A detached process that
// inherits a terminal's stdin and reads it gets SIGTTIN and stops — a hang that
// looks exactly like a slow model.

import { spawn } from "node:child_process";

/** How long a process group gets to exit on TERM before it is killed. */
export const DEFAULT_GRACE_MS = 5_000;

export interface SpawnRequest {
  readonly binary: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
  /** Milliseconds before TERM. Zero disables the timeout, as upstream's does. */
  readonly timeoutMs: number;
  readonly graceMs?: number;
  readonly onStdout: (chunk: string) => void;
  readonly onStderr: (chunk: string) => void;
  /** Aborting forwards SIGINT to the child's group. */
  readonly signal?: AbortSignal;
}

export type ForcedEnd = "timeout" | "cancelled" | null;

export interface SpawnOutcome {
  /** The child's own code, or 1 when a signal ended it and left none. */
  readonly exitCode: number;
  readonly forced: ForcedEnd;
  /** True when the group had to be KILLed after ignoring TERM. */
  readonly escalated: boolean;
}

/**
 * Signal a whole process group, tolerating its absence.
 *
 * ESRCH means the group is already gone, which is the outcome this was asked
 * for. Anything else is a real error and would be a bug to swallow, but there
 * is nothing useful to do with it on a teardown path either — so it is reported
 * through the return value rather than thrown into an exit handler.
 */
function signalGroup(pid: number, signal: NodeJS.Signals): boolean {
  try {
    process.kill(-pid, signal);
    return true;
  } catch {
    return false;
  }
}

/** True while the process group still has at least one member. */
export function groupAlive(pid: number): boolean {
  try {
    process.kill(-pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Run one adapter invocation to completion.
 *
 * Resolves rather than rejects for a non-zero exit: a skill that fails is a
 * normal outcome with a code to propagate, not an exception. It rejects only
 * when the binary could not be started at all — the caller turns that into the
 * "environment is not ready" exit.
 */
export function spawnStreaming(request: SpawnRequest): Promise<SpawnOutcome> {
  return new Promise<SpawnOutcome>((resolve, reject) => {
    const child = spawn(request.binary, [...request.args], {
      cwd: request.cwd,
      env: request.env,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let forced: ForcedEnd = null;
    let escalated = false;
    let settled = false;
    let timeoutTimer: NodeJS.Timeout | undefined;
    let graceTimer: NodeJS.Timeout | undefined;

    const clearTimers = (): void => {
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (graceTimer) clearTimeout(graceTimer);
    };

    /**
     * TERM the group, then KILL whatever is still there after the grace.
     *
     * The grace timer is what makes this an escalation rather than a hope: a
     * child that traps TERM to clean up gets to, and one that traps it to stay
     * alive does not.
     */
    const endGroup = (why: Exclude<ForcedEnd, null>, signal: NodeJS.Signals): void => {
      if (forced !== null || child.pid === undefined) return;
      forced = why;
      signalGroup(child.pid, signal);
      graceTimer = setTimeout(() => {
        if (child.pid !== undefined && groupAlive(child.pid)) {
          escalated = signalGroup(child.pid, "SIGKILL");
        }
      }, request.graceMs ?? DEFAULT_GRACE_MS);
      graceTimer.unref();
    };

    const onAbort = (): void => endGroup("cancelled", "SIGINT");
    request.signal?.addEventListener("abort", onAbort, { once: true });

    if (request.timeoutMs > 0) {
      timeoutTimer = setTimeout(() => endGroup("timeout", "SIGTERM"), request.timeoutMs);
      timeoutTimer.unref();
    }

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    // Written straight through, never accumulated: a dispatched skill runs for
    // minutes, and buffering its output makes a working run look hung.
    child.stdout?.on("data", (chunk: string) => request.onStdout(chunk));
    child.stderr?.on("data", (chunk: string) => request.onStderr(chunk));

    const finish = (outcome: SpawnOutcome): void => {
      if (settled) return;
      settled = true;
      clearTimers();
      request.signal?.removeEventListener("abort", onAbort);
      // The last word on the invariant. `close` fires when the child is reaped,
      // but its group may still hold the grandchildren it spawned, and this is
      // the only moment we still know the pid.
      if (child.pid !== undefined && groupAlive(child.pid)) signalGroup(child.pid, "SIGKILL");
      resolve(outcome);
    };

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimers();
      request.signal?.removeEventListener("abort", onAbort);
      reject(error);
    });

    // `close` rather than `exit`: exit fires when the process ends, close when
    // its pipes drain. Resolving on exit would drop the tail of the output.
    child.on("close", (code, signal) => {
      // A signalled child reports a null code. Upstream runners answer 128+n
      // here; this project's exit table has four values and a fifth spelling
      // would be a second contract, so a forced end is a plain failure.
      const exitCode = code ?? (signal ? 1 : 0);
      finish({ exitCode, forced, escalated });
    });
  });
}
