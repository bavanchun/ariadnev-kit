import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  runAnalyticsDelete,
  runAnalyticsDisable,
  runAnalyticsEnable,
  runAnalyticsRebuild,
  runAnalyticsRefresh,
  runAnalyticsStatus,
} from "./analytics-command.js";
import { runDataIngest, runDataRetention, runDataStatus } from "./data-command.js";
import { runSessionsStats } from "./sessions-command.js";
import { indexPath, statePath } from "../analytics/lifecycle.js";
import { activityRoot } from "../storage/operational-paths.js";

const dirs: string[] = [];
const mk = () => {
  const dir = mkdtempSync(join(tmpdir(), "ariadnev-anacmd-"));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const NOW = "2026-08-28T00:00:00.000Z";
const base = (home: string) => ({ home, now: NOW, env: {} as NodeJS.ProcessEnv });

function seed(home: string, day = "20260828"): void {
  mkdirSync(activityRoot(home), { recursive: true });
  writeFileSync(
    join(activityRoot(home), `activity-${day}.jsonl`),
    `${JSON.stringify({ v: 1, id: "1", ts: `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}T00:00:00.000Z`, kind: "install.completed", runtime: "claude-code" })}\n`,
  );
}

const data = (out: string) => (JSON.parse(out) as { data: Record<string, unknown> }).data;

describe("opt-in", () => {
  it("refuses to build an index nobody asked for", () => {
    // "Opt-in" means the index is not created until enabled, and doing it
    // silently would be worse than refusing.
    const home = mk();
    seed(home);
    expect(() => runAnalyticsRebuild(base(home))).toThrow(/disabled/);
    expect(() => runAnalyticsRefresh(base(home))).toThrow(/disabled/);
    expect(() => runDataIngest(base(home))).toThrow(/disabled/);
  });

  it("reports disabled without creating anything", () => {
    // `status` is what someone runs when something is wrong; it must not be
    // the thing that changes state.
    const home = mk();
    const out = runAnalyticsStatus(base(home));
    expect(out).toMatch(/disabled/);
    expect(() => statSync(indexPath(home))).toThrow();
  });
});

describe("status distinguishes the states that need different fixes", () => {
  it("names the command that fixes each one", () => {
    const home = mk();
    seed(home);
    expect(runAnalyticsStatus(base(home))).toContain("av analytics enable");

    runAnalyticsEnable(base(home));
    expect(runAnalyticsStatus(base(home))).toContain("av analytics rebuild");

    runAnalyticsRebuild(base(home));
    expect(runAnalyticsStatus(base(home))).not.toMatch(/fix/);

    writeFileSync(indexPath(home), "not a database");
    expect(runAnalyticsStatus(base(home))).toContain("av analytics delete");
  });

  it("carries one schema_version, at the top", () => {
    // The captured `analytics status` repeats it inside `data`. Two copies of a
    // number that is always equal can only ever disagree.
    const home = mk();
    const parsed = JSON.parse(runAnalyticsStatus({ ...base(home), json: true })) as {
      schema_version: number; kind: string; data: Record<string, unknown>;
    };
    expect(parsed.kind).toBe("analytics.status");
    expect(parsed.data).not.toHaveProperty("schema_version");
  });
});

describe("disable and delete are different requests", () => {
  it("disable keeps the index, and says so", () => {
    const home = mk();
    seed(home);
    runAnalyticsEnable(base(home));
    runAnalyticsRebuild(base(home));

    const out = runAnalyticsDisable(base(home));

    expect(out).toMatch(/kept/);
    expect(statSync(indexPath(home)).size).toBeGreaterThan(0);
  });

  it("delete removes the index and leaves the setting alone", () => {
    const home = mk();
    seed(home);
    runAnalyticsEnable(base(home));
    runAnalyticsRebuild(base(home));

    const out = runAnalyticsDelete({ ...base(home), json: true });

    expect(data(out)).toMatchObject({ removed: true, enabled: true });
    expect(() => statSync(indexPath(home))).toThrow();
    // The setting survives, because it never lived under derived/.
    expect(statSync(statePath(home)).size).toBeGreaterThan(0);
  });

  it("delete on a machine with no index says so rather than failing", () => {
    expect(runAnalyticsDelete(base(mk()))).toMatch(/No analytics index/);
  });
});

describe("data status", () => {
  it("emits the envelope, where the captured surface emits a bare array", () => {
    // Matching a one-off array would mean exempting this command from the gate
    // that exists to keep every command on one shape.
    const home = mk();
    const parsed = JSON.parse(runDataStatus({ ...base(home), json: true })) as {
      schema_version: number; kind: string; data: { classes: unknown[]; default: string };
    };
    expect(parsed.kind).toBe("data.status");
    expect(parsed.data.classes).toHaveLength(7);
    expect(parsed.data.default).toBe("forever");
  });
});

describe("data retention", () => {
  it("previews without removing, and applies what it previewed", () => {
    const home = mk();
    seed(home, "20260101");
    seed(home, "20260828");

    const preview = data(runDataRetention({ ...base(home), dataClass: "change_log", days: 30, json: true })) as {
      eligible: number; applied: boolean; segments: string[];
    };
    expect(preview).toMatchObject({ eligible: 1, applied: false });

    const applied = data(runDataRetention({ ...base(home), dataClass: "change_log", days: 30, apply: true, json: true })) as {
      eligible: number; applied: boolean;
    };
    expect(applied).toMatchObject({ eligible: 1, applied: true });
    expect(data(runDataRetention({ ...base(home), dataClass: "change_log", days: 30, json: true })).eligible).toBe(0);
  });

  it("prunes nothing by default, because the default is forever", () => {
    const home = mk();
    seed(home, "20200101");
    const out = runDataRetention({ ...base(home), dataClass: "change_log", apply: true });
    expect(out).toMatch(/forever/);
    expect(statSync(join(activityRoot(home), "activity-20200101.jsonl")).size).toBeGreaterThan(0);
  });

  it("rejects a class name that is not one of the seven", () => {
    expect(() => runDataRetention({ ...base(mk()), dataClass: "session_metric" })).toThrow(/unknown --class/);
  });

  it("rejects a negative or fractional --days", () => {
    expect(() => runDataRetention({ ...base(mk()), dataClass: "change_log", days: -1 })).toThrow(/whole number/);
    expect(() => runDataRetention({ ...base(mk()), dataClass: "change_log", days: 1.5 })).toThrow(/whole number/);
  });

  it("says a preview removed nothing", () => {
    const home = mk();
    seed(home, "20260101");
    expect(runDataRetention({ ...base(home), dataClass: "change_log", days: 30 })).toMatch(/nothing was removed/i);
  });
});

describe("the index answers what the scan answers", () => {
  // Wiring a second read path is only safe because this holds it to the first.
  // The scan is the reference implementation; the index is a shortcut to the
  // same answer, and a shortcut that disagrees is a bug in the shortcut.

  function withSessions(home: string) {
    mkdirSync(join(home, ".ariadnev"), { recursive: true });
    writeFileSync(
      join(home, ".ariadnev", "projects.json"),
      JSON.stringify({
        version: 1,
        projects: [{ name: "myapp", dir: "/home/u/myapp", registered_at: NOW, updated_at: NOW }],
      }),
    );
    const env = { ARIADNEV_CLAUDE_HOME: join(home, ".claude"), ARIADNEV_CODEX_HOME: join(home, ".codex") };
    const dir = join(home, ".claude", "projects", "-home-u-myapp");
    mkdirSync(dir, { recursive: true });
    for (const [id, count] of [["s1", 2], ["s2", 3]] as const) {
      const records = Array.from({ length: count }, (_, i) => ({
        type: i % 2 === 0 ? "user" : "assistant",
        timestamp: `2026-08-28T00:00:0${i}.000Z`,
        message: i % 2 === 0
          ? { role: "user", content: "hi" }
          : { role: "assistant", model: "claude-opus-5", content: [{ type: "text", text: "yes" }], usage: { input_tokens: 7, output_tokens: 3 } },
      }));
      writeFileSync(join(dir, `${id}.jsonl`), `${records.map((r) => JSON.stringify(r)).join("\n")}\n`);
    }
    return env;
  }

  for (const metric of ["messages", "sessions", "duration", "tokens"] as const) {
    for (const by of ["runtime", "model", "project"] as const) {
      it(`agrees for --metric ${metric} --by ${by}`, () => {
        const home = mk();
        const env = withSessions(home);

        const fromScan = runSessionsStats({ home, env, metric, by, json: true });

        runAnalyticsEnable({ home, now: NOW });
        runAnalyticsRebuild({ home, now: NOW, env });
        const fromIndex = runSessionsStats({ home, env, metric, by, json: true });

        expect(JSON.parse(fromIndex)).toEqual(JSON.parse(fromScan));
      });
    }
  }

  it("goes back to the scan when the index is deleted mid-life", () => {
    const home = mk();
    const env = withSessions(home);
    runAnalyticsEnable({ home, now: NOW });
    runAnalyticsRebuild({ home, now: NOW, env });
    const served = runSessionsStats({ home, env, metric: "messages", json: true });

    runAnalyticsDelete({ home, now: NOW });

    expect(JSON.parse(runSessionsStats({ home, env, metric: "messages", json: true }))).toEqual(JSON.parse(served));
  });

  it("goes back to the scan when analytics is disabled", () => {
    const home = mk();
    const env = withSessions(home);
    runAnalyticsEnable({ home, now: NOW });
    runAnalyticsRebuild({ home, now: NOW, env });
    const served = runSessionsStats({ home, env, metric: "messages", json: true });

    runAnalyticsDisable({ home, now: NOW });

    expect(JSON.parse(runSessionsStats({ home, env, metric: "messages", json: true }))).toEqual(JSON.parse(served));
  });
});
