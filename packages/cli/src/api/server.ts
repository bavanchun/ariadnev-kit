// The HTTP listener: where it may bind, who may talk to it, and what happens
// when the port is already taken.
//
// THE BIND RULE IS COPIED FROM THE ORACLE VERBATIM, because it is a security
// default and this is not the place to have an opinion: *"Binds 127.0.0.1 by
// default; non-loopback binds require --auth-token."* A daemon that reads the
// activity log and every discovered session is not something to put on a LAN
// because a flag was convenient.
//
// UPSTREAM SPELLS THAT REFUSAL AS EXIT 7. ariadnev's exit table has four values
// (`exit-codes.ts`), and a fifth spelling invented here would be a second
// contract for one command. `--bind 0.0.0.0` with no token is a flag
// combination that cannot be honoured, which is what `usage` means, so it is a
// `UsageError`. The divergence is recorded in the phase document.
//
// PORT COLLISIONS ARE REPORTED, NEVER ROUTED AROUND. Incrementing to the next
// free port is precisely how the process-management rules describe ghost
// daemons accumulating: the old one keeps running, the pidfile stops matching,
// and the next run does it again. EADDRINUSE ends the start.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { timingSafeEqual } from "node:crypto";
import { UnavailableError, UsageError } from "../cli/exit-codes.js";
import { handleRequest, type RouteContext } from "./routes.js";

/** One above the upstream CLI's dashboard, so its own api (8765) and dashboard
 *  (8766) can both be running on this machine while ariadnev's daemon starts. */
export const DEFAULT_PORT = 8767;
export const DEFAULT_BIND = "127.0.0.1";
export const TOKEN_ENV = "ARIADNEV_API_TOKEN";

/** Loopback: the local machine and nothing else. A wildcard is not loopback. */
export function isLoopback(bind: string): boolean {
  const host = bind.trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host === "::1") return true;
  return /^127(\.\d{1,3}){3}$/.test(host);
}

/**
 * Resolve the token from a flag or the environment.
 *
 * `@/path/to/file` reads the file, and the environment variable is preferred,
 * both for the reason upstream gives: a token passed as an argument is visible
 * in every process listing on the machine.
 */
export function resolveAuthToken(flag: string | undefined, env: NodeJS.ProcessEnv): string | null {
  const raw = flag ?? env[TOKEN_ENV];
  if (raw === undefined || raw === "") return null;
  if (!raw.startsWith("@")) return raw;
  const path = raw.slice(1);
  try {
    return readFileSync(path, "utf8").trim() || null;
  } catch (error) {
    throw new UsageError(`cannot read --auth-token from ${path}: ${(error as NodeJS.ErrnoException).code}`);
  }
}

/** Refuse a non-loopback bind that nothing authenticates. Throws or returns. */
export function assertBindAllowed(bind: string, token: string | null): void {
  if (isLoopback(bind) || token !== null) return;
  throw new UsageError(
    `refusing to bind ${bind} without an auth token: a non-loopback bind exposes this machine's ` +
      `activity log and sessions to the network. Pass --auth-token (or set ${TOKEN_ENV}), or bind ${DEFAULT_BIND}.`,
  );
}

/** Compare without leaking length or position through timing. */
function tokenMatches(expected: string, offered: string | undefined): boolean {
  if (offered === undefined) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(offered);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export interface ServeOptions {
  readonly home: string;
  readonly version: string;
  readonly bind?: string;
  /** 0 asks the OS to choose, matching the oracle's own `--port 0`. */
  readonly port?: number;
  readonly token?: string | null;
}

export interface RunningServer {
  readonly port: number;
  readonly bind: string;
  readonly startedAt: string;
  close(): Promise<void>;
}

// `async` rather than a bare `Promise` return, so the bind refusal below
// arrives as a rejection like every other failure here. A function that
// advertises a promise and then throws synchronously breaks any caller that
// reached for `.catch()` instead of `try`.
export async function startServer(opts: ServeOptions): Promise<RunningServer> {
  const bind = opts.bind ?? DEFAULT_BIND;
  const token = opts.token ?? null;
  assertBindAllowed(bind, token);

  const startedAt = new Date().toISOString();
  const requestedPort = opts.port ?? DEFAULT_PORT;

  const server = createServer((request, response) => {
    respond(request, response, token, () => ({
      home: opts.home,
      version: opts.version,
      pid: process.pid,
      startedAt,
      port: portOf(server, requestedPort),
      bind,
    }));
  });

  return await new Promise<RunningServer>((resolve, reject) => {
    const onError = (error: NodeJS.ErrnoException): void => {
      server.removeListener("listening", onListening);
      if (error.code === "EADDRINUSE") {
        reject(new UnavailableError(
          `port ${requestedPort} is already in use, and this daemon will not move to another one. ` +
            `Run \`av api status\` to see whether it is ariadnev's; if the holder is something else, ` +
            `stop it or start with --port <n>.`,
        ));
        return;
      }
      reject(error);
    };
    const onListening = (): void => {
      server.removeListener("error", onError);
      resolve({
        port: portOf(server, requestedPort),
        bind,
        startedAt,
        close: () => new Promise<void>((done) => server.close(() => done())),
      });
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(requestedPort, bind);
  });
}

function portOf(server: Server, fallback: number): number {
  const address = server.address();
  return typeof address === "object" && address !== null ? address.port : fallback;
}

/**
 * Answer one request.
 *
 * The token is checked whenever one is configured, not only on non-loopback
 * binds. Enforcing it conditionally would mean the same command with the same
 * token behaves differently depending on an unrelated flag, and "the token I
 * set was ignored" is not a sentence this daemon should ever cause.
 */
function respond(
  request: IncomingMessage,
  response: ServerResponse,
  token: string | null,
  context: () => RouteContext,
): void {
  if (token !== null && !tokenMatches(token, bearerOf(request.headers.authorization))) {
    response.writeHead(401, { "content-type": "application/json" });
    response.end(`{"schema_version":1,"kind":"api.error","data":{"error":"unauthorized"}}`);
    return;
  }
  const result = handleRequest(request.method ?? "GET", request.url ?? "/", context());
  response.writeHead(result.status, {
    "content-type": result.contentType,
    // Nothing here is meant to be reachable from a page the user did not open
    // from this daemon, and a stale answer to `/health` would defeat the point.
    "cache-control": "no-store",
  });
  response.end(request.method === "HEAD" ? undefined : result.body);
}

function bearerOf(header: string | undefined): string | undefined {
  if (header === undefined) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1];
}
