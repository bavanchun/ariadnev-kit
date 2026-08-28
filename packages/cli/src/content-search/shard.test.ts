import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { closeShard, deleteShard, openShard, SHARD_SCHEMA_VERSION, shardId, shardPath, shardStats } from "./shard.js";
import {
  contentSearchStatus,
  contentStatePath,
  disableProject,
  enableProject,
  isEnabled,
  readContentState,
  recordIndexed,
} from "./lifecycle.js";
import { derivedRoot, isDerived, removeDerived } from "../storage/operational-paths.js";

const dirs: string[] = [];
const mk = () => {
  const dir = mkdtempSync(join(tmpdir(), "ariadnev-shard-"));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const NOW = "2026-08-28T00:00:00.000Z";
const PROJECT = "/home/u/myapp";

describe("where a shard lives", () => {
  it("sits under derived/, so wiping derived state actually removes it", () => {
    // The placement is what makes the rebuild-equivalence case mean anything: a
    // shard the derived wipe cannot reach would survive a test designed to
    // delete it and the comparison would prove nothing.
    const home = mk();
    expect(isDerived(home, shardPath(home, PROJECT))).toBe(true);
  });

  it("keeps the opt-in marker outside derived/, where the wipe cannot reach it", () => {
    // Deleting derived state is advertised as harmless. If the marker lived
    // inside it, that operation would silently change a privacy decision.
    const home = mk();
    enableProject(home, PROJECT, "myapp", NOW);
    expect(isDerived(home, contentStatePath(home))).toBe(false);

    removeDerived(home);

    expect(existsSync(derivedRoot(home))).toBe(false);
    expect(isEnabled(home, PROJECT), "still opted in").toBe(true);
  });
});

describe("the shard filename", () => {
  it("is stable for a directory and different between directories", () => {
    expect(shardId(PROJECT)).toBe(shardId(PROJECT));
    expect(shardId(PROJECT)).not.toBe(shardId("/home/u/other"));
  });

  it("is filesystem-safe for a path that is not", () => {
    // A deep or oddly-named directory must not produce a name the filesystem
    // rejects, which is the reason this is a digest rather than the path.
    expect(shardId("/a/very/deep/path with spaces/and:colons")).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe("opening a shard", () => {
  it("creates it, stamps its schema, and counts nothing yet", () => {
    const home = mk();
    const shard = openShard(home, PROJECT);
    try {
      expect(shard.path).toBe(shardPath(home, PROJECT));
      expect(statSync(shard.path).isFile()).toBe(true);
    } finally {
      closeShard(shard);
    }
    expect(shardStats(home, PROJECT)).toMatchObject({ exists: true, docs: 0, schemaVersion: SHARD_SCHEMA_VERSION });
  });

  it("is idempotent — reopening an existing shard keeps its rows", () => {
    const home = mk();
    let shard = openShard(home, PROJECT);
    try {
      shard.database.prepare("INSERT INTO docs (path, body, bytes, indexed_at) VALUES (?, ?, ?, ?)")
        .run("a.ts", "body", 4, NOW);
    } finally {
      closeShard(shard);
    }
    shard = openShard(home, PROJECT);
    try {
      expect(shard.database.prepare("SELECT COUNT(*) AS n FROM docs").get()?.n).toBe(1);
    } finally {
      closeShard(shard);
    }
  });
});

describe("deleting a shard", () => {
  it("removes the file and reports what went", () => {
    const home = mk();
    closeShard(openShard(home, PROJECT));

    const removal = deleteShard(home, PROJECT);

    expect(removal.removed).toBe(true);
    expect(removal.bytesFreed).toBeGreaterThan(0);
    expect(existsSync(shardPath(home, PROJECT))).toBe(false);
  });

  it("is a no-op on a project that has none", () => {
    expect(deleteShard(mk(), PROJECT)).toEqual({ removed: false, bytesFreed: 0, docs: 0 });
  });
});

describe("status distinguishes states that need different fixes", () => {
  it("names four states rather than collapsing them into 'not working'", () => {
    const home = mk();
    // Never opted in.
    expect(contentSearchStatus(home, PROJECT, "myapp")).toMatchObject({ enabled: false, health: "absent" });
    expect(contentSearchStatus(home, PROJECT, "myapp").reason).toMatch(/has not opted in/);

    // Opted in, nothing built.
    enableProject(home, PROJECT, "myapp", NOW);
    expect(contentSearchStatus(home, PROJECT, "myapp").reason).toMatch(/no shard has been built/);

    // Built and usable.
    closeShard(openShard(home, PROJECT));
    expect(contentSearchStatus(home, PROJECT, "myapp")).toMatchObject({ health: "ready", serving_mode: "shard" });
    expect(contentSearchStatus(home, PROJECT, "myapp").reason).toBeUndefined();

    // Unreadable.
    writeFileSync(shardPath(home, PROJECT), "this is not a database");
    expect(contentSearchStatus(home, PROJECT, "myapp").health).toBe("corrupt");
    expect(contentSearchStatus(home, PROJECT, "myapp").reason).toMatch(/could not be read/);
  });

  it("stops serving when the project opts out, without touching the shard", () => {
    const home = mk();
    enableProject(home, PROJECT, "myapp", NOW);
    closeShard(openShard(home, PROJECT));

    disableProject(home, PROJECT, "myapp", NOW);

    const status = contentSearchStatus(home, PROJECT, "myapp");
    expect(status.serving_mode).toBe("none");
    expect(status.health, "the shard is still there").toBe("ready");
  });

  it("reports the last index pass without re-scanning for it", () => {
    const home = mk();
    enableProject(home, PROJECT, "myapp", NOW);
    recordIndexed(home, PROJECT, "myapp", "2026-08-29T00:00:00.000Z", 12);
    expect(contentSearchStatus(home, PROJECT, "myapp").last_indexed_at).toBe("2026-08-29T00:00:00.000Z");
  });
});

describe("the opt-in state file", () => {
  it("holds one entry per project and nothing that applies to all of them", () => {
    // There is no global "content search is on". Enabling one project cannot
    // enable another because there is no field that would say so.
    const home = mk();
    enableProject(home, PROJECT, "myapp", NOW);
    enableProject(home, "/home/u/other", "other", NOW);

    const state = readContentState(home);

    expect(state.projects.map((entry) => entry.dir).sort()).toEqual(["/home/u/myapp", "/home/u/other"]);
    expect(Object.keys(state).sort()).toEqual(["projects", "version"]);
  });

  it("reads a corrupt file as nothing opted in, rather than as consent", () => {
    // The safe default for "may this tool copy your source into a plaintext
    // file" is no, so an unparseable preference must never read as yes.
    const home = mk();
    enableProject(home, PROJECT, "myapp", NOW);
    writeFileSync(contentStatePath(home), "{ not json");

    expect(readContentState(home).projects).toEqual([]);
    expect(isEnabled(home, PROJECT)).toBe(false);
  });

  it("is 0600", () => {
    const home = mk();
    enableProject(home, PROJECT, "myapp", NOW);
    if (process.platform === "win32") return;
    expect(statSync(contentStatePath(home)).mode & 0o777).toBe(0o600);
  });
});
