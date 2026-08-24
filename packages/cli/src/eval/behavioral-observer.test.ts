import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

// The snapshot walks the fixture with readdirSync and then lstats each entry.
// Git runs `maintenance --auto` in the background after commits inside the
// copied workspace, and its `.git/objects/maintenance.lock` lives for a few
// milliseconds — long enough to be listed, gone by the time it is stat'ed.
// This mock reproduces that window deterministically: the file is really on
// disk (readdir sees it), and lstat reports it missing.
vi.mock("node:fs", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:fs")>();
  return {
    ...real,
    lstatSync: ((path: Parameters<typeof real.lstatSync>[0], ...rest: unknown[]) => {
      if (String(path).endsWith("vanished.lock")) {
        const error = new Error(`ENOENT: no such file or directory, lstat '${String(path)}'`) as NodeJS.ErrnoException;
        error.code = "ENOENT";
        throw error;
      }
      return (real.lstatSync as (...args: unknown[]) => unknown)(path, ...rest);
    }) as typeof real.lstatSync,
  };
});

const { createBehavioralObserver } = await import("./behavioral-observer.js");
const { copyScenarioFixture } = await import("./fixture-catalog.js");
const { createRunContext } = await import("./run-context.js");
const { loadScenarioFile } = await import("./scenario-loader.js");

const root = process.cwd();
const roots: string[] = [];
afterEach(() => {
  for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("behavioral observer snapshot", () => {
  it("tolerates an entry that vanishes between readdir and lstat", async () => {
    const scenario = loadScenarioFile(join(root, "evals/scenarios/skills/ask.json"));
    const fixture = copyScenarioFixture(join(root, "evals/fixtures/catalog.json"), scenario.fixture.id);
    roots.push(fixture.root);
    // Outside the workspace, the way git's lock is: a transient here must not
    // read as an unscoped write, and must not crash the walk.
    const lockDir = join(fixture.containerRoot, "git-state");
    mkdirSync(lockDir, { recursive: true });
    writeFileSync(join(lockDir, "vanished.lock"), "");

    const observer = createBehavioralObserver({
      run: createRunContext(),
      fixture,
      scenario,
      caseId: "positive",
      allowedSkills: ["av:ask"],
    });
    await observer.ready();
    const summary = await observer.finish();

    expect(summary.pathViolations).toBe(0);
    expect(summary.workspaceMutations).toBe(0);
  });
});
