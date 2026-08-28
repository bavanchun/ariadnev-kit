import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  runProjectsAdd,
  runProjectsList,
  runProjectsPrune,
  runProjectsRemove,
  runProjectsShow,
} from "./projects-command.js";
import { readRegistry } from "../projects/registry.js";

const dirs: string[] = [];
const mk = () => {
  const dir = mkdtempSync(join(tmpdir(), "ariadnev-projects-"));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const NOW = "2026-08-28T00:00:00.000Z";

function withProjectDir(home: string, name: string): string {
  const dir = join(home, name);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("list", () => {
  it("says so plainly when nothing is registered, rather than printing an empty table", () => {
    expect(runProjectsList({ home: mk() })).toBe("No projects registered.");
  });

  it("carries no schema_version inside data", () => {
    // The captured `projects list --json` envelope has one `schema_version`, at
    // the top. A second copy inside `data` is always equal to it, so the only
    // thing it can ever do is disagree.
    const home = mk();
    const parsed = JSON.parse(runProjectsList({ home, json: true })) as {
      schema_version: number;
      kind: string;
      data: Record<string, unknown>;
    };
    expect(parsed.kind).toBe("projects.list");
    expect(parsed.data).not.toHaveProperty("schema_version");
    expect(parsed.data).toMatchObject({ projects: [], total: 0 });
  });
});

describe("add", () => {
  it("registers a directory and reports it", () => {
    const home = mk();
    const dir = withProjectDir(home, "alpha");
    expect(runProjectsAdd({ home, dir, now: NOW })).toContain("alpha");
    expect(readRegistry(home).projects).toHaveLength(1);
  });

  it("refuses a directory that does not exist", () => {
    // Otherwise `add` creates the entries `prune` exists to clean up, and the
    // registry stops being a thing anyone can act on.
    const home = mk();
    expect(() => runProjectsAdd({ home, dir: join(home, "nope"), now: NOW })).toThrow(/no such directory/);
    expect(readRegistry(home).projects).toHaveLength(0);
  });

  it("is idempotent — registering twice leaves one entry", () => {
    const home = mk();
    const dir = withProjectDir(home, "alpha");
    runProjectsAdd({ home, dir, now: NOW });
    runProjectsAdd({ home, dir, now: "2026-08-29T00:00:00.000Z" });
    expect(readRegistry(home).projects).toHaveLength(1);
  });
});

describe("remove", () => {
  it("deregisters without touching the directory, and says so", () => {
    // "remove" reads as "delete" to most people. The directory surviving is the
    // behaviour, and stating it costs one line.
    const home = mk();
    const dir = withProjectDir(home, "alpha");
    runProjectsAdd({ home, dir, now: NOW });

    const out = runProjectsRemove({ home, nameOrPath: "alpha" });

    expect(readRegistry(home).projects).toHaveLength(0);
    expect(existsSync(dir)).toBe(true);
    expect(out).toMatch(/Nothing on disk was deleted/);
  });

  it("fails rather than silently succeeding on an unknown project", () => {
    expect(() => runProjectsRemove({ home: mk(), nameOrPath: "ghost" })).toThrow(/no registered project/);
  });
});

describe("show", () => {
  it("reports a registered project, including whether its directory is still there", () => {
    const home = mk();
    const dir = withProjectDir(home, "alpha");
    runProjectsAdd({ home, dir, now: NOW });
    expect(runProjectsShow({ home, nameOrPath: "alpha" })).toContain("on disk      yes");

    rmSync(dir, { recursive: true, force: true });
    expect(runProjectsShow({ home, nameOrPath: "alpha" })).toContain("on disk      no");
  });
});

describe("prune", () => {
  it("drops entries whose directory is gone and keeps the rest", () => {
    const home = mk();
    const alive = withProjectDir(home, "alive");
    const gone = withProjectDir(home, "gone");
    runProjectsAdd({ home, dir: alive, now: NOW });
    runProjectsAdd({ home, dir: gone, now: NOW });
    rmSync(gone, { recursive: true, force: true });

    runProjectsPrune({ home });

    expect(readRegistry(home).projects.map((p) => p.name)).toEqual(["alive"]);
  });

  it("does nothing when every directory still exists", () => {
    const home = mk();
    runProjectsAdd({ home, dir: withProjectDir(home, "alive"), now: NOW });
    expect(runProjectsPrune({ home })).toMatch(/Nothing to prune/);
    expect(readRegistry(home).projects).toHaveLength(1);
  });

  describe("--all", () => {
    const seeded = () => {
      const home = mk();
      runProjectsAdd({ home, dir: withProjectDir(home, "alive"), now: NOW });
      return home;
    };

    it("refuses without --force", () => {
      const home = seeded();
      expect(() => runProjectsPrune({ home, all: true, yes: true })).toThrow(/--force and --yes/);
      expect(readRegistry(home).projects).toHaveLength(1);
    });

    it("refuses without --yes", () => {
      // Both gates, not either. A script that has always passed `--yes` must
      // not acquire a registry wipe it never asked for.
      const home = seeded();
      expect(() => runProjectsPrune({ home, all: true, force: true })).toThrow(/--force and --yes/);
      expect(readRegistry(home).projects).toHaveLength(1);
    });

    it("wipes the registry with both, and still deletes no directory", () => {
      const home = mk();
      const dir = withProjectDir(home, "alive");
      runProjectsAdd({ home, dir, now: NOW });

      runProjectsPrune({ home, all: true, force: true, yes: true });

      expect(readRegistry(home).projects).toHaveLength(0);
      expect(existsSync(dir)).toBe(true);
    });
  });
});
