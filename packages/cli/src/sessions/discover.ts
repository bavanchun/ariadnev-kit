// Finding the session files two other tools write.
//
// EVERY ROOT HERE IS OBSERVED, NOT INFERRED. `plans/reports/probe-260828-session-layouts.md`
// records both layouts as they were found on disk. The same rule the provider
// matrix follows applies to reading: an agent whose layout cannot be confirmed
// is reported as unsupported rather than guessed at. OpenCode appears in the
// oracle's `stats` output and was **not** found on this machine, so it is
// declared unsupported instead of pointed at a plausible path.
//
// THE ROOT IS THE SESSIONS DIRECTORY, NOT THE AGENT HOME. `~/.codex/auth.json`
// sits one level above `~/.codex/sessions/`. Rooting discovery at the agent
// home and filtering by extension would put a credential file inside the walk;
// rooting it at the sessions directory means the walk never reaches it. That is
// a structural guarantee rather than a filter someone has to maintain.

import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { readRegistry, type ProjectEntry } from "../projects/registry.js";

/** Agents whose session layout this build has actually observed. */
export const SUPPORTED_AGENTS = ["claude-code", "codex"] as const;

export type SessionAgent = (typeof SUPPORTED_AGENTS)[number];

/**
 * Agents the oracle reports on that ariadnev cannot read.
 *
 * Listed rather than omitted: `stats` should be able to say "we do not read
 * this" instead of silently reporting zero, which is indistinguishable from an
 * agent that was never used.
 */
export const UNSUPPORTED_AGENTS = ["opencode"] as const;

export interface SessionRoots {
  /** `~/.claude/projects`, or `CLAUDE_HOME`-equivalent override. */
  readonly claudeCode: string;
  /** `~/.codex/sessions` — deliberately not `~/.codex`. */
  readonly codex: string;
}

export function sessionRoots(home: string, env: NodeJS.ProcessEnv = process.env): SessionRoots {
  // The oracle honours `AGENTKIT_CLAUDE_HOME`; the ariadnev-branded spelling is
  // what this reads, because pointing at another tool's variable would make one
  // tool's test fixture silently redirect the other.
  const claudeHome = env.ARIADNEV_CLAUDE_HOME ?? join(home, ".claude");
  const codexHome = env.ARIADNEV_CODEX_HOME ?? join(home, ".codex");
  return { claudeCode: join(claudeHome, "projects"), codex: join(codexHome, "sessions") };
}

export interface DiscoveredSession {
  readonly id: string;
  readonly agent: SessionAgent;
  readonly path: string;
  /** Registry project name when the session's directory maps to one. */
  readonly projectId?: string;
  readonly sizeBytes: number;
  readonly modifiedAt: string;
}

/**
 * Claude Code names a project directory after its absolute path with every
 * separator replaced by a dash. Reversing that is ambiguous — a path segment
 * containing a dash is indistinguishable from a separator — so the mapping runs
 * forwards, from each registered project to its expected directory name, and
 * never tries to parse a directory name back into a path.
 */
export function claudeProjectDirName(dir: string): string {
  return dir.replace(/[/\\]/g, "-");
}

function statOf(path: string): { sizeBytes: number; modifiedAt: string } | undefined {
  try {
    const info = statSync(path);
    return { sizeBytes: info.size, modifiedAt: info.mtime.toISOString() };
  } catch {
    return undefined;
  }
}

function listJsonl(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl"))
      .map((entry) => join(dir, entry.name));
  } catch {
    return [];
  }
}

/** Claude Code sessions for one registered project. */
function discoverClaudeCode(roots: SessionRoots, projects: readonly ProjectEntry[]): DiscoveredSession[] {
  const found: DiscoveredSession[] = [];
  for (const project of projects) {
    const dir = join(roots.claudeCode, claudeProjectDirName(project.dir));
    for (const path of listJsonl(dir)) {
      const info = statOf(path);
      if (!info) continue;
      found.push({
        id: basename(path, ".jsonl"),
        agent: "claude-code",
        path,
        projectId: project.name,
        ...info,
      });
    }
  }
  return found;
}

/**
 * Codex shards by date, not by project, so its sessions cannot be found by
 * asking about a project. The tree is walked and each session's project is
 * resolved afterwards from the `cwd` its own `session_meta` records.
 *
 * The walk is depth-bounded to the observed `YYYY/MM/DD` shape. An unbounded
 * recursion under a directory another tool owns is how a reader ends up
 * traversing something nobody intended it to see.
 */
function discoverCodex(roots: SessionRoots): DiscoveredSession[] {
  const found: DiscoveredSession[] = [];
  const walk = (dir: string, depth: number): void => {
    if (depth > 3) return;
    let entries: import("node:fs").Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(path, depth + 1);
      } else if (entry.isFile() && entry.name.startsWith("rollout-") && entry.name.endsWith(".jsonl")) {
        const info = statOf(path);
        if (info) found.push({ id: basename(path, ".jsonl"), agent: "codex", path, ...info });
      }
    }
  };
  if (existsSync(roots.codex)) walk(roots.codex, 0);
  return found;
}

export interface DiscoverOptions {
  readonly home: string;
  /** Restrict to these registry project names. */
  readonly projects?: readonly string[];
  readonly agents?: readonly SessionAgent[];
  readonly env?: NodeJS.ProcessEnv;
}

/**
 * Every readable session, newest first.
 *
 * Sorted by modification time because that is what a person means by "my recent
 * sessions", and because it is available from the stat already taken — deriving
 * it from file content would mean opening every session to list them.
 */
export function discoverSessions(options: DiscoverOptions): DiscoveredSession[] {
  const roots = sessionRoots(options.home, options.env);
  const agents = options.agents ?? SUPPORTED_AGENTS;
  const registry = readRegistry(options.home);
  const projects = options.projects
    ? registry.projects.filter((entry) => options.projects!.includes(entry.name))
    : registry.projects;

  const found: DiscoveredSession[] = [];
  if (agents.includes("claude-code")) found.push(...discoverClaudeCode(roots, projects));
  if (agents.includes("codex")) found.push(...discoverCodex(roots));
  return found.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
}
