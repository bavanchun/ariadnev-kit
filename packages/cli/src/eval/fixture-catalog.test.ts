import { execFileSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  computeFixtureDigest,
  copyScenarioFixture,
  loadFixtureCatalog,
  resolveFixtureSource,
} from "./fixture-catalog.js";
import { loadScenarioDirectory } from "./scenario-loader.js";

const catalogPath = join(process.cwd(), "evals", "fixtures", "catalog.json");
const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { force: true, recursive: true });
});

function temporaryParent(): string {
  const root = mkdtempSync(join(tmpdir(), "ariadnev-fixture-test-"));
  temporaryRoots.push(root);
  return root;
}

describe("fixture catalog", () => {
  it("resolves every scenario fixture to a frozen deterministic corpus", () => {
    const catalog = loadFixtureCatalog(catalogPath);
    const referenced = ["skills", "golden"]
      .flatMap((group) => loadScenarioDirectory(join(process.cwd(), "evals", "scenarios", group)))
      .map((scenario) => scenario.fixture.id);
    const expectedIds = [...new Set(referenced)].sort();

    expect(catalog.fixtures.map((fixture) => fixture.id).sort()).toEqual(expectedIds);
    for (const fixture of catalog.fixtures) {
      const source = resolveFixtureSource(catalogPath, fixture.id);
      expect(computeFixtureDigest(source.root)).toBe(fixture.digest);
    }
  });

  it("creates an opaque verified copy without allowing writes to mutate the source", () => {
    const parent = temporaryParent();
    const source = resolveFixtureSource(catalogPath, "synthetic.typescript-repository");
    const sourceFile = join(source.root, "src", "eval-router.ts");
    const before = readFileSync(sourceFile, "utf8");

    const copied = copyScenarioFixture(catalogPath, "synthetic.typescript-repository", { parentDirectory: parent });
    writeFileSync(join(copied.root, "src", "eval-router.ts"), "mutated copy\n");

    expect(copied).toMatchObject({ id: "synthetic.typescript-repository", copy: true, digest: source.digest });
    expect(copied.root).not.toContain("synthetic.typescript-repository");
    expect(copied.containerRoot.startsWith(realpathSync(parent))).toBe(true);
    expect(readFileSync(sourceFile, "utf8")).toBe(before);
  });

  it("fails closed when bytes change during materialization", () => {
    const parent = temporaryParent();
    expect(() =>
      copyScenarioFixture(catalogPath, "synthetic.typescript-repository", {
        parentDirectory: parent,
        deps: {
          copyTree(source, target) {
            cpSync(source, target, { errorOnExist: true, force: false, recursive: true });
            writeFileSync(join(target, "src", "eval-router.ts"), "tampered during copy\n");
          },
        },
      }),
    ).toThrow(/digest mismatch/i);
  });

  it("honors initializeGit after verifying bytes and creates a clean baseline commit", () => {
    const parent = temporaryParent();
    const copied = copyScenarioFixture(catalogPath, "synthetic.completed-change", { parentDirectory: parent });

    expect(existsSync(join(copied.root, ".git"))).toBe(true);
    expect(execFileSync("git", ["branch", "--show-current"], { cwd: copied.root, encoding: "utf8" }).trim()).toBe("main");
    expect(execFileSync("git", ["rev-list", "--count", "HEAD"], { cwd: copied.root, encoding: "utf8" }).trim()).toBe("1");
    expect(execFileSync("git", ["status", "--porcelain"], { cwd: copied.root, encoding: "utf8" })).toBe("");
    expect(computeFixtureDigest(copied.root)).toBe(copied.digest);
  });

  it("ignores inherited Git templates and hooks", () => {
    const parent = temporaryParent();
    const template = join(parent, "hostile-template");
    mkdirSync(join(template, "hooks"), { recursive: true });
    const hook = join(template, "hooks", "pre-commit");
    writeFileSync(hook, "#!/bin/sh\ntouch \"$PWD/hook-ran\"\n");
    chmodSync(hook, 0o755);
    const previous = process.env.GIT_TEMPLATE_DIR;
    process.env.GIT_TEMPLATE_DIR = template;
    try {
      const copied = copyScenarioFixture(catalogPath, "synthetic.completed-change", { parentDirectory: parent });
      expect(existsSync(join(copied.root, "hook-ran"))).toBe(false);
      expect(computeFixtureDigest(copied.root)).toBe(copied.digest);
    } finally {
      if (previous === undefined) delete process.env.GIT_TEMPLATE_DIR;
      else process.env.GIT_TEMPLATE_DIR = previous;
    }
  });

  it("rechecks the frozen digest after Git initialization", () => {
    const parent = temporaryParent();
    expect(() => copyScenarioFixture(catalogPath, "synthetic.completed-change", {
      parentDirectory: parent,
      deps: { initializeGit: (root) => writeFileSync(join(root, "tampered.txt"), "tampered\n") },
    })).toThrow(/digest mismatch/i);
  });
});
