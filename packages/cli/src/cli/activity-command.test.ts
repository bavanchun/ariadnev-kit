import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { appendActivityEvent, segmentPath } from "../activity/event-log.js";
import { toActivityEvent } from "../activity/event-types.js";
import {
  computeActivityStats,
  DEFAULT_LIST_LIMIT,
  parseWindow,
  runActivityList,
  runActivityStats,
  tailActivity,
} from "./activity-command.js";
import { UsageError } from "./exit-codes.js";

const dirs: string[] = [];
const mk = () => {
  const dir = mkdtempSync(join(tmpdir(), "ariadnev-activity-cmd-"));
  dirs.push(dir);
  return dir;
};

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const at = (iso: string) => new Date(iso);

function seed(home: string, when: string, fields: Record<string, unknown> = {}) {
  const date = at(when);
  const event = toActivityEvent("workflow.completed", fields, date);
  appendActivityEvent(home, event, date);
  return event;
}

describe("av activity list", () => {
  it("says so cleanly on an empty log, and creates nothing", () => {
    // Matches the oracle exactly: a message, exit 0, not an error. And an
    // inspection command must not be what brings the storage directory into
    // existence.
    const home = mk();
    expect(runActivityList({ home })).toBe("No activity events found.");
    expect(existsSync(join(home, ".ariadnev"))).toBe(false);
  });

  it("emits the shared envelope, not a private shape", () => {
    const home = mk();
    seed(home, "2026-08-28T10:00:00.000Z", { runtime: "codex" });
    const parsed = JSON.parse(runActivityList({ home, json: true }));
    expect(parsed.schema_version).toBe(1);
    expect(parsed.kind).toBe("activity.list");
    expect(parsed.data.total).toBe(1);
    expect(parsed.data.events[0]).toMatchObject({ v: 1, kind: "workflow.completed", runtime: "codex" });
  });

  it("returns an empty envelope rather than a message under --json", () => {
    // A machine consumer parses stdout. Handing it prose on the empty case is
    // how a script that works for a week breaks on a fresh install.
    const parsed = JSON.parse(runActivityList({ home: mk(), json: true }));
    expect(parsed.data).toMatchObject({ events: [], total: 0 });
  });

  it("defaults to a finite snapshot", () => {
    expect(DEFAULT_LIST_LIMIT).toBe(100);
  });

  it("rejects a limit that is not a positive integer", () => {
    const home = mk();
    for (const limit of [0, -1, 1.5]) {
      expect(() => runActivityList({ home, limit })).toThrow(UsageError);
    }
  });
});

describe("--window parsing", () => {
  it("understands the units the oracle documents", () => {
    expect(parseWindow("24h")).toBe(24 * 60 * 60 * 1000);
    expect(parseWindow("7d")).toBe(7 * 24 * 60 * 60 * 1000);
    expect(parseWindow("2w")).toBe(14 * 24 * 60 * 60 * 1000);
    expect(parseWindow(undefined)).toBe(parseWindow("7d"));
  });

  it("rejects a window it does not understand instead of defaulting", () => {
    // Silently falling back to 7d reports real numbers for the wrong period,
    // which a user has no way to notice.
    for (const bad of ["7", "d", "0d", "-1d", "7 days", "1m"]) {
      expect(() => parseWindow(bad), bad).toThrow(UsageError);
    }
  });
});

describe("av activity stats", () => {
  it("aggregates by kind, runtime and kit", () => {
    const home = mk();
    const now = at("2026-08-28T12:00:00.000Z");
    seed(home, "2026-08-28T10:00:00.000Z", { runtime: "codex", kit: "engineer" });
    seed(home, "2026-08-28T11:00:00.000Z", { runtime: "codex", kit: "engineer" });
    seed(home, "2026-08-28T11:30:00.000Z", { runtime: "claude-code", kit: "engineer" });
    const result = computeActivityStats({ home, now });
    expect(result.total).toBe(3);
    expect(result.rows[0]).toMatchObject({ runtime: "codex", kit: "engineer", count: 2 });
  });

  it("excludes events outside the window", () => {
    const home = mk();
    seed(home, "2026-08-01T10:00:00.000Z", { runtime: "codex" });
    seed(home, "2026-08-28T10:00:00.000Z", { runtime: "codex" });
    expect(computeActivityStats({ home, window: "24h", now: at("2026-08-28T12:00:00.000Z") }).total).toBe(1);
  });

  it("filters by --kit and --runtime", () => {
    const home = mk();
    const now = at("2026-08-28T12:00:00.000Z");
    seed(home, "2026-08-28T10:00:00.000Z", { runtime: "codex", kit: "engineer" });
    seed(home, "2026-08-28T10:30:00.000Z", { runtime: "claude-code", kit: "marketing" });
    expect(computeActivityStats({ home, now, kit: "engineer" }).total).toBe(1);
    expect(computeActivityStats({ home, now, runtime: "claude-code" }).total).toBe(1);
    expect(computeActivityStats({ home, now, runtime: "nobody" }).total).toBe(0);
  });

  it("reports one source, not a source it does not have", () => {
    // The oracle lists a session-log source too. Claiming it before it exists
    // would report full coverage over data never read.
    const home = mk();
    seed(home, "2026-08-28T10:00:00.000Z");
    const coverage = computeActivityStats({ home, now: at("2026-08-28T12:00:00.000Z") }).coverage;
    expect(coverage.sources.map((source) => source.source)).toEqual(["activitylog"]);
  });

  it("counts what it could not read, rather than under-reporting in silence", () => {
    const home = mk();
    const when = at("2026-08-28T10:00:00.000Z");
    seed(home, "2026-08-28T10:00:00.000Z");
    writeFileSync(segmentPath(home, when), `${JSON.stringify({ nope: true }).slice(0, 6)}\n`, { flag: "a" });
    const coverage = computeActivityStats({ home, now: at("2026-08-28T12:00:00.000Z") }).coverage;
    expect(coverage.sources[0]).toMatchObject({ parsed: 1, skipped: 1 });
  });

  it("emits the shared envelope with its coverage", () => {
    const home = mk();
    seed(home, "2026-08-28T10:00:00.000Z", { runtime: "codex" });
    const parsed = JSON.parse(runActivityStats({ home, json: true, now: at("2026-08-28T12:00:00.000Z") }));
    expect(parsed.kind).toBe("activity.stats");
    expect(parsed.data.coverage.sources[0].source).toBe("activitylog");
    expect(parsed.data.rows[0].count).toBe(1);
  });
});

describe("av activity tail", () => {
  it("streams only events appended after it started", async () => {
    const home = mk();
    seed(home, "2026-08-28T10:00:00.000Z", { runtime: "before" });

    const lines: string[] = [];
    const controller = new AbortController();
    let tick = 0;
    const sleep = async () => {
      tick += 1;
      if (tick === 1) seed(home, "2026-08-28T11:00:00.000Z", { runtime: "after" });
      if (tick >= 2) controller.abort();
    };

    await tailActivity({ home, signal: controller.signal, onLine: (line) => lines.push(line), sleep });
    expect(lines.join("\n")).toContain("after");
    expect(lines.join("\n")).not.toContain("before");
  });

  it("survives the midnight segment rollover", async () => {
    // The bug this design exists to avoid: following a file by handle goes
    // quiet at 00:00 when writes move to the next day's segment. A cursor
    // re-lists the segments each tick, so a new file is just more events.
    const home = mk();
    seed(home, "2026-08-28T23:59:00.000Z", { runtime: "yesterday" });

    const lines: string[] = [];
    const controller = new AbortController();
    let tick = 0;
    const sleep = async () => {
      tick += 1;
      if (tick === 1) seed(home, "2026-08-29T00:01:00.000Z", { runtime: "tomorrow" });
      if (tick >= 2) controller.abort();
    };

    await tailActivity({ home, signal: controller.signal, onLine: (line) => lines.push(line), sleep });
    expect(lines.join("\n")).toContain("tomorrow");
  });

  it("streams newest-last, so a terminal reads in the order things happened", async () => {
    const home = mk();
    const lines: string[] = [];
    const controller = new AbortController();
    let tick = 0;
    const sleep = async () => {
      tick += 1;
      if (tick === 1) {
        seed(home, "2026-08-28T10:00:00.000Z", { runtime: "first" });
        seed(home, "2026-08-28T10:00:01.000Z", { runtime: "second" });
      }
      if (tick >= 2) controller.abort();
    };

    await tailActivity({ home, signal: controller.signal, onLine: (line) => lines.push(line), sleep });
    expect(lines.findIndex((line) => line.includes("first"))).toBeLessThan(lines.findIndex((line) => line.includes("second")));
  });

  it("emits one JSON object per line under --json", async () => {
    const home = mk();
    const lines: string[] = [];
    const controller = new AbortController();
    let tick = 0;
    const sleep = async () => {
      tick += 1;
      if (tick === 1) seed(home, "2026-08-28T10:00:00.000Z", { runtime: "codex" });
      if (tick >= 2) controller.abort();
    };

    await tailActivity({ home, json: true, signal: controller.signal, onLine: (line) => lines.push(line), sleep });
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toMatchObject({ kind: "workflow.completed", runtime: "codex" });
  });

  it("stops when its signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const lines: string[] = [];
    await tailActivity({ home: mk(), signal: controller.signal, onLine: (line) => lines.push(line) });
    expect(lines).toEqual([]);
  });
});
