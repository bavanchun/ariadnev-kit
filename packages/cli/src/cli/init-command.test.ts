import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runInit } from "./init-command.js";
import { readRegistry } from "../projects/registry.js";

let sandbox: string;
let home: string;
let cwd: string;
let kitRoot: string;

function skillMd(name: string): string {
  return `---
name: av:${name}
description: Use this fixture skill named ${name} to exercise project initialization.
---

# ${name}

Body.

## Output format

Output.

## Quality gates

- Check.

## Workflow position

Related: none.
`;
}

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), "ariadnev-init-"));
  kitRoot = join(sandbox, "kit");
  mkdirSync(join(kitRoot, "skills", "alpha"), { recursive: true });
  writeFileSync(join(kitRoot, "skills", "alpha", "SKILL.md"), skillMd("alpha"));
  home = join(sandbox, "home");
  cwd = join(sandbox, "proj");
  mkdirSync(home, { recursive: true });
  mkdirSync(cwd, { recursive: true });
});
afterEach(() => rmSync(sandbox, { recursive: true, force: true }));

const NOW = "2026-08-28T00:00:00.000Z";
const base = () => ({
  home,
  cwd,
  kitRoot,
  timestamp: "20260828-000001",
  now: NOW,
  dryRun: false,
  providers: ["claude-code"],
});

// `runInit` resolves the kit itself, so the fixture kit reaches it the same way
// the install tests pass one: through the handler's own kitRoot override.
function init(overrides: Record<string, unknown> = {}) {
  return runInit({ ...base(), ...overrides } as Parameters<typeof runInit>[0]);
}

describe("init", () => {
  it("sets the directory up and registers it", () => {
    const result = init();
    expect(existsSync(join(cwd, ".ariadnev", "receipt.json"))).toBe(true);
    expect(readRegistry(home).projects.map((p) => p.dir)).toEqual([result.dir]);
  });

  it("is idempotent — a second run changes nothing", () => {
    init();
    const receipt = () => readFileSync(join(cwd, ".ariadnev", "receipt.json"), "utf8");
    const first = JSON.parse(receipt()) as { installs: Record<string, { files: unknown[] }> };

    init({ timestamp: "20260828-000002" });

    const second = JSON.parse(receipt()) as { installs: Record<string, { files: unknown[] }> };
    expect(second.installs["claude-code"].files).toEqual(first.installs["claude-code"].files);
    expect(readRegistry(home).projects).toHaveLength(1);
  });

  it("writes nothing and registers nothing on a dry run", () => {
    // A dry run that registered the project would leave a record of a setup
    // that never happened — the one thing a preview must not do.
    init({ dryRun: true });
    expect(existsSync(join(cwd, ".ariadnev", "receipt.json"))).toBe(false);
    expect(readRegistry(home).projects).toHaveLength(0);
  });

  it("refuses a directory that does not exist", () => {
    expect(() => init({ dir: join(sandbox, "absent") })).toThrow(/no such directory/);
  });

  it("creates the directory when the caller asks it to, which is what `new` needs", () => {
    const dir = join(sandbox, "fresh");
    init({ dir, createDir: true });
    expect(existsSync(join(dir, ".ariadnev", "receipt.json"))).toBe(true);
  });

  it("names the project after the directory, or after --project-id", () => {
    init({ projectId: "custom" });
    expect(readRegistry(home).projects[0].name).toBe("custom");
  });

  it("does not register a project whose install failed", () => {
    // A registry entry pointing at a directory that was never set up is a lie
    // the user has to find and clean up by hand.
    const dir = join(sandbox, "blocked");
    mkdirSync(dir, { recursive: true });
    // A plain file where the skills directory must go makes the write throw
    // ENOTDIR, the same way a real failure would.
    mkdirSync(join(dir, ".claude"), { recursive: true });
    writeFileSync(join(dir, ".claude", "skills"), "not a directory");

    expect(() => init({ dir })).toThrow();
    expect(readRegistry(home).projects).toHaveLength(0);
  });
});
