import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  runSessionsList,
  runSessionsRedact,
  runSessionsShow,
  runSessionsStats,
  tailSession,
} from "./sessions-command.js";
import { claudeProjectDirName } from "../sessions/discover.js";
import { registryPath } from "../projects/registry.js";

const dirs: string[] = [];
const mk = () => {
  const dir = mkdtempSync(join(tmpdir(), "ariadnev-sesscmd-"));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const PROJECT_DIR = "/home/u/myapp";

function sandbox() {
  const home = mk();
  const env = { ARIADNEV_CLAUDE_HOME: join(home, ".claude"), ARIADNEV_CODEX_HOME: join(home, ".codex") };
  mkdirSync(join(home, ".ariadnev"), { recursive: true });
  writeFileSync(
    registryPath(home),
    JSON.stringify({
      version: 1,
      projects: [{ name: "myapp", dir: PROJECT_DIR, registered_at: "2026-08-28T00:00:00.000Z", updated_at: "2026-08-28T00:00:00.000Z" }],
    }),
  );
  return { home, env };
}

const user = (text: string, ts = "2026-08-28T00:00:00.000Z") => ({
  type: "user", timestamp: ts, message: { role: "user", content: text },
});
const assistant = (text: string, ts = "2026-08-28T00:00:01.000Z", usage?: unknown) => ({
  type: "assistant", timestamp: ts,
  message: { role: "assistant", model: "claude-opus-5", content: [{ type: "text", text }], usage },
});

function writeSession(home: string, id: string, records: unknown[]): string {
  const dir = join(home, ".claude", "projects", claudeProjectDirName(PROJECT_DIR));
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${id}.jsonl`);
  writeFileSync(path, `${records.map((r) => JSON.stringify(r)).join("\n")}\n`);
  return path;
}

describe("list", () => {
  it("omits the preview by default", () => {
    // `ak sessions list --json` printed a sentence written seconds earlier in
    // the live session, plus prose from two unrelated projects. Absent by
    // default is the fix.
    const { home, env } = sandbox();
    writeSession(home, "abc", [user("something private and identifying")]);

    const out = runSessionsList({ home, env, json: true });

    expect(out).not.toContain("something private");
    expect(out).not.toContain("last_message_preview");
  });

  it("includes a truncated preview only when asked", () => {
    const { home, env } = sandbox();
    writeSession(home, "abc", [user("hello there")]);
    const out = runSessionsList({ home, env, json: true, preview: true });
    expect(out).toContain("last_message_preview");
    expect(out).toContain("hello there");
  });

  it("carries no schema_version inside data", () => {
    const { home, env } = sandbox();
    const parsed = JSON.parse(runSessionsList({ home, env, json: true })) as { kind: string; data: Record<string, unknown> };
    expect(parsed.kind).toBe("sessions.list");
    expect(parsed.data).not.toHaveProperty("schema_version");
  });

  it("says an unreadable runtime is unreadable, rather than returning nothing", () => {
    // An empty list is indistinguishable from an agent nobody used.
    const { home, env } = sandbox();
    expect(() => runSessionsList({ home, env, runtime: "opencode" })).toThrow(/not one this build has verified/);
  });

  it("rejects a runtime that is not an agent at all", () => {
    const { home, env } = sandbox();
    expect(() => runSessionsList({ home, env, runtime: "nonsense" })).toThrow(/unknown runtime/);
  });
});

describe("show", () => {
  it("pages messages and offers the next cursor", () => {
    const { home, env } = sandbox();
    writeSession(home, "abc", [user("one"), assistant("two"), user("three"), assistant("four")]);

    const parsed = JSON.parse(
      runSessionsShow({ home, env, project: "myapp", sessionId: "abc", limit: 2, json: true }),
    ) as { data: { messages: { text: string }[]; next_cursor?: number } };

    expect(parsed.data.messages.map((m) => m.text)).toEqual(["one", "two"]);
    expect(parsed.data.next_cursor).toBe(2);
  });

  it("counts --limit in messages, not lines", () => {
    // A real session opens with several metadata records. When the limit
    // counted lines, `--limit 2` returned an empty page from a 21 MB file full
    // of conversation — the flag did not mean what its own help said.
    const { home, env } = sandbox();
    writeSession(home, "abc", [
      { type: "mode", sessionId: "abc" },
      { type: "bridge-session" },
      { type: "attachment" },
      user("first real message"),
      assistant("second real message"),
      user("third"),
    ]);

    const parsed = JSON.parse(
      runSessionsShow({ home, env, project: "myapp", sessionId: "abc", limit: 2, json: true }),
    ) as { data: { messages: { text: string }[]; next_cursor?: number } };

    expect(parsed.data.messages.map((m) => m.text)).toEqual(["first real message", "second real message"]);
    expect(parsed.data.next_cursor).toBe(5);
  });

  it("resumes past the metadata it skipped, rather than re-reading it", () => {
    const { home, env } = sandbox();
    writeSession(home, "abc", [{ type: "mode" }, user("one"), { type: "attachment" }, user("two")]);
    const first = JSON.parse(
      runSessionsShow({ home, env, project: "myapp", sessionId: "abc", limit: 1, json: true }),
    ) as { data: { next_cursor: number } };
    const second = JSON.parse(
      runSessionsShow({ home, env, project: "myapp", sessionId: "abc", cursor: first.data.next_cursor, limit: 1, json: true }),
    ) as { data: { messages: { text: string }[] } };
    expect(second.data.messages.map((m) => m.text)).toEqual(["two"]);
  });

  it("skips the record types that are not conversation", () => {
    const { home, env } = sandbox();
    writeSession(home, "abc", [{ type: "attachment" }, user("real message"), { type: "mode" }]);
    const parsed = JSON.parse(runSessionsShow({ home, env, project: "myapp", sessionId: "abc", json: true })) as {
      data: { messages: { text: string }[] };
    };
    expect(parsed.data.messages.map((m) => m.text)).toEqual(["real message"]);
  });

  it("fails clearly for a session that is not there", () => {
    const { home, env } = sandbox();
    expect(() => runSessionsShow({ home, env, project: "myapp", sessionId: "ghost" })).toThrow(/no session ghost/);
  });
});

describe("stats", () => {
  it("aggregates messages by runtime", () => {
    const { home, env } = sandbox();
    writeSession(home, "a", [user("1"), assistant("2")]);
    writeSession(home, "b", [user("3")]);

    const parsed = JSON.parse(runSessionsStats({ home, env, metric: "messages", json: true })) as {
      data: { rows: { key: string; value: number; quality: string }[]; total: number };
    };

    expect(parsed.data.rows).toEqual([{ metric: "messages", dimension: "runtime", key: "claude-code", value: 3, quality: "exact" }]);
    expect(parsed.data.total).toBe(3);
  });

  it("names an unreadable runtime in the envelope", () => {
    const { home, env } = sandbox();
    writeSession(home, "a", [user("1")]);
    const parsed = JSON.parse(runSessionsStats({ home, env, json: true })) as {
      data: { unreadable_runtimes: string[] };
    };
    expect(parsed.data.unreadable_runtimes).toContain("opencode");
  });

  it("rejects an unknown metric and dimension by name", () => {
    const { home, env } = sandbox();
    expect(() => runSessionsStats({ home, env, metric: "vibes" })).toThrow(/unknown --metric/);
    expect(() => runSessionsStats({ home, env, by: "phase-of-moon" })).toThrow(/unknown --by/);
  });
});

describe("redact", () => {
  it("reports findings and changes nothing", () => {
    const { home, env } = sandbox();
    const path = writeSession(home, "abc", [user("token ghp_abcdefghijklmnopqrstuvwxyz01")]);
    const before = readFileSync(path);

    const out = runSessionsRedact({ home, env });

    expect(out).toContain("1 finding");
    expect(out).toContain("does not rewrite");
    expect(readFileSync(path).equals(before)).toBe(true);
  });

  it("reports applied:false in the envelope, and never the secret", () => {
    const { home, env } = sandbox();
    writeSession(home, "abc", [user("token ghp_abcdefghijklmnopqrstuvwxyz01")]);
    const out = runSessionsRedact({ home, env, json: true });
    expect(JSON.parse(out).data.applied).toBe(false);
    expect(out).not.toContain("ghp_");
  });
});

describe("tail", () => {
  it("prints only what was appended after it started", async () => {
    const { home, env } = sandbox();
    const path = writeSession(home, "abc", [user("before tail started")]);

    const controller = new AbortController();
    const lines: string[] = [];
    let polls = 0;
    const sleep = async () => {
      polls += 1;
      if (polls === 1) appendFileSync(path, `${JSON.stringify(assistant("appended after"))}\n`);
      if (polls >= 3) controller.abort();
    };

    await tailSession({
      home, env, project: "myapp", sessionId: "abc",
      onLine: (line) => lines.push(line), signal: controller.signal, sleep,
    });

    expect(lines.join("\n")).toContain("appended after");
    expect(lines.join("\n")).not.toContain("before tail started");
  });

  it("starts over rather than reading mid-record when the file shrinks", async () => {
    // The owner can truncate or replace its own session file. Continuing from a
    // stale byte offset would read the middle of a record as if it were the
    // start of one.
    const { home, env } = sandbox();
    const path = writeSession(home, "abc", [user("a"), user("b"), user("c")]);

    const controller = new AbortController();
    const lines: string[] = [];
    let polls = 0;
    const sleep = async () => {
      polls += 1;
      if (polls === 1) writeFileSync(path, `${JSON.stringify(user("fresh start"))}\n`);
      if (polls >= 3) controller.abort();
    };

    await tailSession({
      home, env, project: "myapp", sessionId: "abc",
      onLine: (line) => lines.push(line), signal: controller.signal, sleep,
    });

    expect(lines.join("\n")).toContain("fresh start");
  });
});
