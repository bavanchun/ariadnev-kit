import { readFileSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { recordActivity } from "../activity/emit.js";
import { runActivityList } from "../cli/activity-command.js";
import { runProjectsList } from "../cli/projects-command.js";
import { ROUTE_PATHS, handleRequest, type RouteContext } from "./routes.js";

const dirs: string[] = [];
const mk = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "ariadnev-api-routes-"));
  dirs.push(dir);
  return dir;
};

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const ctx = (home: string): RouteContext => ({
  home,
  version: "1.3.0",
  pid: 4242,
  startedAt: "2026-08-29T04:00:00.000Z",
  port: 8767,
  bind: "127.0.0.1",
});

describe("method handling", () => {
  it("answers GET and HEAD", () => {
    const home = mk();
    expect(handleRequest("GET", "/health", ctx(home)).status).toBe(200);
    expect(handleRequest("HEAD", "/health", ctx(home)).status).toBe(200);
  });

  it("refuses anything that could write", () => {
    const home = mk();
    for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
      expect(handleRequest(method, "/health", ctx(home)).status).toBe(405);
    }
  });
});

describe("path handling", () => {
  it("ignores a query string and a trailing slash", () => {
    const home = mk();
    expect(handleRequest("GET", "/health?t=1", ctx(home)).status).toBe(200);
    expect(handleRequest("GET", "/api/activity/", ctx(home)).status).toBe(200);
  });

  it("names the routes it does have when asked for one it does not", () => {
    const result = handleRequest("GET", "/api/nope", ctx(mk()));
    expect(result.status).toBe(404);
    expect(JSON.parse(result.body).data.routes).toEqual([...ROUTE_PATHS]);
  });

  it("serves the dashboard page at the root", () => {
    const result = handleRequest("GET", "/", ctx(mk()));
    expect(result.status).toBe(200);
    expect(result.contentType).toMatch(/text\/html/);
    expect(result.body).toContain("<!doctype html>");
  });
});

describe("what /health and /status report", () => {
  it("carries the pid, which is what `av api stop` verifies against", () => {
    const body = JSON.parse(handleRequest("GET", "/health", ctx(mk())).body);
    expect(body).toMatchObject({ kind: "api.health", data: { status: "ok", pid: 4242 } });
  });

  it("lists its own routes, so the page and the daemon cannot disagree", () => {
    const body = JSON.parse(handleRequest("GET", "/status", ctx(mk())).body);
    expect(body.data.routes).toEqual([...ROUTE_PATHS]);
    expect(body.data).toMatchObject({ running: true, port: 8767, bind: "127.0.0.1" });
  });
});

describe("the data routes are the CLI, byte for byte", () => {
  // The invariant this phase rests on. If a route ever grows its own query, the
  // two answers stop matching and this test says so — which is the whole reason
  // it compares strings rather than shapes.
  it("returns exactly what `av activity list --json` prints", () => {
    const home = mk();
    recordActivity(home, "install.completed", { status: "ok" });
    expect(handleRequest("GET", "/api/activity", ctx(home)).body).toBe(runActivityList({ home, json: true }));
  });

  it("returns exactly what `av projects list --json` prints", () => {
    const home = mk();
    expect(handleRequest("GET", "/api/projects", ctx(home)).body).toBe(runProjectsList({ home, json: true }));
  });

  it("answers every declared data route on an empty home rather than throwing", () => {
    const home = mk();
    for (const path of ROUTE_PATHS) {
      const result = handleRequest("GET", path, ctx(home));
      expect(result.status, `${path} did not answer`).toBe(200);
    }
  });

  it("does not hand out session previews, which carry the user's own work", () => {
    // The CLI keeps `--preview` behind an explicit flag. A network surface is
    // the last place to turn it on by default.
    const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "routes.ts"), "utf8");
    expect(source).not.toMatch(/preview:\s*true/);
  });
});
