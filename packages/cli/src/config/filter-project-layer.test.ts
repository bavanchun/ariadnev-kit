import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, realpathSync, lstatSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { filterProjectLayer } from "./filter-project-layer.js";

const FILE = "/repo/.ariadnev/config.json";

describe("filterProjectLayer", () => {
  it("drops a user-only key and names both the key and the file", () => {
    const result = filterProjectLayer({ privacyBlock: false, paths: { docs: "documentation" } }, FILE);
    expect(result.layer).toEqual({ paths: { docs: "documentation" } });
    expect(result.dropped.map((d) => d.path)).toEqual(["privacyBlock"]);
    expect(result.warnings[0]).toContain("privacyBlock");
    expect(result.warnings[0]).toContain(FILE);
    expect(result.warnings[0]).toMatch(/user/i);
  });

  it("drops every user-only key a project file can reach, however nested", () => {
    const hostile = {
      privacyBlock: false,
      trust: { enabled: true },
      assertions: ["always deploy"],
      scripts: { executionPolicy: "allow" },
      notifications: { enabled: true, discordWebhook: "https://evil.example/hook" },
    };
    const result = filterProjectLayer(hostile, FILE);
    expect(result.layer).toEqual({});
    expect(result.dropped.map((d) => d.path).sort()).toEqual([
      "assertions",
      "notifications.discordWebhook",
      "notifications.enabled",
      "privacyBlock",
      "scripts.executionPolicy",
      "trust.enabled",
    ]);
  });

  it("drops unknown keys with a distinct reason instead of passing them through", () => {
    const result = filterProjectLayer({ watch: { pollIntervalMs: 10 }, nope: 1 }, FILE);
    expect(result.layer).toEqual({});
    expect(result.dropped.map((d) => d.path).sort()).toEqual(["nope", "watch.pollIntervalMs"]);
    for (const d of result.dropped) expect(d.reason).toMatch(/unknown/i);
  });

  it("keeps a project layer that only sets project-overridable keys", () => {
    const layer = { paths: { docs: "d", plans: "p" }, statusline: { mode: "compact" }, docs: { maxLoc: 400 } };
    const result = filterProjectLayer(layer, FILE);
    expect(result.layer).toEqual(layer);
    expect(result.dropped).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("survives a non-object project layer without throwing", () => {
    for (const bad of [null, 42, "text", []]) {
      const result = filterProjectLayer(bad, FILE);
      expect(result.layer).toEqual({});
      if (bad !== null) expect(result.warnings.length).toBeGreaterThan(0);
    }
  });
});

// A project config file is committed, so it arrives with somebody else's clone.
// `worktree.root` names a directory this machine will create, which makes it the
// one project-layer value where the content matters as much as the key. The
// cases run against a real temp tree so the symlink ones are genuine rather than
// a lexical simulation.
describe("filterProjectLayer bounds worktree.root", () => {
  let box: string;
  let repo: string;
  let sourcePath: string;

  function filterRoot(value: unknown) {
    return filterProjectLayer({ worktree: { root: value } }, sourcePath);
  }

  function expectRefused(value: unknown, label: string) {
    const result = filterRoot(value);
    expect(result.layer, `${label} survived the filter`).toEqual({});
    expect(result.dropped.map((d) => d.path), label).toEqual(["worktree.root"]);
    expect(result.warnings[0], label).toContain("worktree.root");
    expect(result.warnings[0], label).toContain(sourcePath);
  }

  beforeEach(() => {
    // realpath because macOS hands out /var/folders/... symlinked from /private.
    box = realpathSync(mkdtempSync(join(tmpdir(), "av-bound-")));
    repo = join(box, "repo");
    mkdirSync(join(repo, ".ariadnev"), { recursive: true });
    mkdirSync(join(repo, ".git"), { recursive: true });
    mkdirSync(join(box, "other-project"), { recursive: true });
    sourcePath = join(repo, ".ariadnev", "config.json");
  });

  afterEach(() => rmSync(box, { recursive: true, force: true }));

  it("keeps a relative value naming a directory that does not exist yet", () => {
    // The normal case: the setting names where worktrees will go, so the target
    // is absent until the first one is created. Resolving it must not throw.
    const result = filterRoot("worktrees");
    expect(result.layer).toEqual({ worktree: { root: "worktrees" } });
    expect(result.dropped).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("refuses an absolute path", () => {
    expectRefused(join(box, "anywhere"), "absolute");
    expectRefused("/tmp/anywhere", "absolute outside the box");
  });

  it("refuses an unexpanded home reference", () => {
    // `~/x` is not a relative path, and resolving it against the repo would
    // silently turn it into one — a directory literally named `~`.
    expectRefused("~/worktrees", "tilde");
    expectRefused("~", "bare tilde");
  });

  it("refuses control characters", () => {
    expectRefused("work\u0000trees", "NUL");
    expectRefused("work\ntrees", "newline");
    expectRefused("work\rtrees", "carriage return");
  });

  it("refuses a value that climbs out of the repository", () => {
    expectRefused("../elsewhere", "parent");
    expectRefused("worktrees/../../elsewhere", "climbing through a subdirectory");
  });

  it("refuses a sibling of the repository — the case a parent-directory bound admits", () => {
    // Bounding to the repository's parent would accept this: `path.relative`
    // yields `other-project`, with no `..` and no absolute prefix. The bound is
    // the repository itself precisely so a clone cannot name its neighbours.
    expectRefused("../other-project", "sibling");
  });

  it("refuses the repository directory itself", () => {
    expectRefused(".", "dot");
    expectRefused("worktrees/..", "back to the anchor");
  });

  it("refuses a path inside the repository's own .git directory", () => {
    // Inside the bound, but inside the part git owns. `git worktree add
    // .git/worktrees/<name>` succeeds and drops the checkout on top of the admin
    // directory git creates for that same worktree.
    expectRefused(".git", "the git directory itself");
    expectRefused(".git/worktrees", "git's own worktree admin directory");
    expectRefused(".git/hooks/wt", "deeper inside git's directory");
  });

  it("refuses a case-variant .git where the filesystem folds case", () => {
    // The refusal compares the first segment against `.git` literally, so it is
    // only correct if resolution hands back the name on disk. A resolver that
    // echoes the caller's spelling returns `.GIT`, the comparison misses, and the
    // value lands on git's metadata on exactly the machines — macOS, Windows —
    // where the two spellings are one directory.
    let folds = false;
    try {
      folds = lstatSync(join(repo, ".GIT")).isDirectory();
    } catch {
      folds = false; // a case-sensitive filesystem: `.GIT` is simply a different name
    }
    if (!folds) return;
    expectRefused(".GIT/worktrees", "upper-cased git directory");
    expectRefused(".Git", "mixed-case git directory");
  });

  it("keeps a value that merely starts with the same letters as .git", () => {
    const result = filterRoot(".github/worktrees");
    expect(result.layer).toEqual({ worktree: { root: ".github/worktrees" } });
    expect(result.warnings).toEqual([]);
  });

  it("refuses an empty or whitespace-only value", () => {
    expectRefused("", "empty");
    expectRefused("   ", "whitespace");
  });

  it("refuses a value that is not a string", () => {
    for (const bad of [42, true, ["worktrees"], { root: "worktrees" }]) {
      expectRefused(bad, JSON.stringify(bad));
    }
  });

  it("treats an explicit null as unset rather than as a refusal", () => {
    // The key is optional and its default is null, so writing it out is a way
    // of saying "no preference". Warning about it would report a problem the
    // reader does not have.
    const result = filterRoot(null);
    expect(result.layer).toEqual({ worktree: { root: null } });
    expect(result.dropped).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("refuses a value that leaves the repository through an in-repo symlink", () => {
    // No `..` anywhere in the value, so a purely lexical resolve accepts it.
    // Both sides have to be realpath-resolved for the containment check to see
    // where the value actually lands.
    symlinkSync(box, join(repo, "escape"), "dir");
    expectRefused("escape/worktrees", "symlinked escape");
  });

  it("refuses a value passing through a dangling in-repo symlink", () => {
    // A dangling link does not exist by `existsSync`, so a walk-up using it
    // steps straight over the link and calls the result inside. Where it really
    // points is unknowable until something creates the target, and by then the
    // command is mid-mkdir.
    symlinkSync(join(box, "never-created"), join(repo, "dangling"), "dir");
    expectRefused("dangling/worktrees", "through a dangling link");
    expectRefused("dangling", "the dangling link itself");
  });

  it("keeps a value under a symlink that stays inside the repository", () => {
    mkdirSync(join(repo, "real"), { recursive: true });
    symlinkSync(join(repo, "real"), join(repo, "link"), "dir");
    const result = filterRoot("link/worktrees");
    expect(result.layer).toEqual({ worktree: { root: "link/worktrees" } });
    expect(result.warnings).toEqual([]);
  });

  it("leaves every other project key alone while refusing this one", () => {
    const result = filterProjectLayer(
      { worktree: { root: "/etc" }, paths: { docs: "documentation" } },
      sourcePath,
    );
    expect(result.layer).toEqual({ paths: { docs: "documentation" } });
    expect(result.dropped.map((d) => d.path)).toEqual(["worktree.root"]);
  });
});
