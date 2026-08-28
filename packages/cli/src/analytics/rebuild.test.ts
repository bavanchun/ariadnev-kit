import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openIndex, rebuildIndex, refreshIndex } from "./rebuild.js";
import { analyticsStatus, deleteIndex, disableAnalytics, enableAnalytics, indexPath, readState } from "./lifecycle.js";
import { INDEX_SCHEMA_VERSION, readSchemaVersion } from "./index-schema.js";
import { activityRoot } from "../storage/operational-paths.js";
import { registryPath } from "../projects/registry.js";
import { claudeProjectDirName } from "../sessions/discover.js";

const dirs: string[] = [];
const mk = () => {
  const dir = mkdtempSync(join(tmpdir(), "ariadnev-analytics-"));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const NOW = "2026-08-28T00:00:00.000Z";
const PROJECT_DIR = "/home/u/myapp";

function seedActivity(home: string, day: string, events: unknown[]): void {
  mkdirSync(activityRoot(home), { recursive: true });
  // `activity-YYYYMMDD.jsonl` is the name the log actually writes and the only
  // one `listSegments` matches. An almost-right fixture name here made every
  // activity assertion below pass against an empty index.
  writeFileSync(segmentFile(home, day), `${events.map((e) => JSON.stringify(e)).join("\n")}\n`);
}

function segmentFile(home: string, day: string): string {
  return join(activityRoot(home), `activity-${day}.jsonl`);
}

function seedSession(home: string, id: string, records: unknown[], env: NodeJS.ProcessEnv): void {
  mkdirSync(join(home, ".ariadnev"), { recursive: true });
  writeFileSync(
    registryPath(home),
    JSON.stringify({
      version: 1,
      projects: [{ name: "myapp", dir: PROJECT_DIR, registered_at: NOW, updated_at: NOW }],
    }),
  );
  const dir = join(String(env.ARIADNEV_CLAUDE_HOME), "projects", claudeProjectDirName(PROJECT_DIR));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${id}.jsonl`), `${records.map((r) => JSON.stringify(r)).join("\n")}\n`);
}

function sandbox() {
  const home = mk();
  return { home, env: { ARIADNEV_CLAUDE_HOME: join(home, ".claude"), ARIADNEV_CODEX_HOME: join(home, ".codex") } };
}

const event = (kind: string, ts: string, runtime = "claude-code") => ({ v: 1, id: `${ts}-x`, ts, kind, runtime });
const userMsg = (ts: string) => ({ type: "user", timestamp: ts, message: { role: "user", content: "hi" } });
const assistantMsg = (ts: string) => ({
  type: "assistant", timestamp: ts,
  message: { role: "assistant", model: "claude-opus-5", content: [{ type: "text", text: "yes" }],
    usage: { input_tokens: 10, output_tokens: 5 } },
});

/** Every fact in the index, ordered so two builds compare by value. */
function facts(home: string): unknown[] {
  const database = openIndex(home);
  try {
    return database
      .prepare("SELECT source, source_id, kind, runtime, project, model, occurred_at, count, value FROM facts " +
        "ORDER BY source, source_id, kind, occurred_at")
      .all();
  } finally {
    database.close();
  }
}

describe("refresh and rebuild converge", () => {
  // The classic cache failure is an incremental path that drifts from the full
  // one, because both exist and only one runs daily. Here `rebuild` is
  // `refresh` with the skip-list emptied, and this is what holds them to it.

  it("land on the same rows from the same sources", () => {
    const a = sandbox();
    seedActivity(a.home, "20260828", [event("install.completed", NOW), event("workflow.completed", NOW)]);
    seedSession(a.home, "s1", [userMsg(NOW), assistantMsg("2026-08-28T00:00:05.000Z")], a.env);

    refreshIndex(a.home, { now: NOW, env: a.env });
    const incremental = facts(a.home);
    // Without this the whole case passes when both builds produce nothing,
    // which is exactly what a mistyped fixture name did once.
    expect(incremental.length, "the sources must actually produce facts").toBeGreaterThan(0);

    rebuildIndex(a.home, { now: NOW, env: a.env });
    expect(facts(a.home)).toEqual(incremental);
  });

  it("a second refresh changes nothing", () => {
    // Non-idempotent ingest is the bug that makes a cache quietly wrong rather
    // than obviously broken: every refresh would inflate the counts.
    const a = sandbox();
    seedActivity(a.home, "20260828", [event("install.completed", NOW)]);

    refreshIndex(a.home, { now: NOW, env: a.env });
    const once = facts(a.home);
    const second = refreshIndex(a.home, { now: NOW, env: a.env });

    expect(facts(a.home)).toEqual(once);
    expect(second.sourcesIngested, "an unchanged source is skipped").toBe(0);
  });

  it("re-reads a source whose content changed", () => {
    const a = sandbox();
    seedActivity(a.home, "20260828", [event("install.completed", NOW)]);
    refreshIndex(a.home, { now: NOW, env: a.env });
    expect(facts(a.home)).toHaveLength(1);

    seedActivity(a.home, "20260828", [event("install.completed", NOW), event("update.completed", NOW)]);
    refreshIndex(a.home, { now: "2026-08-28T01:00:00.000Z", env: a.env });

    expect(facts(a.home)).toHaveLength(2);
  });

  it("a full rebuild drops rows whose source is gone", () => {
    // An incremental pass cannot tell "deleted" from "not looked at", so only
    // the full one prunes. Without this a deleted session stays in every
    // aggregate forever.
    const a = sandbox();
    seedActivity(a.home, "20260828", [event("install.completed", NOW)]);
    seedActivity(a.home, "20260827", [event("update.completed", NOW)]);
    rebuildIndex(a.home, { now: NOW, env: a.env });
    expect(facts(a.home)).toHaveLength(2);

    rmSync(segmentFile(a.home, "20260827"));
    rebuildIndex(a.home, { now: NOW, env: a.env });

    expect(facts(a.home)).toHaveLength(1);
  });
});

describe("the index is never the only copy", () => {
  it("rebuilds to the same answer after being deleted outright", () => {
    const a = sandbox();
    seedActivity(a.home, "20260828", [event("install.completed", NOW)]);
    seedSession(a.home, "s1", [userMsg(NOW), assistantMsg("2026-08-28T00:00:05.000Z")], a.env);

    rebuildIndex(a.home, { now: NOW, env: a.env });
    const before = facts(a.home);

    deleteIndex(a.home);
    rebuildIndex(a.home, { now: NOW, env: a.env });

    expect(facts(a.home)).toEqual(before);
  });

  it("indexes no message text", () => {
    // A derived copy of the user's prose is a second place for it to leak from.
    const a = sandbox();
    seedSession(a.home, "s1", [
      { type: "user", timestamp: NOW, message: { role: "user", content: "SECRET-PROSE-MARKER and a token ghp_abcdefghijklmnopqrstuvwxyz01" } },
    ], a.env);
    rebuildIndex(a.home, { now: NOW, env: a.env });

    const serialized = JSON.stringify(facts(a.home));
    expect(serialized).not.toContain("SECRET-PROSE-MARKER");
    expect(serialized).not.toContain("ghp_");
  });
});

describe("schema", () => {
  it("stamps its version so a stale index is recognisable", () => {
    const a = sandbox();
    const database = openIndex(a.home);
    try {
      expect(readSchemaVersion(database)).toBe(INDEX_SCHEMA_VERSION);
    } finally {
      database.close();
    }
  });
});

describe("lifecycle", () => {
  it("is off until enabled", () => {
    const a = sandbox();
    expect(readState(a.home).enabled).toBe(false);
    expect(analyticsStatus(a.home).serving_mode).toBe("sources");
  });

  it("serves from the index only once enabled AND built", () => {
    const a = sandbox();
    enableAnalytics(a.home, NOW);
    expect(analyticsStatus(a.home)).toMatchObject({ enabled: true, health: "absent", serving_mode: "sources" });

    rebuildIndex(a.home, { now: NOW, env: a.env });
    expect(analyticsStatus(a.home)).toMatchObject({ health: "ready", serving_mode: "index" });
  });

  it("disable stops reads without deleting the index", () => {
    // Two different requests: "stop using this" and "get rid of this". Answering
    // the first with the second destroys work a re-enable would have restored.
    const a = sandbox();
    seedActivity(a.home, "20260828", [event("install.completed", NOW)]);
    enableAnalytics(a.home, NOW);
    rebuildIndex(a.home, { now: NOW, env: a.env });

    disableAnalytics(a.home, NOW);

    const status = analyticsStatus(a.home);
    expect(status.serving_mode).toBe("sources");
    expect(status.health, "the index is still there").toBe("ready");
    expect(status.fact_count).toBe(1);
  });

  it("delete removes the index without changing the user's setting", () => {
    // The state file lives outside `derived/` precisely so that deleting the
    // index — advertised as always safe — cannot silently switch analytics on.
    const a = sandbox();
    disableAnalytics(a.home, NOW);
    rebuildIndex(a.home, { now: NOW, env: a.env });

    deleteIndex(a.home);

    expect(readState(a.home).enabled, "still disabled").toBe(false);
    expect(analyticsStatus(a.home).health).toBe("absent");
  });

  it("keeps a disabled setting through an index rebuild", () => {
    const a = sandbox();
    disableAnalytics(a.home, NOW);
    rebuildIndex(a.home, { now: NOW, env: a.env });
    expect(readState(a.home).enabled).toBe(false);
  });

  it("reports a corrupt index as corrupt, not absent", () => {
    // Three states, three fixes: enable it, re-enable it, delete and rebuild.
    // Collapsing them makes `status` useless exactly when someone needs it.
    const a = sandbox();
    rebuildIndex(a.home, { now: NOW, env: a.env });
    writeFileSync(indexPath(a.home), "this is not a database");
    expect(analyticsStatus(a.home).health).toBe("corrupt");
  });

  it("distinguishes absent, disabled and corrupt in the reason it gives", () => {
    const a = sandbox();
    expect(analyticsStatus(a.home).staleness_reason).toMatch(/disabled/);

    enableAnalytics(a.home, NOW);
    expect(analyticsStatus(a.home).staleness_reason).toMatch(/no index/);

    rebuildIndex(a.home, { now: NOW, env: a.env });
    expect(analyticsStatus(a.home).staleness_reason).toBeUndefined();

    writeFileSync(indexPath(a.home), "not a database");
    expect(analyticsStatus(a.home).staleness_reason).toMatch(/could not be read/);
  });
});

describe("the index is private", () => {
  it("is 0600, and so are its WAL companions", () => {
    // SQLite creates these itself, so they land at whatever the umask allows —
    // measured as 0644 on the machine this was built on. The index summarises
    // the user's sessions; on a shared host that default is world-readable.
    const a = sandbox();
    seedActivity(a.home, "20260828", [event("install.completed", NOW)]);
    rebuildIndex(a.home, { now: NOW, env: a.env });

    if (process.platform === "win32") return;
    for (const suffix of ["", "-wal", "-shm"]) {
      const path = `${indexPath(a.home)}${suffix}`;
      if (!existsSync(path)) continue;
      expect(statSync(path).mode & 0o777, path).toBe(0o600);
    }
  });
});
