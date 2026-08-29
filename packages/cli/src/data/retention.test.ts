import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { allPolicies, DATA_CLASSES, isDataClass, runRetention } from "./retention.js";
import { rebuildIndex } from "../analytics/rebuild.js";
import { activityRoot } from "../storage/operational-paths.js";

const dirs: string[] = [];
const mk = () => {
  const dir = mkdtempSync(join(tmpdir(), "ariadnev-retention-"));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const NOW = new Date("2026-08-28T00:00:00.000Z");

function seedSegment(home: string, day: string, count = 1): void {
  mkdirSync(activityRoot(home), { recursive: true });
  const events = Array.from({ length: count }, (_, i) => ({
    v: 1, id: `${day}-${i}`, ts: `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}T00:00:00.000Z`,
    kind: "install.completed", runtime: "claude-code",
  }));
  writeFileSync(join(activityRoot(home), `activity-${day}.jsonl`), `${events.map((e) => JSON.stringify(e)).join("\n")}\n`);
}

const segmentsOn = (home: string) =>
  existsSync(activityRoot(home)) ? readdirSync(activityRoot(home)).sort() : [];

describe("the seven classes", () => {
  it("are the ones the captured surface reports, and default to forever", () => {
    expect([...DATA_CLASSES]).toEqual([
      "session_metrics", "skill_invocations", "ingestion_runs",
      "ingestion_failures", "change_log", "outbox", "content_shard",
    ]);
    expect(allPolicies().every((policy) => policy.mode === "forever" && policy.forever)).toBe(true);
  });

  it("rejects a class name that is not one of them", () => {
    // A typo must be an error the user sees, not an empty result that reads
    // like "nothing to prune".
    expect(isDataClass("session_metric")).toBe(false);
    expect(isDataClass("session_metrics")).toBe(true);
  });
});

describe("forever prunes nothing", () => {
  it("removes nothing and says why, with no --days", () => {
    const home = mk();
    seedSegment(home, "20200101");
    const preview = runRetention({ home, dataClass: "change_log", now: NOW });
    expect(preview.eligible).toBe(0);
    expect(preview.note).toMatch(/forever/);
    expect(segmentsOn(home)).toHaveLength(1);
  });

  it("removes nothing even with --apply, because nothing is eligible", () => {
    const home = mk();
    seedSegment(home, "20200101");
    runRetention({ home, dataClass: "change_log", apply: true, now: NOW });
    expect(segmentsOn(home)).toHaveLength(1);
  });
});

describe("segments are unlinked whole, never rewritten", () => {
  // Rewriting an append-only log to drop its older half means replacing a file
  // a live process may be appending to. Whole-file granularity cannot tear
  // anything; it costs precision to day boundaries, which is the right trade.

  it("previews the old segments without touching them", () => {
    const home = mk();
    seedSegment(home, "20260101");
    seedSegment(home, "20260827");

    const preview = runRetention({ home, dataClass: "change_log", days: 30, now: NOW });

    expect(preview.eligible).toBe(1);
    expect(preview.segments).toEqual(["activity-20260101.jsonl"]);
    expect(preview.applied).toBe(false);
    expect(segmentsOn(home), "preview changes nothing").toHaveLength(2);
  });

  it("unlinks exactly the segments the preview named", () => {
    // Preview and apply share one body, so what --apply removes cannot differ
    // from what the preview promised.
    const home = mk();
    seedSegment(home, "20260101");
    seedSegment(home, "20260827");

    const applied = runRetention({ home, dataClass: "change_log", days: 30, apply: true, now: NOW });

    expect(applied.applied).toBe(true);
    expect(segmentsOn(home)).toEqual(["activity-20260827.jsonl"]);
  });

  it("leaves a surviving segment byte-identical", () => {
    const home = mk();
    seedSegment(home, "20260101");
    seedSegment(home, "20260827", 3);
    const path = join(activityRoot(home), "activity-20260827.jsonl");
    const before = readdirSync(activityRoot(home)).length;
    const contentBefore = existsSync(path);

    runRetention({ home, dataClass: "change_log", days: 30, apply: true, now: NOW });

    expect(contentBefore).toBe(true);
    expect(before).toBe(2);
    // The kept file is the same file, not a filtered rewrite of it.
    expect(existsSync(path)).toBe(true);
  });

  it("decides age from the segment's name, not its mtime", () => {
    // A backup, a copy, or a restore touches mtime without changing what is
    // inside. Age has to come from the day the segment is named for.
    const home = mk();
    seedSegment(home, "20260101");
    // The file was just written, so its mtime is now — yet it is still old.
    const preview = runRetention({ home, dataClass: "change_log", days: 30, now: NOW });
    expect(preview.eligible).toBe(1);
  });
});

describe("index-backed classes", () => {
  it("counts eligible rows without deleting them on a preview", () => {
    const home = mk();
    seedSegment(home, "20260101");
    rebuildIndex(home, { now: NOW.toISOString(), env: {} });

    const preview = runRetention({ home, dataClass: "ingestion_runs", days: 30, now: NOW });

    expect(preview.eligible).toBe(1);
    expect(preview.applied).toBe(false);
    expect(runRetention({ home, dataClass: "ingestion_runs", days: 30, now: NOW }).eligible)
      .toBe(1);
  });

  it("deletes the counted rows with --apply", () => {
    const home = mk();
    seedSegment(home, "20260101");
    rebuildIndex(home, { now: NOW.toISOString(), env: {} });

    runRetention({ home, dataClass: "ingestion_runs", days: 30, apply: true, now: NOW });

    expect(runRetention({ home, dataClass: "ingestion_runs", days: 30, now: NOW }).eligible).toBe(0);
  });

  it("keeps rows inside the window", () => {
    const home = mk();
    seedSegment(home, "20260827");
    rebuildIndex(home, { now: NOW.toISOString(), env: {} });
    expect(runRetention({ home, dataClass: "ingestion_runs", days: 30, apply: true, now: NOW }).eligible).toBe(0);
  });

  it("says so when there is no index rather than reporting zero eligible", () => {
    const home = mk();
    const preview = runRetention({ home, dataClass: "ingestion_runs", days: 30, now: NOW });
    expect(preview.note).toMatch(/no analytics index/);
  });
});

describe("classes with no local store", () => {
  it("say so, instead of answering with a zero that reads as already clean", () => {
    const home = mk();
    for (const dataClass of ["ingestion_failures", "outbox", "content_shard"] as const) {
      const preview = runRetention({ home, dataClass, days: 30, now: NOW });
      expect(preview.eligible, dataClass).toBe(0);
      expect(preview.note, dataClass).toMatch(/no local store/);
    }
  });
});

describe("session files are never touched", () => {
  it("has no class that maps to a session file", () => {
    // These belong to Claude Code and Codex. Retention prunes derived data
    // only; a class that reached a session file would make this tool delete
    // another tool's records.
    const home = mk();
    const sessionDir = join(home, ".claude", "projects", "-home-u-myapp");
    mkdirSync(sessionDir, { recursive: true });
    const session = join(sessionDir, "s1.jsonl");
    writeFileSync(session, `${JSON.stringify({ type: "user" })}\n`);

    for (const dataClass of DATA_CLASSES) {
      runRetention({ home, dataClass, days: 1, apply: true, now: NOW });
    }

    expect(existsSync(session)).toBe(true);
  });
});
