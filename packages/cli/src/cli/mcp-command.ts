// `ariadnev mcp list|show|add|remove|verify` — the MCP servers a provider will
// start, and whether they actually start.
//
// `add` and `remove` write to files this CLI does not own: `.mcp.json` belongs
// to the repository, `~/.claude.json` belongs to the user and holds a great deal
// besides servers. Both writes are atomic, both back the file up first, and both
// preserve every key they do not understand. Project scope is the default; the
// user's own file is only touched when `--global` says so.
//
// `link` from the upstream group is absent: it copied a definition between
// providers, which needs a verified per-provider MCP config path for each — and
// this repository's rule is that an unverified path is skipped, not guessed.

import { spawn } from "node:child_process";
import { jsonEnvelope } from "./json-envelope.js";
import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { atomicWrite } from "../install/fs-atomic.js";
import {
  MCP_SCHEMA_VERSION,
  assertValidName,
  mergeScopes,
  serversFrom,
  shadowedNames,
  withServer,
  withoutServer,
  type McpServer,
  type McpServerEntry,
} from "../mcp/mcp-config.js";
import { encodeRequest, initializeRequest, readHandshake, type HandshakeOutcome } from "../mcp/mcp-handshake.js";
import { EXIT, UsageError, type ExitCode } from "./exit-codes.js";

/** A server gets this long to answer initialize before it counts as broken. */
export const HANDSHAKE_TIMEOUT_MS = 10_000;

export interface McpResult {
  output: string;
  exitCode: ExitCode;
}

export interface McpOpts {
  home: string;
  cwd: string;
  /** Write to (and read as authoritative) the user's own config. */
  global?: boolean;
  json?: boolean;
  dryRun?: boolean;
  version?: string;
}

export function projectConfigPath(cwd: string): string {
  return join(cwd, ".mcp.json");
}

export function userConfigPath(home: string): string {
  return join(home, ".claude.json");
}

function readParsed(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function envelope(kind: string, data: unknown): string {
  return jsonEnvelope(MCP_SCHEMA_VERSION, kind, data);
}

function loadBoth(opts: McpOpts): { entries: McpServerEntry[]; shadowed: string[]; dropped: string[] } {
  const project = serversFrom(readParsed(projectConfigPath(opts.cwd)));
  const user = serversFrom(readParsed(userConfigPath(opts.home)));
  return {
    entries: mergeScopes(project.servers, user.servers),
    shadowed: shadowedNames(project.servers, user.servers),
    dropped: [...project.dropped, ...user.dropped],
  };
}

export function runMcpList(opts: McpOpts): McpResult {
  const { entries, shadowed, dropped } = loadBoth(opts);
  if (opts.json) return { output: envelope("mcp.list", { servers: entries, shadowed, malformed: dropped }), exitCode: EXIT.ok };

  if (entries.length === 0) return { output: "ariadnev mcp — no servers configured", exitCode: EXIT.ok };
  const width = Math.max(...entries.map((e) => e.name.length));
  const lines = ["ariadnev mcp"];
  for (const entry of entries) {
    const argv = [entry.command, ...(entry.args ?? [])].join(" ");
    lines.push(`  ${entry.name.padEnd(width)}  ${entry.scope.padEnd(7)}  ${argv}`);
  }
  for (const name of shadowed) lines.push(`  note: "${name}" is defined in both scopes — the project one runs`);
  for (const name of dropped) lines.push(`  warning: "${name}" is not a usable server definition and was ignored`);
  return { output: lines.join("\n"), exitCode: EXIT.ok };
}

export function runMcpShow(name: string, opts: McpOpts): McpResult {
  const entry = loadBoth(opts).entries.find((e) => e.name === name);
  if (!entry) {
    if (opts.json) return { output: envelope("mcp.show", { name, found: false }), exitCode: EXIT.failed };
    return { output: `ariadnev mcp — no server named "${name}"`, exitCode: EXIT.failed };
  }
  if (opts.json) return { output: envelope("mcp.show", entry), exitCode: EXIT.ok };
  const lines = [`ariadnev mcp — ${entry.name} (${entry.scope})`, `  command: ${entry.command}`];
  if (entry.args?.length) lines.push(`  args:    ${entry.args.join(" ")}`);
  // Values are not printed: an MCP server's env is where its API keys live.
  if (entry.env && Object.keys(entry.env).length > 0) lines.push(`  env:     ${Object.keys(entry.env).sort().join(", ")}`);
  return { output: lines.join("\n"), exitCode: EXIT.ok };
}

/** Back up before overwriting a file the user (or the repo) owns. */
function writeConfig(path: string, config: Record<string, unknown>, dryRun: boolean): string | null {
  if (dryRun) return null;
  let backup: string | null = null;
  if (existsSync(path)) {
    backup = `${path}.ariadnev-backup`;
    copyFileSync(path, backup);
  }
  atomicWrite(path, `${JSON.stringify(config, null, 2)}\n`);
  return backup;
}

export function runMcpAdd(name: string, server: McpServer, opts: McpOpts): McpResult {
  assertValidName(name);
  if (!server.command) throw new UsageError("a server needs a command to run");
  const path = opts.global ? userConfigPath(opts.home) : projectConfigPath(opts.cwd);
  const updated = withServer(readParsed(path), name, server);
  const backup = writeConfig(path, updated, !!opts.dryRun);
  const data = { name, scope: opts.global ? "user" : "project", path, backup, dryRun: !!opts.dryRun };
  if (opts.json) return { output: envelope("mcp.add", data), exitCode: EXIT.ok };
  const verb = opts.dryRun ? "would add" : "added";
  return { output: `ariadnev mcp — ${verb} "${name}" to ${path}`, exitCode: EXIT.ok };
}

export function runMcpRemove(name: string, opts: McpOpts): McpResult {
  const path = opts.global ? userConfigPath(opts.home) : projectConfigPath(opts.cwd);
  const { config, removed } = withoutServer(readParsed(path), name);
  if (!removed) {
    // Reporting success for a removal that removed nothing is how a user ends
    // up believing a server is gone while it is still starting every session.
    const detail = `no server named "${name}" in ${path}`;
    if (opts.json) return { output: envelope("mcp.remove", { name, path, removed: false }), exitCode: EXIT.failed };
    return { output: `ariadnev mcp — ${detail}`, exitCode: EXIT.failed };
  }
  const backup = writeConfig(path, config, !!opts.dryRun);
  if (opts.json) return { output: envelope("mcp.remove", { name, path, removed: true, backup, dryRun: !!opts.dryRun }), exitCode: EXIT.ok };
  return { output: `ariadnev mcp — ${opts.dryRun ? "would remove" : "removed"} "${name}" from ${path}`, exitCode: EXIT.ok };
}

export interface VerifyDeps {
  /** Start the server and return what it wrote to stdout for one request. */
  handshake(entry: McpServerEntry, request: string, timeoutMs: number): Promise<HandshakeOutcome>;
}

/** Real transport: spawn the server, speak once, and never leave it running. */
export const realVerifyDeps: VerifyDeps = {
  handshake(entry, request, timeoutMs) {
    return new Promise((resolve) => {
      let child: ReturnType<typeof spawn>;
      try {
        child = spawn(entry.command, entry.args ?? [], {
          stdio: ["pipe", "pipe", "ignore"],
          env: { ...process.env, ...(entry.env ?? {}) },
        });
      } catch (error) {
        resolve({ ok: false, reason: `could not start it: ${String((error as Error).message)}` });
        return;
      }

      let stdout = "";
      let settled = false;
      const finish = (outcome: HandshakeOutcome): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        child.kill("SIGKILL");
        resolve(outcome);
      };
      const timer = setTimeout(() => finish(readHandshake(stdout)), timeoutMs);

      child.stdout?.setEncoding("utf8");
      child.stdout?.on("data", (chunk: string) => {
        stdout += chunk;
        // Answer as soon as the reply is there rather than waiting out the
        // timeout: a verify of six servers should not take a minute.
        const outcome = readHandshake(stdout);
        if (outcome.ok) finish(outcome);
      });
      child.on("error", (error) => finish({ ok: false, reason: `could not start it: ${error.message}` }));
      child.on("exit", (code) => {
        const outcome = readHandshake(stdout);
        finish(outcome.ok ? outcome : { ok: false, reason: outcome.reason ?? `it exited with code ${code}` });
      });
      child.stdin?.on("error", () => finish({ ok: false, reason: "it closed its input before the request was sent" }));
      child.stdin?.write(request);
    });
  },
};

export async function runMcpVerify(name: string | undefined, opts: McpOpts, deps: VerifyDeps): Promise<McpResult> {
  const all = loadBoth(opts).entries;
  const targets = name ? all.filter((e) => e.name === name) : all;
  if (name && targets.length === 0) throw new UsageError(`no server named "${name}"`);
  if (targets.length === 0) return { output: "ariadnev mcp verify — no servers configured", exitCode: EXIT.ok };

  const request = encodeRequest(initializeRequest(1, opts.version ?? "0.0.0"));
  const results: { name: string; scope: string; outcome: HandshakeOutcome }[] = [];
  for (const entry of targets) {
    results.push({ name: entry.name, scope: entry.scope, outcome: await deps.handshake(entry, request, HANDSHAKE_TIMEOUT_MS) });
  }

  const failed = results.filter((r) => !r.outcome.ok);
  if (opts.json) {
    return { output: envelope("mcp.verify", { results }), exitCode: failed.length > 0 ? EXIT.failed : EXIT.ok };
  }
  const lines = ["ariadnev mcp verify"];
  for (const result of results) {
    const detail = result.outcome.ok
      ? `${result.outcome.serverName ?? "(unnamed)"} ${result.outcome.serverVersion ?? ""}`.trim()
      : result.outcome.reason ?? "failed";
    lines.push(`  ${result.outcome.ok ? "ok  " : "fail"}  ${result.name} (${result.scope}): ${detail}`);
  }
  lines.push(`  ${results.length} server(s) checked, ${failed.length} failed`);
  return { output: lines.join("\n"), exitCode: failed.length > 0 ? EXIT.failed : EXIT.ok };
}

/**
 * Copy a server's definition from the scope that has it into the other one.
 *
 * UPSTREAM CALLS THIS "MIRROR INTO ANOTHER ADAPTER CONFIG". ariadnev reads and
 * writes two configs — the project's `.mcp.json` and the user's `~/.claude.json`
 * — so mirroring here means moving a definition between those two scopes: take
 * a server you configured for one project and make it yours everywhere, or pin
 * a personal server into a repository so a teammate gets it too.
 *
 * A copy, never a move. The source is left alone, because `link` that silently
 * removed the original would be `mv` wearing the wrong name, and the recovery
 * for it is retyping a config with an API key in it.
 *
 * The env is copied verbatim, keys and values both — a mirrored server that
 * cannot authenticate is not mirrored. That is also why this refuses to write
 * into a project config by default: a personal server's credentials landing in
 * a repository is a leak, and it takes an explicit flag to say you meant it.
 */
export function runMcpLink(name: string, opts: McpOpts & { toProject?: boolean; allowSecrets?: boolean }): McpResult {
  const entry = loadBoth(opts).entries.find((e) => e.name === name);
  if (!entry) {
    if (opts.json) return { output: envelope("mcp.link", { name, found: false }), exitCode: EXIT.failed };
    return { output: `ariadnev mcp — no server named "${name}"`, exitCode: EXIT.failed };
  }

  const target = opts.toProject ? projectConfigPath(opts.cwd) : userConfigPath(opts.home);
  const source = entry.scope === "project" ? projectConfigPath(opts.cwd) : userConfigPath(opts.home);
  if (target === source) {
    throw new UsageError(`"${name}" is already in ${target} — \`link\` copies between the project and user scopes`);
  }

  const envKeys = Object.keys(entry.env ?? {});
  if (opts.toProject && envKeys.length > 0 && !opts.allowSecrets) {
    // The one case worth refusing rather than warning about: this writes a file
    // that is usually committed, and an MCP server's env is where its API keys
    // live.
    throw new UsageError(
      `"${name}" carries ${envKeys.length} env value(s) (${envKeys.sort().join(", ")}) and ${target} is usually committed. ` +
        `Pass --allow-secrets if you really mean to put them in the repository.`,
    );
  }

  const server: McpServer = {
    command: entry.command,
    ...(entry.args ? { args: entry.args } : {}),
    ...(entry.env ? { env: entry.env } : {}),
  };
  const backup = writeConfig(target, withServer(readParsed(target), name, server), !!opts.dryRun);
  const data = { name, from: source, to: target, backup, dryRun: !!opts.dryRun };
  if (opts.json) return { output: envelope("mcp.link", data), exitCode: EXIT.ok };
  return { output: `ariadnev mcp — ${opts.dryRun ? "would mirror" : "mirrored"} "${name}" from ${source} into ${target}`, exitCode: EXIT.ok };
}
