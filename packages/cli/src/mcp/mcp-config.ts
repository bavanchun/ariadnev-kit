// MCP server definitions, read from and written to the files a provider already
// uses. Pure: the caller reads and writes; this decides shape and precedence.
//
// Two scopes, and they are different files rather than two sections of one:
// project servers live in `.mcp.json` at the repo root (shared with whoever
// clones it), user servers live in `~/.claude.json` under `mcpServers` (yours
// alone). A server defined in both is the project's — that is the direction
// Claude Code resolves, and inventing our own precedence would make `mcp list`
// disagree with what actually runs.

export const MCP_SCHEMA_VERSION = 1;

export interface McpServer {
  /** Executable to run. Stdio transport is the only one this manages. */
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface McpServerEntry extends McpServer {
  name: string;
  scope: "project" | "user";
}

export type McpServerMap = Record<string, McpServer>;

export class McpConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "McpConfigError";
  }
}

function isServer(value: unknown): value is McpServer {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.command !== "string" || candidate.command.length === 0) return false;
  if (candidate.args !== undefined && !Array.isArray(candidate.args)) return false;
  if (candidate.args && !candidate.args.every((a) => typeof a === "string")) return false;
  if (candidate.env !== undefined && (typeof candidate.env !== "object" || candidate.env === null)) return false;
  return true;
}

/**
 * Read the `mcpServers` map out of one config file's parsed JSON.
 *
 * A malformed entry is dropped rather than throwing: one bad server should not
 * make the other five invisible, and `list` reporting five is more useful than
 * a command that refuses to run.
 */
export function serversFrom(parsed: unknown): { servers: McpServerMap; dropped: string[] } {
  const servers: McpServerMap = {};
  const dropped: string[] = [];
  if (typeof parsed !== "object" || parsed === null) return { servers, dropped };
  const raw = (parsed as { mcpServers?: unknown }).mcpServers;
  if (typeof raw !== "object" || raw === null) return { servers, dropped };
  for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
    if (isServer(value)) servers[name] = value;
    else dropped.push(name);
  }
  return { servers, dropped };
}

/** Project entries win over user entries of the same name. */
export function mergeScopes(project: McpServerMap, user: McpServerMap): McpServerEntry[] {
  const entries: McpServerEntry[] = [];
  for (const [name, server] of Object.entries(user)) {
    if (name in project) continue;
    entries.push({ name, scope: "user", ...server });
  }
  for (const [name, server] of Object.entries(project)) {
    entries.push({ name, scope: "project", ...server });
  }
  return entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/** Names defined in both scopes — the project one is what runs. */
export function shadowedNames(project: McpServerMap, user: McpServerMap): string[] {
  return Object.keys(user)
    .filter((name) => name in project)
    .sort();
}

const NAME_SHAPE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

export function assertValidName(name: string): void {
  if (!NAME_SHAPE.test(name)) {
    throw new McpConfigError(`invalid server name "${name}" (letters, digits, dash and underscore; up to 64 chars)`);
  }
}

/**
 * Put a server into a parsed config object, returning a new object.
 *
 * Everything else in the file is preserved untouched — `~/.claude.json` holds a
 * great deal that has nothing to do with us, and rewriting it from a model of
 * what we think belongs there would discard whatever we failed to model.
 */
export function withServer(parsed: unknown, name: string, server: McpServer): Record<string, unknown> {
  assertValidName(name);
  const base = typeof parsed === "object" && parsed !== null ? { ...(parsed as Record<string, unknown>) } : {};
  const existing = typeof base.mcpServers === "object" && base.mcpServers !== null ? base.mcpServers : {};
  base.mcpServers = { ...(existing as McpServerMap), [name]: server };
  return base;
}

export function withoutServer(parsed: unknown, name: string): { config: Record<string, unknown>; removed: boolean } {
  const base = typeof parsed === "object" && parsed !== null ? { ...(parsed as Record<string, unknown>) } : {};
  const existing = typeof base.mcpServers === "object" && base.mcpServers !== null ? { ...(base.mcpServers as McpServerMap) } : {};
  const removed = name in existing;
  delete existing[name];
  base.mcpServers = existing;
  return { config: base, removed };
}
