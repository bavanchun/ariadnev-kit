import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  claudeProjectDirName,
  discoverSessions,
  sessionRoots,
  SUPPORTED_AGENTS,
  UNSUPPORTED_AGENTS,
} from "./discover.js";
import { registryPath } from "../projects/registry.js";

const dirs: string[] = [];
const mk = () => {
  const dir = mkdtempSync(join(tmpdir(), "ariadnev-discover-"));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A home with a registry, a Claude session tree, and a Codex session tree. */
function sandbox(projects: { name: string; dir: string }[] = []) {
  const home = mk();
  const env = { ARIADNEV_CLAUDE_HOME: join(home, ".claude"), ARIADNEV_CODEX_HOME: join(home, ".codex") };
  mkdirSync(join(home, ".ariadnev"), { recursive: true });
  writeFileSync(
    registryPath(home),
    JSON.stringify({
      version: 1,
      projects: projects.map((p) => ({
        ...p,
        registered_at: "2026-08-28T00:00:00.000Z",
        updated_at: "2026-08-28T00:00:00.000Z",
      })),
    }),
  );
  return { home, env };
}

function claudeSession(home: string, projectDir: string, id: string): string {
  const dir = join(home, ".claude", "projects", claudeProjectDirName(projectDir));
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${id}.jsonl`);
  writeFileSync(path, `${JSON.stringify({ type: "user" })}\n`);
  return path;
}

function codexSession(home: string, id: string): string {
  const dir = join(home, ".codex", "sessions", "2026", "08", "24");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `rollout-2026-08-24T14-19-20-${id}.jsonl`);
  writeFileSync(path, `${JSON.stringify({ type: "session_meta", payload: {} })}\n`);
  return path;
}

describe("which agents are supported", () => {
  it("supports exactly the two layouts the probe confirmed", () => {
    expect([...SUPPORTED_AGENTS]).toEqual(["claude-code", "codex"]);
  });

  it("names OpenCode as unsupported rather than omitting it", () => {
    // The oracle's `stats` reports an `opencode` row. Its layout was not found
    // on the machine this was built against, so it is declared unreadable — a
    // silent zero is indistinguishable from an agent nobody used.
    expect([...UNSUPPORTED_AGENTS]).toContain("opencode");
    expect(SUPPORTED_AGENTS as readonly string[]).not.toContain("opencode");
  });
});

describe("where discovery is rooted", () => {
  it("roots Codex at the sessions directory, never the agent home", () => {
    // `~/.codex/auth.json` lives one level above `~/.codex/sessions/`. Rooting
    // the walk at the sessions directory means the credential file is not
    // inside the traversal at all, rather than being excluded by a filter
    // someone has to keep correct.
    const roots = sessionRoots("/home/u");
    expect(roots.codex).toBe(join("/home/u", ".codex", "sessions"));
    expect(roots.codex.endsWith(join(".codex", "sessions"))).toBe(true);
  });

  it("never yields a file outside the sessions tree", () => {
    const { home, env } = sandbox();
    mkdirSync(join(home, ".codex"), { recursive: true });
    writeFileSync(join(home, ".codex", "auth.json"), JSON.stringify({ token: "must-not-be-read" }));
    codexSession(home, "aaa");

    const found = discoverSessions({ home, env });

    expect(found.map((s) => s.path)).not.toContain(join(home, ".codex", "auth.json"));
    expect(found.every((s) => s.path.includes(join(".codex", "sessions")) || s.path.includes(".claude"))).toBe(true);
  });
});

describe("claude-code discovery", () => {
  it("finds sessions for a registered project", () => {
    const projectDir = "/home/u/myapp";
    const { home, env } = sandbox([{ name: "myapp", dir: projectDir }]);
    claudeSession(home, projectDir, "abc");

    const found = discoverSessions({ home, env, agents: ["claude-code"] });

    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ id: "abc", agent: "claude-code", projectId: "myapp" });
  });

  it("finds nothing for a project that is not registered", () => {
    // Discovery follows the registry forwards. It never reads a directory name
    // and tries to turn it back into a path — a path segment containing a dash
    // is indistinguishable from a separator, so that reversal is ambiguous.
    const { home, env } = sandbox();
    claudeSession(home, "/home/u/unregistered", "abc");
    expect(discoverSessions({ home, env, agents: ["claude-code"] })).toEqual([]);
  });

  it("restricts to the named projects", () => {
    const { home, env } = sandbox([
      { name: "one", dir: "/home/u/one" },
      { name: "two", dir: "/home/u/two" },
    ]);
    claudeSession(home, "/home/u/one", "s1");
    claudeSession(home, "/home/u/two", "s2");

    const found = discoverSessions({ home, env, agents: ["claude-code"], projects: ["two"] });

    expect(found.map((s) => s.id)).toEqual(["s2"]);
  });

  it("ignores a non-jsonl file sitting in a session directory", () => {
    const { home, env } = sandbox([{ name: "myapp", dir: "/home/u/myapp" }]);
    claudeSession(home, "/home/u/myapp", "abc");
    writeFileSync(join(home, ".claude", "projects", claudeProjectDirName("/home/u/myapp"), "notes.md"), "x");
    expect(discoverSessions({ home, env, agents: ["claude-code"] }).map((s) => s.id)).toEqual(["abc"]);
  });
});

describe("codex discovery", () => {
  it("finds date-sharded rollout files without needing a registered project", () => {
    // Codex shards by date, so its sessions cannot be found by asking about a
    // project. The project is resolved later, from the cwd the session records.
    const { home, env } = sandbox();
    codexSession(home, "aaa");
    const found = discoverSessions({ home, env, agents: ["codex"] });
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ agent: "codex" });
    expect(found[0].id).toMatch(/^rollout-/);
  });

  it("ignores a jsonl file that is not a rollout", () => {
    const { home, env } = sandbox();
    const dir = join(home, ".codex", "sessions", "2026", "08", "24");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "history.jsonl"), "{}\n");
    expect(discoverSessions({ home, env, agents: ["codex"] })).toEqual([]);
  });

  it("does not recurse without bound under a directory another tool owns", () => {
    const { home, env } = sandbox();
    const deep = join(home, ".codex", "sessions", "a", "b", "c", "d", "e");
    mkdirSync(deep, { recursive: true });
    writeFileSync(join(deep, "rollout-x.jsonl"), "{}\n");
    expect(discoverSessions({ home, env, agents: ["codex"] })).toEqual([]);
  });
});

describe("missing roots", () => {
  it("reports nothing rather than throwing when an agent was never installed", () => {
    const { home, env } = sandbox([{ name: "myapp", dir: "/home/u/myapp" }]);
    expect(discoverSessions({ home, env })).toEqual([]);
  });
});
