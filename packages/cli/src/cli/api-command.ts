// `av api start | status | stop`.
//
// WHAT IS NOT HERE: THE LLM PROXY. Upstream's `api` is *"a local API and proxy
// server"* — it routes model requests through a vendor account reached by
// `login`, and `login`, `logout` and `whoami` are stated non-goals of this whole
// plan and frozen out of scope by the parity manifest. Porting the proxy would
// ship a credential-handling daemon with no credentials to handle and no client
// to serve. The local half — health, status, version, and read-only views of the
// data plane — is the half that has meaning here, and it is what this builds.
//
// `start` returns once the daemon is confirmed listening, not once it is
// spawned. "Started" printed for a process that died of EADDRINUSE a moment
// later is the report that makes ghost daemons hard to see.

import { runApiForeground } from "./api-foreground.js";
import { EXIT, UnavailableError } from "./exit-codes.js";
import { jsonEnvelope } from "./json-envelope.js";
import { API_SCHEMA_VERSION } from "../api/routes.js";
import { DEFAULT_BIND, DEFAULT_PORT, assertBindAllowed, resolveAuthToken } from "../api/server.js";
import {
  awaitDaemon,
  inspectDaemon,
  spawnDaemon,
  stopDaemon,
  type LifecycleDeps,
} from "../api/daemon-lifecycle.js";
import { pidfilePath } from "../api/daemon-state.js";

export interface ApiOpts {
  readonly home: string;
  readonly cwd: string;
  readonly bind?: string;
  readonly port?: number;
  readonly authToken?: string;
  readonly json?: boolean;
  readonly foreground?: boolean;
  readonly env: NodeJS.ProcessEnv;
  readonly execPath: string;
  readonly argv: readonly string[];
  readonly version: string;
}

export interface ApiResult {
  readonly output: string;
  readonly exitCode: number;
}

function envelope(kind: string, data: unknown): string {
  return jsonEnvelope(API_SCHEMA_VERSION, kind, data);
}

/** The URL a browser opens. Loopback for a wildcard bind — see `probeHealth`. */
export function dashboardUrl(bind: string, port: number): string {
  const host = bind === "0.0.0.0" || bind === "::" ? "127.0.0.1" : bind;
  return `http://${host.includes(":") ? `[${host}]` : host}:${port}/`;
}

export async function runApiStart(opts: ApiOpts, deps: LifecycleDeps): Promise<ApiResult> {
  const bind = opts.bind ?? DEFAULT_BIND;
  const token = resolveAuthToken(opts.authToken, opts.env);
  // Checked before anything is spawned, so a refused bind costs no process.
  assertBindAllowed(bind, token);

  if (opts.foreground) return runApiForeground({ ...opts, bind, token });

  const existing = await inspectDaemon(opts.home, deps, token);
  if (existing.state === "running") {
    const { record } = existing;
    // Not an error. Idempotent `start` is what stops a script from accumulating
    // daemons every time it runs, which is the failure this phase is about.
    return {
      output: opts.json
        ? envelope("api.start", { running: true, started: false, pid: record!.pid, port: record!.port, url: dashboardUrl(record!.bind, record!.port) })
        : `api already running — pid ${record!.pid}, ${dashboardUrl(record!.bind, record!.port)}`,
      exitCode: EXIT.ok,
    };
  }
  if (existing.state === "unconfirmed") {
    throw new UnavailableError(`${existing.reason}. Refusing to start a second daemon over it — remove ${pidfilePath(opts.home)} if it is stale.`);
  }

  const pid = spawnDaemon({
    home: opts.home,
    cwd: opts.cwd,
    bind,
    port: opts.port ?? DEFAULT_PORT,
    env: opts.env,
    execPath: opts.execPath,
    argv: opts.argv,
    token,
  });
  const record = await awaitDaemon(opts.home, pid, deps, token);
  if (record === null) {
    // The child is gone or never bound. Signal it anyway in case it is alive but
    // stuck, so a failed start cannot be the thing that leaves a process behind.
    deps.signal(pid, "SIGKILL");
    throw new UnavailableError(
      `the api daemon did not come up on ${bind}:${opts.port ?? DEFAULT_PORT}. ` +
        `The usual cause is that the port is already held by something else; \`av api status\` says whose it is.`,
    );
  }
  return {
    output: opts.json
      ? envelope("api.start", { running: true, started: true, pid: record.pid, port: record.port, bind: record.bind, url: dashboardUrl(record.bind, record.port) })
      : `api started — pid ${record.pid}, ${dashboardUrl(record.bind, record.port)}`,
    exitCode: EXIT.ok,
  };
}

export async function runApiStatus(opts: ApiOpts, deps: LifecycleDeps): Promise<ApiResult> {
  const token = resolveAuthToken(opts.authToken, opts.env);
  const inspection = await inspectDaemon(opts.home, deps, token);
  const record = inspection.record;

  if (opts.json) {
    return {
      output: envelope("api.status", {
        running: inspection.state === "running",
        state: inspection.state,
        pid: record?.pid ?? null,
        port: record?.port ?? null,
        bind: record?.bind ?? null,
        // Null rather than a zero date. The oracle prints `0001-01-01T00:00:00Z`
        // for a daemon that never started, and a timestamp that has to be
        // recognised as a sentinel is a shape that will be read as real.
        started_at: inspection.state === "running" ? record?.startedAt ?? null : null,
        version: record?.version ?? null,
        ...(inspection.reason ? { reason: inspection.reason } : {}),
      }),
      exitCode: EXIT.ok,
    };
  }

  if (inspection.state === "stopped") return { output: "api: not running", exitCode: EXIT.ok };
  if (inspection.state === "unconfirmed") {
    return { output: `api: unconfirmed — ${inspection.reason}\n  pidfile  ${pidfilePath(opts.home)}`, exitCode: EXIT.ok };
  }
  return {
    output: [
      `api: running`,
      `  pid      ${record!.pid}`,
      `  address  ${record!.bind}:${record!.port}`,
      `  started  ${record!.startedAt}`,
      `  version  ${record!.version}`,
      `  url      ${dashboardUrl(record!.bind, record!.port)}`,
    ].join("\n"),
    exitCode: EXIT.ok,
  };
}

export async function runApiStop(opts: ApiOpts, deps: LifecycleDeps): Promise<ApiResult> {
  const token = resolveAuthToken(opts.authToken, opts.env);
  const outcome = await stopDaemon(opts.home, deps, token);

  if (opts.json) {
    return {
      output: envelope("api.stop", {
        result: outcome.result,
        ...(outcome.result === "stopped" ? { pid: outcome.record.pid, escalated: outcome.escalated } : {}),
        ...(outcome.result === "refused" ? { pid: outcome.record.pid, reason: outcome.reason } : {}),
      }),
      // A refusal is a negative answer to what was asked, not a crash: the
      // daemon is still there. `failed` is the code for exactly that.
      exitCode: outcome.result === "refused" ? EXIT.failed : EXIT.ok,
    };
  }

  switch (outcome.result) {
    case "not-running":
      return { output: "api: not running", exitCode: EXIT.ok };
    case "cleaned":
      return { output: `api: not running — removed a stale record for pid ${outcome.record.pid}`, exitCode: EXIT.ok };
    case "refused":
      return { output: `api: ${outcome.reason}`, exitCode: EXIT.failed };
    case "stopped":
      return {
        output: outcome.escalated
          ? `api stopped — pid ${outcome.record.pid} ignored SIGTERM and was killed`
          : `api stopped — pid ${outcome.record.pid}`,
        exitCode: EXIT.ok,
      };
  }
}
