import { describe, it, expect } from "vitest";
import {
  McpConfigError,
  assertValidName,
  mergeScopes,
  serversFrom,
  shadowedNames,
  withServer,
  withoutServer,
} from "./mcp-config.js";
import { encodeRequest, initializeRequest, readHandshake } from "./mcp-handshake.js";

describe("reading server definitions", () => {
  it("takes the well-formed entries and names the ones it dropped", () => {
    // One malformed entry must not hide the rest: a list of five is more useful
    // than a command that refuses to run because of a sixth.
    const parsed = {
      mcpServers: {
        good: { command: "node", args: ["server.js"] },
        noCommand: { args: ["x"] },
        badArgs: { command: "node", args: "server.js" },
      },
    };
    const { servers, dropped } = serversFrom(parsed);
    expect(Object.keys(servers)).toEqual(["good"]);
    expect(dropped.sort()).toEqual(["badArgs", "noCommand"]);
  });

  it("treats a file with no mcpServers as having none", () => {
    expect(serversFrom({}).servers).toEqual({});
    expect(serversFrom(null).servers).toEqual({});
    expect(serversFrom({ mcpServers: "nope" }).servers).toEqual({});
  });
});

describe("scope precedence", () => {
  const project = { shared: { command: "project-cmd" }, onlyProject: { command: "p" } };
  const user = { shared: { command: "user-cmd" }, onlyUser: { command: "u" } };

  it("lets the project definition win, because that is what actually runs", () => {
    const merged = mergeScopes(project, user);
    expect(merged.map((e) => e.name)).toEqual(["onlyProject", "onlyUser", "shared"]);
    const shared = merged.find((e) => e.name === "shared");
    expect(shared).toMatchObject({ scope: "project", command: "project-cmd" });
  });

  it("names what is shadowed rather than hiding it", () => {
    expect(shadowedNames(project, user)).toEqual(["shared"]);
    expect(shadowedNames({}, user)).toEqual([]);
  });
});

describe("writing server definitions", () => {
  it("preserves everything else in the file", () => {
    // ~/.claude.json holds a great deal that is none of our business. Rewriting
    // it from a model of what belongs there would drop whatever we failed to
    // model — and that file is the user's, not ours.
    const original = { numStartups: 42, tipsHistory: { a: 1 }, mcpServers: { old: { command: "x" } } };
    const updated = withServer(original, "new", { command: "node", args: ["s.js"] });
    expect(updated.numStartups).toBe(42);
    expect(updated.tipsHistory).toEqual({ a: 1 });
    expect(Object.keys(updated.mcpServers as object).sort()).toEqual(["new", "old"]);
    expect(original.mcpServers).toEqual({ old: { command: "x" } });
  });

  it("reports whether a removal actually removed anything", () => {
    const config = { mcpServers: { a: { command: "x" } } };
    expect(withoutServer(config, "a").removed).toBe(true);
    expect(withoutServer(config, "missing").removed).toBe(false);
  });

  it("rejects a name that could escape its key", () => {
    expect(() => assertValidName("../../etc/passwd")).toThrow(McpConfigError);
    expect(() => assertValidName("")).toThrow(McpConfigError);
    expect(() => assertValidName("with space")).toThrow(McpConfigError);
    expect(() => assertValidName("fine-name_2")).not.toThrow();
  });
});

describe("initialize handshake", () => {
  it("sends one newline-delimited JSON-RPC request", () => {
    const encoded = encodeRequest(initializeRequest(1, "1.2.3"));
    expect(encoded.endsWith("\n")).toBe(true);
    const parsed = JSON.parse(encoded);
    expect(parsed).toMatchObject({ jsonrpc: "2.0", id: 1, method: "initialize" });
    expect(parsed.params.clientInfo).toEqual({ name: "ariadnev", version: "1.2.3" });
  });

  it("reads a result past a banner the server printed first", () => {
    // Servers commonly greet before speaking protocol; treating that as a
    // failure would report a working server as broken.
    const stdout = [
      "my-server v2 starting…",
      JSON.stringify({ jsonrpc: "2.0", id: 1, result: { protocolVersion: "2025-06-18", serverInfo: { name: "fs", version: "2.0" } } }),
    ].join("\n");
    expect(readHandshake(stdout)).toEqual({
      ok: true,
      serverName: "fs",
      serverVersion: "2.0",
      protocolVersion: "2025-06-18",
    });
  });

  it("does not mistake another message for the answer", () => {
    const stdout = JSON.stringify({ jsonrpc: "2.0", id: 99, result: { serverInfo: { name: "other" } } });
    expect(readHandshake(stdout, 1).ok).toBe(false);
  });

  it("reports a refusal with the server's own words", () => {
    const stdout = JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: -32600, message: "unsupported protocol" } });
    const outcome = readHandshake(stdout);
    expect(outcome.ok).toBe(false);
    expect(outcome.reason).toContain("unsupported protocol");
  });

  it("distinguishes silence from noise", () => {
    expect(readHandshake("").reason).toMatch(/no output/);
    expect(readHandshake("just a banner\n").reason).toMatch(/never answered/);
  });
});
