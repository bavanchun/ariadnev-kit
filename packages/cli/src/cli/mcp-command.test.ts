import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  projectConfigPath,
  realVerifyDeps,
  runMcpAdd,
  runMcpList,
  runMcpRemove,
  runMcpShow,
  runMcpVerify,
  userConfigPath,
  type VerifyDeps,
} from "./mcp-command.js";
import { UsageError } from "./exit-codes.js";

let root: string;
let opts: { home: string; cwd: string };

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "ariadnev-mcp-"));
  mkdirSync(join(root, "home"), { recursive: true });
  mkdirSync(join(root, "project"), { recursive: true });
  opts = { home: join(root, "home"), cwd: join(root, "project") };
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function writeProject(config: unknown): void {
  writeFileSync(projectConfigPath(opts.cwd), JSON.stringify(config, null, 2));
}
function writeUser(config: unknown): void {
  writeFileSync(userConfigPath(opts.home), JSON.stringify(config, null, 2));
}

describe("ariadnev mcp list", () => {
  it("shows both scopes and says which definition wins", () => {
    writeProject({ mcpServers: { shared: { command: "from-project" } } });
    writeUser({ mcpServers: { shared: { command: "from-user" }, mine: { command: "solo" } } });
    const { output } = runMcpList(opts);
    expect(output).toContain("from-project");
    expect(output).not.toContain("from-user");
    expect(output).toContain("mine");
    expect(output).toMatch(/defined in both scopes/);
  });

  it("says so plainly when nothing is configured", () => {
    expect(runMcpList(opts).output).toContain("no servers configured");
  });
});

describe("ariadnev mcp show", () => {
  it("lists env variable names but never their values", () => {
    // A server's env is where its API key lives; printing the value would put
    // it in a terminal, a screenshot, and a scrollback buffer.
    writeProject({ mcpServers: { api: { command: "node", args: ["s.js"], env: { API_KEY: "sk-secret-value" } } } });
    const { output } = runMcpShow("api", opts);
    expect(output).toContain("API_KEY");
    expect(output).not.toContain("sk-secret-value");
  });

  it("reports a name that is not there as a failure, not an empty answer", () => {
    const { output, exitCode } = runMcpShow("ghost", opts);
    expect(exitCode).toBe(1);
    expect(output).toContain("ghost");
  });
});

describe("ariadnev mcp add and remove", () => {
  it("writes to the project file by default and the user's only when asked", () => {
    runMcpAdd("local", { command: "node", args: ["a.js"] }, opts);
    expect(existsSync(userConfigPath(opts.home))).toBe(false);
    expect(JSON.parse(readFileSync(projectConfigPath(opts.cwd), "utf8")).mcpServers.local.command).toBe("node");

    runMcpAdd("mine", { command: "node" }, { ...opts, global: true });
    expect(JSON.parse(readFileSync(userConfigPath(opts.home), "utf8")).mcpServers.mine.command).toBe("node");
  });

  it("preserves every unrelated key in the user's own config", () => {
    // ~/.claude.json is the user's file and mostly none of our business.
    writeUser({ numStartups: 41, tipsHistory: { seen: true }, mcpServers: { old: { command: "x" } } });
    runMcpAdd("new", { command: "node" }, { ...opts, global: true });
    const after = JSON.parse(readFileSync(userConfigPath(opts.home), "utf8"));
    expect(after.numStartups).toBe(41);
    expect(after.tipsHistory).toEqual({ seen: true });
    expect(Object.keys(after.mcpServers).sort()).toEqual(["new", "old"]);
  });

  it("backs the file up before overwriting it", () => {
    writeProject({ mcpServers: { old: { command: "x" } } });
    runMcpAdd("new", { command: "node" }, opts);
    const backup = `${projectConfigPath(opts.cwd)}.ariadnev-backup`;
    expect(JSON.parse(readFileSync(backup, "utf8")).mcpServers).toEqual({ old: { command: "x" } });
  });

  it("writes nothing under --dry-run", () => {
    runMcpAdd("local", { command: "node" }, { ...opts, dryRun: true });
    expect(existsSync(projectConfigPath(opts.cwd))).toBe(false);
  });

  it("refuses a name that could escape its key", () => {
    expect(() => runMcpAdd("../evil", { command: "node" }, opts)).toThrow(/invalid server name/);
  });

  it("does not report success for a removal that removed nothing", () => {
    // Otherwise a user believes a server is gone while it still starts every
    // session.
    const { exitCode, output } = runMcpRemove("ghost", opts);
    expect(exitCode).toBe(1);
    expect(output).toContain("ghost");
  });

  it("removes only the named server", () => {
    writeProject({ mcpServers: { a: { command: "x" }, b: { command: "y" } } });
    expect(runMcpRemove("a", opts).exitCode).toBe(0);
    expect(Object.keys(JSON.parse(readFileSync(projectConfigPath(opts.cwd), "utf8")).mcpServers)).toEqual(["b"]);
  });
});

describe("ariadnev mcp verify", () => {
  const fake = (outcomes: Record<string, { ok: boolean; reason?: string; serverName?: string }>): VerifyDeps => ({
    handshake: async (entry) => outcomes[entry.name] ?? { ok: false, reason: "not configured in the fixture" },
  });

  it("reports a server that does not complete the handshake as failed", async () => {
    writeProject({ mcpServers: { good: { command: "a" }, broken: { command: "b" } } });
    const result = await runMcpVerify(undefined, opts, fake({
      good: { ok: true, serverName: "good-server" },
      broken: { ok: false, reason: "it exited with code 1" },
    }));
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("good-server");
    expect(result.output).toContain("it exited with code 1");
    expect(result.output).toContain("2 server(s) checked, 1 failed");
  });

  it("exits clean when every server answers", async () => {
    writeProject({ mcpServers: { good: { command: "a" } } });
    const result = await runMcpVerify(undefined, opts, fake({ good: { ok: true, serverName: "s" } }));
    expect(result.exitCode).toBe(0);
  });

  it("rejects a name that is not configured rather than checking nothing", async () => {
    await expect(runMcpVerify("ghost", opts, fake({}))).rejects.toThrow(UsageError);
  });

  it("really starts a process and reads its answer", async () => {
    // The fake above proves the reporting; this proves the transport, because a
    // verify that never spawns anything would pass every test above.
    writeProject({
      mcpServers: {
        echo: {
          command: process.execPath,
          args: [
            "-e",
            "process.stdin.once('data', () => { process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:1,result:{protocolVersion:'2025-06-18',serverInfo:{name:'fixture',version:'1.0'}}}) + '\\n'); });",
          ],
        },
        silent: { command: process.execPath, args: ["-e", "process.exit(3)"] },
      },
    });
    const result = await runMcpVerify(undefined, { ...opts, json: true }, realVerifyDeps);
    const parsed = JSON.parse(result.output);
    const byName = Object.fromEntries(parsed.data.results.map((r: { name: string; outcome: unknown }) => [r.name, r.outcome]));
    expect(byName.echo).toMatchObject({ ok: true, serverName: "fixture" });
    expect(byName.silent.ok).toBe(false);
    expect(result.exitCode).toBe(1);
  }, 30_000);
});
