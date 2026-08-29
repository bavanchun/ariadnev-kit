import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  PLAINTEXT_DISCLOSURE,
  runContentSearchDelete,
  runContentSearchDisable,
  runContentSearchEnable,
  runContentSearchRebuild,
  runContentSearchSearch,
  runContentSearchStatus,
} from "./content-search-command.js";
import { registryPath } from "../projects/registry.js";
import { contentStatePath } from "../content-search/lifecycle.js";
import { shardPath } from "../content-search/shard.js";

const dirs: string[] = [];
const mk = () => {
  const dir = mkdtempSync(join(tmpdir(), "ariadnev-cs-"));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const NOW = "2026-08-28T00:00:00.000Z";

/** A home with two registered projects, each holding one distinctive file. */
function sandbox(): { home: string; a: string; b: string } {
  const home = mk();
  const a = join(home, "work", "alpha");
  const b = join(home, "work", "beta");
  mkdirSync(a, { recursive: true });
  mkdirSync(b, { recursive: true });
  writeFileSync(join(a, "alpha.ts"), "export const ALPHA_MARKER = 1;\n");
  writeFileSync(join(b, "beta.ts"), "export const BETA_MARKER = 2;\n");
  mkdirSync(join(home, ".ariadnev"), { recursive: true });
  writeFileSync(
    registryPath(home),
    JSON.stringify({
      version: 1,
      projects: [
        { name: "alpha", dir: a, registered_at: NOW, updated_at: NOW },
        { name: "beta", dir: b, registered_at: NOW, updated_at: NOW },
      ],
    }),
  );
  return { home, a, b };
}

const base = (home: string, project: string) => ({ home, now: NOW, project });
const data = (out: string) => (JSON.parse(out) as { data: Record<string, unknown> }).data;

function enableAndBuild(home: string, project: string): void {
  runContentSearchEnable({ ...base(home, project), yes: true });
  runContentSearchRebuild({ ...base(home, project), yes: true });
}

describe("opt-in is per project", () => {
  it("does not index a second project when the first opts in", () => {
    // The property the one-shard-per-project design exists to make structural:
    // with a shared table this would rest on every query remembering a WHERE.
    const { home, a, b } = sandbox();
    enableAndBuild(home, "alpha");

    expect(statSync(shardPath(home, a)).isFile()).toBe(true);
    expect(() => statSync(shardPath(home, b))).toThrow();
    expect(runContentSearchStatus({ ...base(home, "beta"), json: true })).toContain('"enabled": false');
  });

  it("cannot find another project's content through an opted-in one", () => {
    const { home } = sandbox();
    enableAndBuild(home, "alpha");
    const find = (query: string) =>
      (data(runContentSearchSearch({ ...base(home, "alpha"), query, json: true })) as { hits: unknown[] }).hits;

    // The positive control comes first and is the reason the negative means
    // anything: without it an empty shard would satisfy the assertion below
    // while proving nothing at all.
    expect(find("ALPHA_MARKER"), "alpha's own content is searchable").toHaveLength(1);
    expect(find("BETA_MARKER")).toEqual([]);
  });

  it("refuses without --project rather than guessing one", () => {
    // A default that fell back to the current directory would make indexing the
    // wrong project a typo away.
    const { home } = sandbox();
    expect(() => runContentSearchStatus({ home, now: NOW })).toThrow(/--project is required/);
  });

  it("refuses a project that is not registered", () => {
    const { home } = sandbox();
    expect(() => runContentSearchStatus({ ...base(home, "gamma") })).toThrow(/no registered project matches gamma/);
  });
});

describe("searching a project that never opted in", () => {
  it("says so instead of returning no results", () => {
    // Empty-vs-disabled is the confusion that makes a search tool untrustworthy:
    // the user cannot tell "nothing there" from "not looking".
    const { home } = sandbox();
    expect(() => runContentSearchSearch({ ...base(home, "alpha"), query: "ALPHA_MARKER" }))
      .toThrow(/has not opted into content search/);
  });

  it("distinguishes opted-in-but-unbuilt from opted-in-and-empty", () => {
    const { home } = sandbox();
    runContentSearchEnable({ ...base(home, "alpha"), yes: true });

    // Opted in, no shard yet: a different fix from either of the other two.
    expect(() => runContentSearchSearch({ ...base(home, "alpha"), query: "ALPHA_MARKER" }))
      .toThrow(/no shard yet/);

    runContentSearchRebuild({ ...base(home, "alpha"), yes: true });
    // Opted in, built, genuinely no match: that IS an empty result.
    expect(runContentSearchSearch({ ...base(home, "alpha"), query: "NOTHING_MATCHES_THIS" }))
      .toMatch(/No matches/);
  });
});

describe("the plaintext-at-rest disclosure", () => {
  it("blocks enable until it is accepted, and shows the text when it blocks", () => {
    const { home } = sandbox();
    expect(() => runContentSearchEnable({ ...base(home, "alpha") })).toThrow(/PLAINTEXT AT REST/);
    expect(() => runContentSearchEnable({ ...base(home, "alpha") })).toThrow(/--yes/);
  });

  it("is printed on the enable that succeeds, not only on the one that refuses", () => {
    // Someone scripting `--yes` is precisely the person who will never read the
    // docs page that says this.
    const { home } = sandbox();
    expect(runContentSearchEnable({ ...base(home, "alpha"), yes: true })).toContain(PLAINTEXT_DISCLOSURE);
  });

  it("rides along in the JSON, where a script is the only reader", () => {
    const { home } = sandbox();
    expect(data(runContentSearchEnable({ ...base(home, "alpha"), yes: true, json: true })).disclosure)
      .toBe(PLAINTEXT_DISCLOSURE);
  });

  it("is repeated by status while the project stays opted in", () => {
    const { home } = sandbox();
    runContentSearchEnable({ ...base(home, "alpha"), yes: true });
    expect(runContentSearchStatus({ ...base(home, "alpha") })).toContain(PLAINTEXT_DISCLOSURE);
  });
});

describe("disable and delete are different requests", () => {
  it("disable keeps the shard and says so", () => {
    const { home, a } = sandbox();
    enableAndBuild(home, "alpha");

    const out = runContentSearchDisable({ ...base(home, "alpha") });

    expect(out).toMatch(/kept/);
    expect(statSync(shardPath(home, a)).size).toBeGreaterThan(0);
  });

  it("a disabled project refuses a search even though its shard is intact", () => {
    const { home } = sandbox();
    enableAndBuild(home, "alpha");
    runContentSearchDisable({ ...base(home, "alpha") });

    expect(() => runContentSearchSearch({ ...base(home, "alpha"), query: "ALPHA_MARKER" }))
      .toThrow(/has not opted into content search/);
  });

  it("delete previews before it removes anything", () => {
    const { home, a } = sandbox();
    enableAndBuild(home, "alpha");

    const preview = data(runContentSearchDelete({ ...base(home, "alpha"), json: true }));

    expect(preview).toMatchObject({ applied: false, removed: false });
    expect(Number(preview.docs)).toBeGreaterThan(0);
    expect(statSync(shardPath(home, a)).isFile(), "the preview removed nothing").toBe(true);
  });

  it("delete with --yes removes the shard and leaves the opt-in alone", () => {
    // Deleting derived state must never change a decision the user made — which
    // is the whole reason the opt-in marker lives outside derived/.
    const { home, a } = sandbox();
    enableAndBuild(home, "alpha");

    const applied = data(runContentSearchDelete({ ...base(home, "alpha"), yes: true, json: true }));

    expect(applied).toMatchObject({ applied: true, removed: true, enabled: true });
    expect(() => statSync(shardPath(home, a))).toThrow();
    expect(statSync(contentStatePath(home)).size).toBeGreaterThan(0);
  });

  it("delete on a project with no shard says so rather than failing", () => {
    const { home } = sandbox();
    expect(runContentSearchDelete({ ...base(home, "alpha") })).toMatch(/No content shard/);
  });

  it("reports the same delete payload shape whether it removed anything or not", () => {
    // A field present only on some outcomes forces a machine reader to branch on
    // its presence, which is how "absent" and "false" get conflated.
    const { home } = sandbox();
    const keys = (out: string) => Object.keys(data(out)).sort();
    const nothing = keys(runContentSearchDelete({ ...base(home, "alpha"), json: true }));

    enableAndBuild(home, "alpha");
    const preview = keys(runContentSearchDelete({ ...base(home, "alpha"), json: true }));
    const applied = keys(runContentSearchDelete({ ...base(home, "alpha"), yes: true, json: true }));

    expect(nothing).toEqual(preview);
    expect(applied).toEqual(preview);
    expect(preview).toContain("enabled");
  });
});

describe("rebuild", () => {
  it("recreates a shard that was deleted, with the same answers", () => {
    const { home } = sandbox();
    // `elapsedMs` is dropped: it is a measurement of this run, not part of the
    // answer, and comparing it would make the test fail on a slow machine for a
    // reason that has nothing to do with the invariant.
    const answer = () => {
      const { elapsedMs, ...rest } = data(
        runContentSearchSearch({ ...base(home, "alpha"), query: "ALPHA_MARKER", json: true }),
      ) as { elapsedMs: number; hits: unknown[] };
      return rest;
    };
    enableAndBuild(home, "alpha");
    const before = answer();
    expect(before.hits, "the marker must actually be found, or this compares nothing").toHaveLength(1);

    runContentSearchDelete({ ...base(home, "alpha"), yes: true });
    runContentSearchRebuild({ ...base(home, "alpha"), yes: true });

    expect(answer()).toEqual(before);
  });

  it("repairs a corrupt shard rather than failing on it", () => {
    // `rebuild` is the fix `status` points at for a corrupt shard, so it must
    // not be the command that chokes on one.
    const { home, a } = sandbox();
    enableAndBuild(home, "alpha");
    writeFileSync(shardPath(home, a), "this is not a database");
    expect(runContentSearchStatus({ ...base(home, "alpha") })).toContain("corrupt");

    runContentSearchRebuild({ ...base(home, "alpha"), yes: true });

    expect(runContentSearchStatus({ ...base(home, "alpha") })).toContain("ready");
  });

  it("refuses to build a shard for a project that never opted in", () => {
    const { home } = sandbox();
    expect(() => runContentSearchRebuild({ ...base(home, "alpha"), yes: true }))
      .toThrow(/has not opted into content search/);
  });
});

describe("the shard is private", () => {
  it("is 0600, and so are its WAL companions", () => {
    // It holds the project's source as plaintext; the umask default of 0644
    // would make that world-readable on a shared host.
    const { home, a } = sandbox();
    enableAndBuild(home, "alpha");

    if (process.platform === "win32") return;
    for (const suffix of ["", "-wal", "-shm"]) {
      const path = `${shardPath(home, a)}${suffix}`;
      let mode: number;
      try {
        mode = statSync(path).mode & 0o777;
      } catch {
        continue;
      }
      expect(mode, path).toBe(0o600);
    }
  });
});

describe("the JSON surface", () => {
  it("carries one schema_version, at the top", () => {
    const { home } = sandbox();
    const parsed = JSON.parse(runContentSearchStatus({ ...base(home, "alpha"), json: true })) as {
      schema_version: number; kind: string; data: Record<string, unknown>;
    };
    expect(parsed.kind).toBe("content-search.status");
    expect(parsed.data).not.toHaveProperty("schema_version");
  });
});
