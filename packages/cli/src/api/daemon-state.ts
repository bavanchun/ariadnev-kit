// The record of a running API daemon, and the only thing allowed to identify it.
//
// WHY A FILE AND NOT A PROCESS SCAN. The process-management rules forbid finding
// a daemon by matching a command line, and for a good reason: `pkill -f av` on a
// machine that also runs `ak` is how someone kills a stranger's process. The
// pidfile is written by the daemon's own parent at spawn time, so a pid found
// here is a pid this install started — nothing else can put one here.
//
// WHERE THE MUTUAL EXCLUSION ACTUALLY LIVES: THE PORT BIND, NOT A LOCK FILE.
// Two daemons cannot hold one port, and the loser of that race gets EADDRINUSE
// from the kernel before it has done anything. A `.lock` file beside this one
// would add a second thing to go stale — and a stale lock is a daemon that will
// not start for a reason nobody can see — while guaranteeing nothing the bind
// does not already guarantee. So the record below is written *after* the listener
// is up, which also means it can never describe a daemon that is not listening.
//
// A pid alone is NOT identity — pids are recycled, and signalling a recycled one
// kills whatever inherited the number. `port` and `startedAt` are recorded so
// the lifecycle can ask the process on that port to prove it is ours before
// anything gets signalled. See `daemon-lifecycle.ts`.

import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ensureOperationalDirectory, operationalPath } from "../storage/operational-paths.js";

const PIDFILE = "api.pid";

/** `~/.ariadnev/operational/api` — outside `derived/`: nothing can rebuild it. */
export function daemonRoot(home: string): string {
  return operationalPath(home, "api");
}

export function pidfilePath(home: string): string {
  return join(daemonRoot(home), PIDFILE);
}

export interface DaemonRecord {
  readonly pid: number;
  readonly port: number;
  readonly bind: string;
  /** ISO 8601. Half of the identity proof, and what `status` reports as uptime. */
  readonly startedAt: string;
  readonly version: string;
  /**
   * Whether this daemon demands a bearer token.
   *
   * The token itself is never written here — only the fact that one exists.
   * Without this, `stop` run from a shell that has no token gets an identity
   * probe that 401s, cannot confirm the daemon, and correctly refuses to signal
   * it — with a message about an unidentified process, which is true and useless.
   * One boolean turns that into "this daemon needs its token".
   */
  readonly tokenRequired?: boolean;
}

/**
 * Record a daemon that is already listening.
 *
 * Called by the daemon itself, after the bind. `--port 0` asks the OS to choose,
 * so the port is not knowable any earlier — and writing before the bind would
 * publish a record for a daemon that may be about to die of EADDRINUSE.
 *
 * 0600 because the file names a port a token may be guarding.
 */
export function writeDaemonRecord(home: string, record: DaemonRecord): void {
  ensureOperationalDirectory(home, daemonRoot(home));
  writeFileSync(pidfilePath(home), `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
}

/** The recorded daemon, or null when there is no file or it is unreadable. */
export function readDaemonRecord(home: string): DaemonRecord | null {
  let raw: string;
  try {
    raw = readFileSync(pidfilePath(home), "utf8");
  } catch {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<DaemonRecord>;
    // A truncated write — the machine lost power mid-start — reads as JSON but
    // describes nothing. Treated as absent rather than trusted, because every
    // caller of this either signals the pid or reports it as running.
    if (typeof parsed.pid !== "number" || typeof parsed.port !== "number") return null;
    if (typeof parsed.startedAt !== "string") return null;
    return {
      pid: parsed.pid,
      port: parsed.port,
      bind: typeof parsed.bind === "string" ? parsed.bind : "127.0.0.1",
      startedAt: parsed.startedAt,
      version: typeof parsed.version === "string" ? parsed.version : "unknown",
      ...(parsed.tokenRequired === true ? { tokenRequired: true } : {}),
    };
  } catch {
    return null;
  }
}

/** Release the claim. Safe to call when there is nothing to release. */
export function clearDaemonRecord(home: string): void {
  rmSync(pidfilePath(home), { force: true });
}

/**
 * Whether a pid names a live process.
 *
 * Signal 0 performs the permission and existence checks without delivering
 * anything. EPERM means the process exists and belongs to someone else, which
 * is still "alive" — and a case where the lifecycle must refuse to signal.
 */
export function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}
