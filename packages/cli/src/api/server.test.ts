import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { UnavailableError, UsageError } from "../cli/exit-codes.js";
import { DEFAULT_BIND, DEFAULT_PORT, assertBindAllowed, isLoopback, resolveAuthToken, startServer, type RunningServer } from "./server.js";

const dirs: string[] = [];
const servers: RunningServer[] = [];

const mk = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "ariadnev-api-server-"));
  dirs.push(dir);
  return dir;
};

/** Every listener opened by a test is closed, or the suite leaves one behind. */
async function serve(over: Partial<Parameters<typeof startServer>[0]> = {}): Promise<RunningServer> {
  const server = await startServer({ home: mk(), version: "1.3.0", port: 0, ...over });
  servers.push(server);
  return server;
}

afterEach(async () => {
  for (const server of servers.splice(0)) await server.close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

async function get(server: RunningServer, path: string, headers: Record<string, string> = {}, method = "GET") {
  const response = await fetch(`http://127.0.0.1:${server.port}${path}`, { method, headers });
  return { status: response.status, body: await response.text(), type: response.headers.get("content-type") ?? "" };
}

describe("what counts as loopback", () => {
  it.each(["127.0.0.1", "127.1.2.3", "localhost", "::1", "[::1]", "LOCALHOST"])("accepts %s", (bind) => {
    expect(isLoopback(bind)).toBe(true);
  });

  it.each(["0.0.0.0", "::", "192.168.1.10", "example.com", "10.0.0.1"])("rejects %s", (bind) => {
    // A wildcard is the dangerous one and the easiest to wave through: it is
    // not a remote address, so a naive check reads it as harmless.
    expect(isLoopback(bind)).toBe(false);
  });
});

describe("the bind rule", () => {
  it("allows loopback with no token at all", () => {
    expect(() => assertBindAllowed(DEFAULT_BIND, null)).not.toThrow();
  });

  it("refuses a non-loopback bind that nothing authenticates", () => {
    expect(() => assertBindAllowed("0.0.0.0", null)).toThrow(UsageError);
    expect(() => assertBindAllowed("0.0.0.0", null)).toThrow(/activity log and sessions/);
  });

  it("allows a non-loopback bind once a token is set", () => {
    expect(() => assertBindAllowed("0.0.0.0", "s3cret")).not.toThrow();
  });

  it("refuses before the listener exists, so a bad bind costs no socket", async () => {
    await expect(startServer({ home: mk(), version: "1.3.0", bind: "0.0.0.0", port: 0 })).rejects.toThrow(UsageError);
  });
});

describe("resolving the token", () => {
  it("prefers the flag, falls back to the environment, and defaults to none", () => {
    expect(resolveAuthToken("abc", {})).toBe("abc");
    expect(resolveAuthToken(undefined, { ARIADNEV_API_TOKEN: "env" })).toBe("env");
    expect(resolveAuthToken(undefined, {})).toBeNull();
    expect(resolveAuthToken("", {})).toBeNull();
  });

  it("reads @file, so a token need not appear in a process listing", () => {
    const dir = mk();
    const path = join(dir, "token");
    writeFileSync(path, "from-a-file\n");
    expect(resolveAuthToken(`@${path}`, {})).toBe("from-a-file");
  });

  it("says which file it could not read rather than silently running open", () => {
    // Falling back to "no token" here would turn a typo into an unauthenticated
    // daemon, which is the one outcome this must never produce.
    expect(() => resolveAuthToken("@/nope/token", {})).toThrow(/cannot read --auth-token/);
  });
});

describe("the listener", () => {
  it("answers /health with the pid that `stop` verifies against", async () => {
    const server = await serve();
    const { status, body } = await get(server, "/health");
    expect(status).toBe(200);
    expect(JSON.parse(body)).toMatchObject({ kind: "api.health", data: { status: "ok", pid: process.pid } });
  });

  it("reports the port the OS actually assigned when asked for 0", async () => {
    const server = await serve();
    expect(server.port).toBeGreaterThan(0);
    expect(server.port).not.toBe(DEFAULT_PORT);
  });

  it("refuses every method that is not a read", async () => {
    // Mutation over HTTP needs an auth story, and auth is a non-goal. The door
    // is shut once, here, rather than per route.
    const server = await serve();
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      const { status, body } = await get(server, "/health", {}, method);
      expect(status).toBe(405);
      expect(JSON.parse(body).data.error).toMatch(/read-only/);
    }
  });

  it("never caches — a stale /health would defeat the point of asking", async () => {
    const server = await serve();
    const response = await fetch(`http://127.0.0.1:${server.port}/health`);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await response.text();
  });

  it("reports the port collision instead of moving to another one", async () => {
    // Incrementing on EADDRINUSE is exactly how ghost daemons accumulate: the
    // old one keeps running and the pidfile stops matching anything.
    const first = await serve();
    await expect(
      startServer({ home: mk(), version: "1.3.0", bind: "127.0.0.1", port: first.port }),
    ).rejects.toThrow(UnavailableError);
    await expect(
      startServer({ home: mk(), version: "1.3.0", bind: "127.0.0.1", port: first.port }),
    ).rejects.toThrow(/will not move to another one/);
  });
});

describe("the token, once one is set", () => {
  it("is required on every request, loopback included", async () => {
    // Enforcing it only for non-loopback would mean the same token behaves
    // differently depending on an unrelated flag.
    const server = await serve({ token: "s3cret" });
    expect((await get(server, "/health")).status).toBe(401);
    expect((await get(server, "/health", { authorization: "Bearer s3cret" })).status).toBe(200);
  });

  it("rejects a wrong token, a prefix of it, and the wrong scheme", async () => {
    const server = await serve({ token: "s3cret" });
    expect((await get(server, "/health", { authorization: "Bearer wrong" })).status).toBe(401);
    expect((await get(server, "/health", { authorization: "Bearer s3cre" })).status).toBe(401);
    expect((await get(server, "/health", { authorization: "Basic s3cret" })).status).toBe(401);
  });

  it("guards the data routes, not only /health", async () => {
    const server = await serve({ token: "s3cret" });
    expect((await get(server, "/api/activity")).status).toBe(401);
    expect((await get(server, "/")).status).toBe(401);
  });
});
