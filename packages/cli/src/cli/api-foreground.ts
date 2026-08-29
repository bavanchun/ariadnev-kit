// The process that *is* the daemon.
//
// `av api start` spawns this same binary with `--foreground`, and this is where
// that lands. It is also directly useful: `av api start --foreground` in a
// terminal or a container is a daemon whose lifetime is the shell's, with no
// pidfile ceremony and no detached process to forget about.
//
// THE RECORD IS WRITTEN AFTER THE BIND AND REMOVED ON THE WAY OUT, and both
// halves matter. Writing first would publish a daemon that may be about to lose
// the port; not removing it on exit is how the next `status` reports a daemon
// that stopped an hour ago.
//
// The exit path is registered for SIGTERM *and* SIGINT because both arrive here
// in normal use: `av api stop` sends TERM, and a foreground run ends with Ctrl-C.

import { recordActivity } from "../activity/emit.js";
import { readDaemonRecord, clearDaemonRecord, writeDaemonRecord } from "../api/daemon-state.js";
import { startServer } from "../api/server.js";
import { API_SCHEMA_VERSION } from "../api/routes.js";
import { EXIT } from "./exit-codes.js";
import { jsonEnvelope } from "./json-envelope.js";
import { dashboardUrl } from "./api-command.js";

export interface ForegroundOpts {
  readonly home: string;
  readonly cwd: string;
  readonly bind: string;
  readonly port?: number;
  readonly token: string | null;
  readonly json?: boolean;
  readonly version: string;
  /** Ends the run without a signal. Tests use it; nothing else needs to. */
  readonly stop?: AbortSignal;
}

export interface ForegroundResult {
  readonly output: string;
  readonly exitCode: number;
}

export async function runApiForeground(opts: ForegroundOpts): Promise<ForegroundResult> {
  const server = await startServer({
    home: opts.home,
    version: opts.version,
    bind: opts.bind,
    ...(opts.port === undefined ? {} : { port: opts.port }),
    token: opts.token,
  });

  writeDaemonRecord(opts.home, {
    pid: process.pid,
    port: server.port,
    bind: server.bind,
    startedAt: server.startedAt,
    version: opts.version,
    ...(opts.token === null ? {} : { tokenRequired: true }),
  });
  recordActivity(opts.home, "api.started", { status: "ok" });

  const url = dashboardUrl(server.bind, server.port);
  if (!opts.json) process.stderr.write(`api listening on ${url} (pid ${process.pid}) — Ctrl-C to stop\n`);

  await waitForShutdown(opts.stop);

  await server.close();
  releaseRecord(opts.home);
  recordActivity(opts.home, "api.stopped", { status: "ok" });

  return {
    output: opts.json
      ? jsonEnvelope(API_SCHEMA_VERSION, "api.foreground", { ran: true, port: server.port, bind: server.bind, url })
      : "",
    exitCode: EXIT.ok,
  };
}

/**
 * Remove the record, but only while it still describes this process.
 *
 * A daemon that was replaced — its file overwritten by a successor — must not
 * delete the successor's record on its way out. Checking the pid costs one read
 * and removes the only way this cleanup can do damage.
 */
function releaseRecord(home: string): void {
  if (readDaemonRecord(home)?.pid === process.pid) clearDaemonRecord(home);
}

function waitForShutdown(stop: AbortSignal | undefined): Promise<void> {
  return new Promise<void>((resolve) => {
    const finish = (): void => {
      process.removeListener("SIGTERM", finish);
      process.removeListener("SIGINT", finish);
      resolve();
    };
    process.once("SIGTERM", finish);
    process.once("SIGINT", finish);
    if (stop) {
      if (stop.aborted) finish();
      else stop.addEventListener("abort", finish, { once: true });
    }
  });
}
