// What the daemon serves, and where every byte of it comes from.
//
// EVERY DATA ROUTE IS A CLI `--json` INVOCATION. `/api/activity` returns exactly
// what `av activity list --json` prints, because it calls the same function with
// `json: true` and hands back the string. There is no query layer here, no
// second set of shapes, and no opportunity for the two to disagree: the CLI's
// own tests already pin these payloads, and a route cannot drift from an
// implementation it does not have.
//
// The rule that keeps it that way: a route needing data the CLI cannot already
// print is a signal the CLI is missing a query, and the query is added there
// first. Reaching into storage from this file would buy one endpoint and cost
// the guarantee above.
//
// READ-ONLY, ENFORCED HERE. Only GET and HEAD reach a handler; everything else
// is refused before routing. Mutation over HTTP needs an authentication story,
// and authentication is a non-goal of this whole plan — so the door is shut in
// one place rather than trusted to every future route author.

import { runActivityList, runActivityStats } from "../cli/activity-command.js";
import { runAnalyticsStatus } from "../cli/analytics-command.js";
import { runProjectsList } from "../cli/projects-command.js";
import { runSessionsList } from "../cli/sessions-command.js";
import { jsonEnvelope } from "../cli/json-envelope.js";
import { dashboardPage } from "./dashboard-page.js";

export const API_SCHEMA_VERSION = 1;

export interface RouteContext {
  readonly home: string;
  readonly version: string;
  /** The daemon's own pid — how `stop` proves the process on this port is ours. */
  readonly pid: number;
  readonly startedAt: string;
  readonly port: number;
  readonly bind: string;
}

export interface RouteResult {
  readonly status: number;
  readonly contentType: string;
  readonly body: string;
}

function json(body: string): RouteResult {
  return { status: 200, contentType: "application/json", body };
}

/**
 * The data routes, each one command.
 *
 * `sessions` deliberately does not pass `preview`. A preview carries excerpts of
 * the user's own work, and the CLI keeps it behind an explicit flag for that
 * reason; a network surface is the last place to quietly turn it on.
 */
const DATA_ROUTES: Record<string, (ctx: RouteContext) => string> = {
  "/api/activity": (ctx) => runActivityList({ home: ctx.home, json: true }),
  "/api/activity/stats": (ctx) => runActivityStats({ home: ctx.home, json: true }),
  "/api/projects": (ctx) => runProjectsList({ home: ctx.home, json: true }),
  "/api/sessions": (ctx) => runSessionsList({ home: ctx.home, json: true }),
  "/api/analytics": (ctx) => runAnalyticsStatus({ home: ctx.home, now: new Date().toISOString(), json: true }),
};

/** The paths this daemon answers, for the 404 body and the dashboard's links. */
export const ROUTE_PATHS = ["/", "/health", "/version", "/status", ...Object.keys(DATA_ROUTES)] as const;

export function handleRequest(method: string, rawPath: string, ctx: RouteContext): RouteResult {
  if (method !== "GET" && method !== "HEAD") {
    return {
      status: 405,
      contentType: "application/json",
      body: jsonEnvelope(API_SCHEMA_VERSION, "api.error", {
        error: `${method} is not allowed: this daemon is read-only`,
      }),
    };
  }

  // Query strings and a trailing slash are the caller's business, not the
  // route table's. `/health?t=1` and `/health/` are the same request.
  const path = normalizePath(rawPath);

  if (path === "/health") {
    // `pid` is the identity proof `av api stop` reads before it signals
    // anything. Without it, a recycled pid and a live daemon look identical.
    return json(jsonEnvelope(API_SCHEMA_VERSION, "api.health", {
      status: "ok",
      pid: ctx.pid,
      started_at: ctx.startedAt,
      version: ctx.version,
    }));
  }

  if (path === "/version") {
    return json(jsonEnvelope(API_SCHEMA_VERSION, "api.version", { version: ctx.version }));
  }

  if (path === "/status") {
    return json(jsonEnvelope(API_SCHEMA_VERSION, "api.status", {
      running: true,
      pid: ctx.pid,
      port: ctx.port,
      bind: ctx.bind,
      started_at: ctx.startedAt,
      version: ctx.version,
      routes: ROUTE_PATHS,
    }));
  }

  const data = DATA_ROUTES[path];
  if (data) {
    try {
      return json(data(ctx));
    } catch (error) {
      // A query that throws is a 500 with its reason, not a dropped connection.
      // The CLI surfaces these as messages; a browser deserves the same.
      return {
        status: 500,
        contentType: "application/json",
        body: jsonEnvelope(API_SCHEMA_VERSION, "api.error", {
          error: error instanceof Error ? error.message : String(error),
        }),
      };
    }
  }

  if (path === "/") {
    return { status: 200, contentType: "text/html; charset=utf-8", body: dashboardPage(ctx) };
  }

  return {
    status: 404,
    contentType: "application/json",
    body: jsonEnvelope(API_SCHEMA_VERSION, "api.error", { error: `no route ${path}`, routes: ROUTE_PATHS }),
  };
}

function normalizePath(rawPath: string): string {
  const withoutQuery = rawPath.split("?")[0] ?? "/";
  if (withoutQuery.length > 1 && withoutQuery.endsWith("/")) return withoutQuery.slice(0, -1);
  return withoutQuery;
}
