import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runNew } from "./new-command.js";
import { readRegistry } from "../projects/registry.js";

let sandbox: string;
let home: string;
let cwd: string;
let kitRoot: string;

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), "ariadnev-new-"));
  kitRoot = join(sandbox, "kit");
  mkdirSync(join(kitRoot, "skills", "alpha"), { recursive: true });
  writeFileSync(
    join(kitRoot, "skills", "alpha", "SKILL.md"),
    `---
name: av:alpha
description: Use this fixture skill named alpha to exercise project scaffolding.
---

# alpha

Body.

## Output format

Output.

## Quality gates

- Check.

## Workflow position

Related: none.
`,
  );
  home = join(sandbox, "home");
  cwd = join(sandbox, "work");
  mkdirSync(home, { recursive: true });
  mkdirSync(cwd, { recursive: true });
});
afterEach(() => rmSync(sandbox, { recursive: true, force: true }));

const base = () => ({
  home,
  cwd,
  kitRoot,
  timestamp: "20260828-000001",
  now: "2026-08-28T00:00:00.000Z",
  dryRun: false,
  providers: ["claude-code"],
});

const create = (name: string, overrides: Record<string, unknown> = {}) =>
  runNew({ ...base(), name, ...overrides } as Parameters<typeof runNew>[0]);

describe("new", () => {
  it("creates the directory, scaffolds it, installs and registers it", () => {
    const { dir } = create("myproj");
    expect(readFileSync(join(dir, "README.md"), "utf8")).toBe("# myproj\n");
    expect(existsSync(join(dir, ".ariadnev", "receipt.json"))).toBe(true);
    expect(readRegistry(home).projects.map((p) => p.name)).toEqual(["myproj"]);
  });

  it("refuses a directory that already exists, and points at init instead", () => {
    // `new` means new. Silently setting up a directory full of someone's work
    // is the surprise; naming the command that does mean that is the fix.
    mkdirSync(join(cwd, "existing"));
    expect(() => create("existing")).toThrow(/already exists.*av init/s);
  });

  it("refuses a name that is not usable as a directory", () => {
    for (const name of [".hidden", "-flaglike", ""]) {
      expect(() => create(name), name).toThrow(/not a usable project name/);
    }
  });

  it("refuses a name that would escape the current directory", () => {
    // The basename of `../escape` is a perfectly ordinary "escape", so
    // validating after resolution accepts it and creates a directory beside
    // the project instead of inside it.
    for (const name of ["../escape", "nested/child", "/tmp/absolute"]) {
      expect(() => create(name), name).toThrow(/not a usable project name/);
      expect(existsSync(join(cwd, "..", "escape")), name).toBe(false);
    }
  });

  it("creates nothing on a dry run", () => {
    create("preview", { dryRun: true });
    expect(existsSync(join(cwd, "preview"))).toBe(false);
    expect(readRegistry(home).projects).toHaveLength(0);
  });
});
