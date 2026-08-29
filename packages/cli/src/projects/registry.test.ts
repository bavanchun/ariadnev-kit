import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { withLifecycleLock } from "../install/lifecycle-lock.js";
import {
  findProject,
  readRegistry,
  registryPath,
  REGISTRY_VERSION,
  staleProjects,
  updateRegistry,
  withoutProject,
  withProject,
  type Registry,
} from "./registry.js";

const dirs: string[] = [];
const mk = () => {
  const dir = mkdtempSync(join(tmpdir(), "ariadnev-registry-"));
  dirs.push(dir);
  return dir;
};

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const NOW = "2026-08-28T00:00:00.000Z";
const LATER = "2026-08-29T00:00:00.000Z";
const empty: Registry = { version: REGISTRY_VERSION, projects: [] };

describe("readRegistry", () => {
  it("treats a missing file as an empty registry", () => {
    expect(readRegistry(mk())).toEqual(empty);
  });

  it("treats an empty file as an empty registry", () => {
    const home = mk();
    mkdirSync(join(home, ".ariadnev"), { recursive: true });
    writeFileSync(registryPath(home), "");
    expect(readRegistry(home)).toEqual(empty);
  });

  it("refuses malformed JSON rather than silently discarding every project", () => {
    // Reading a broken registry as empty would delete every entry on the next
    // write, and the user's only signal would be an empty `projects list`.
    const home = mk();
    mkdirSync(join(home, ".ariadnev"), { recursive: true });
    writeFileSync(registryPath(home), "{ not json");
    expect(() => readRegistry(home)).toThrow(/not valid JSON/);
  });

  it("refuses a document with no projects array", () => {
    const home = mk();
    mkdirSync(join(home, ".ariadnev"), { recursive: true });
    writeFileSync(registryPath(home), JSON.stringify({ version: 1 }));
    expect(() => readRegistry(home)).toThrow(/projects array/);
  });
});

describe("withProject", () => {
  it("registers a directory under its basename, resolved to absolute", () => {
    const registry = withProject(empty, "/tmp/../home/u/myproj", NOW);
    expect(registry.projects).toEqual([
      { name: "myproj", dir: resolve("/home/u/myproj"), registered_at: NOW, updated_at: NOW },
    ]);
  });

  it("refreshes updated_at on a re-register, and keeps registered_at", () => {
    // The captured behaviour: "if the directory is already registered, its
    // entry is refreshed". Losing the original registration date would make
    // the field a duplicate of updated_at rather than a record.
    const once = withProject(empty, "/home/u/p", NOW);
    const twice = withProject(once, "/home/u/p", LATER);
    expect(twice.projects).toHaveLength(1);
    expect(twice.projects[0]).toMatchObject({ registered_at: NOW, updated_at: LATER });
  });

  it("honors an explicit name over the basename", () => {
    expect(withProject(empty, "/home/u/p", NOW, "custom").projects[0].name).toBe("custom");
  });

  it("keeps an existing name when re-registering without one", () => {
    const once = withProject(empty, "/home/u/p", NOW, "custom");
    expect(withProject(once, "/home/u/p", LATER).projects[0].name).toBe("custom");
  });
});

describe("findProject", () => {
  // One project lives at /home/u/alpha. Another lives elsewhere but is *named*
  // "/home/u/alpha" — a name that looks exactly like the first one's directory.
  // That is the only fixture that can tell the two lookup orders apart.
  const registry = withProject(
    withProject(empty, "/home/u/alpha", NOW),
    "/home/u/decoy", NOW, resolve("/home/u/alpha"),
  );

  it("matches an exact directory before a name", () => {
    // The captured precedence: "lookup is first by exact directory path, then
    // by name". Without it, the decoy wins and `projects show` reports a
    // different project than the path the user typed.
    expect(findProject(registry, "/home/u/alpha")?.dir).toBe(resolve("/home/u/alpha"));
  });

  it("falls back to a name when no directory matches", () => {
    expect(findProject(registry, "alpha")?.dir).toBe(resolve("/home/u/alpha"));
  });

  it("returns undefined for something registered under neither", () => {
    expect(findProject(registry, "nowhere")).toBeUndefined();
  });
});

describe("withoutProject", () => {
  it("removes by path and by name, and is a no-op for an unknown entry", () => {
    const registry = withProject(withProject(empty, "/home/u/a", NOW), "/home/u/b", NOW);
    expect(withoutProject(registry, "/home/u/a").projects.map((p) => p.name)).toEqual(["b"]);
    expect(withoutProject(registry, "b").projects.map((p) => p.name)).toEqual(["a"]);
    expect(withoutProject(registry, "missing").projects).toHaveLength(2);
  });
});

describe("staleProjects", () => {
  it("finds entries whose directory is gone", () => {
    const registry = withProject(withProject(empty, "/home/u/gone", NOW), "/home/u/here", NOW);
    const stale = staleProjects(registry, (dir) => dir.endsWith("here"));
    expect(stale.map((entry) => entry.name)).toEqual(["gone"]);
  });
});

describe("updateRegistry", () => {
  it("writes 0600 and reads back what it wrote", () => {
    const home = mk();
    updateRegistry(home, (current) => withProject(current, join(home, "proj"), NOW));
    expect(readRegistry(home).projects[0]).toMatchObject({ dir: join(home, "proj") });
    if (process.platform !== "win32") {
      // The registry lists where a user's projects are. Default umask would
      // make that readable by every account on a shared machine.
      expect(statSync(registryPath(home)).mode & 0o777).toBe(0o600);
    }
  });

  it("serializes deterministically, so an unchanged registry is byte-identical", () => {
    const home = mk();
    updateRegistry(home, (r) => withProject(withProject(r, "/home/u/b", NOW), "/home/u/a", NOW));
    const first = readFileSync(registryPath(home), "utf8");
    updateRegistry(home, (r) => r);
    expect(readFileSync(registryPath(home), "utf8")).toBe(first);
  });

  it("does not lose an entry when overlapping runs are serialized by the caller's lock", async () => {
    // The concurrency criterion, exercised where the guarantee actually lives.
    // `withLifecycleLock` REFUSES a second holder rather than queueing, so an
    // overlapping run does not interleave a read-modify-write — it is turned
    // away with a message naming the command already running. Corruption is
    // impossible because the second writer never starts.
    const home = mk();
    const roots = [join(home, ".ariadnev")];
    const attempt = (name: string) =>
      withLifecycleLock(roots, `projects add ${name}`, () => updateRegistry(home, (r) => withProject(r, `/home/u/${name}`, NOW)))
        .then(() => "written" as const)
        .catch(() => "refused" as const);

    const outcomes = await Promise.all([attempt("a"), attempt("b"), attempt("c")]);
    expect(outcomes.filter((outcome) => outcome === "written")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome === "refused")).toHaveLength(2);

    // And the one that did write left a readable registry, not a torn one.
    expect(readRegistry(home).projects).toHaveLength(1);
  });

  it("applies every entry when runs do not overlap", async () => {
    const home = mk();
    const roots = [join(home, ".ariadnev")];
    for (const name of ["a", "b", "c"]) {
      await withLifecycleLock(roots, `projects add ${name}`, () =>
        updateRegistry(home, (r) => withProject(r, `/home/u/${name}`, NOW)));
    }
    expect(readRegistry(home).projects.map((entry) => entry.name).sort()).toEqual(["a", "b", "c"]);
  });

  it("leaves no registry behind when nothing asked for one", () => {
    const home = mk();
    readRegistry(home);
    expect(existsSync(registryPath(home))).toBe(false);
  });
});
