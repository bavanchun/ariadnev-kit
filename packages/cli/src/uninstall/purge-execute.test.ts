import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executePurge, purgePlanFor, type PurgeExecuteOpts } from "./purge-execute.js";
import { planPurge } from "./purge-plan.js";
import { realPurgeDeps } from "./purge-execute.js";

let root: string;
let home: string;
let cwd: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "ariadnev-purge-"));
  home = join(root, "home");
  cwd = join(root, "work");
  mkdirSync(home, { recursive: true });
  mkdirSync(cwd, { recursive: true });
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

function write(path: string, body: string): string {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, body);
  return path;
}

function opts(over: Partial<PurgeExecuteOpts> = {}): PurgeExecuteOpts {
  const execPath = over.execPath ?? join(home, ".local", "bin", "ariadnev");
  return {
    dryRun: false,
    timestamp: "260831-0000",
    home,
    cwd,
    scope: "global",
    execPath,
    allowedRoots: [home, cwd, join(home, ".local", "bin")],
    ...over,
  };
}

describe("executePurge — state directory", () => {
  it("removes the whole state directory when its layout is clean", () => {
    write(join(home, ".ariadnev", "receipt.json"), "{}");
    mkdirSync(join(home, ".ariadnev", "backups", "old"), { recursive: true });
    const o = opts();
    const execution = executePurge(purgePlanFor(o), o);
    expect(existsSync(join(home, ".ariadnev"))).toBe(false);
    expect(execution.state.removed).toEqual([join(home, ".ariadnev")]);
  });

  it("keeps a stray file and everything that holds it up", () => {
    write(join(home, ".ariadnev", "receipt.json"), "{}");
    write(join(home, ".ariadnev", "my-notes.txt"), "mine");
    const o = opts();
    const execution = executePurge(purgePlanFor(o), o);
    expect(existsSync(join(home, ".ariadnev", "my-notes.txt"))).toBe(true);
    expect(existsSync(join(home, ".ariadnev", "receipt.json"))).toBe(false);
    expect(execution.state.preserved).toContainEqual({
      path: join(home, ".ariadnev", "my-notes.txt"),
      reason: "not part of ariadnev's state layout",
    });
  });

  it("deletes nothing on a dry run", () => {
    write(join(home, ".ariadnev", "receipt.json"), "{}");
    const o = opts({ dryRun: true });
    const execution = executePurge(purgePlanFor(o), o);
    expect(existsSync(join(home, ".ariadnev"))).toBe(true);
    expect(execution.state.removed).toEqual([join(home, ".ariadnev")]);
  });

  it("refuses a path outside the allowed roots", () => {
    const outside = join(root, "elsewhere");
    mkdirSync(outside, { recursive: true });
    expect(() =>
      executePurge(
        { projects: [], mcp: [], state: [{ action: "remove-tree", path: outside, reason: "x" }], binary: [] },
        opts(),
      ),
    ).toThrow(/outside allowed roots/);
    expect(existsSync(outside)).toBe(true);
  });
});

describe("executePurge — MCP residue", () => {
  it("drops our server, keeps theirs, and leaves the rest of the file alone", () => {
    const exec = join(home, ".local", "bin", "ariadnev");
    write(exec, "#!/bin/sh\n");
    const config = join(home, ".claude.json");
    write(
      config,
      JSON.stringify({
        someOtherKey: { keep: true },
        mcpServers: { ours: { command: exec }, theirs: { command: "/opt/x" } },
      }),
    );
    write(`${config}.ariadnev-backup`, "{}");
    // A state directory for the backup copy to land in.
    mkdirSync(join(home, ".ariadnev"), { recursive: true });

    const o = opts({ execPath: exec });
    const plan = purgePlanFor(o);
    // Only the MCP pass here, so the state pass does not delete the backup we
    // are about to assert on.
    executePurge({ ...plan, state: [], binary: [], projects: [] }, o);

    const after = JSON.parse(readFileSync(config, "utf8"));
    expect(after.mcpServers).toEqual({ theirs: { command: "/opt/x" } });
    expect(after.someOtherKey).toEqual({ keep: true });
    expect(existsSync(`${config}.ariadnev-backup`)).toBe(false);
  });
});

describe("executePurge — binary", () => {
  it("removes our symlinked alias and the binary it points at", () => {
    const bin = join(home, ".local", "bin");
    const exec = join(bin, "ariadnev");
    write(exec, "binary");
    symlinkSync("ariadnev", join(bin, "av"));

    const o = opts({ execPath: exec });
    executePurge(purgePlanFor(o), o);
    expect(existsSync(exec)).toBe(false);
    expect(existsSync(join(bin, "av"))).toBe(false);
  });

  it("leaves a foreign av standing", () => {
    const bin = join(home, ".local", "bin");
    const exec = join(bin, "ariadnev");
    write(exec, "binary");
    write(join(bin, "av"), "someone else's tool");

    const o = opts({ execPath: exec });
    const execution = executePurge(purgePlanFor(o), o);
    expect(existsSync(join(bin, "av"))).toBe(true);
    expect(existsSync(exec)).toBe(false);
    expect(execution.binary.preserved.map((p) => p.path)).toEqual([join(bin, "av")]);
  });
});

describe("executePurge — registered projects", () => {
  it("removes a registered project's state directory and reports the target", () => {
    const other = join(root, "other-project");
    mkdirSync(other, { recursive: true });
    write(join(other, ".ariadnev", "config.json"), "{}");
    write(
      join(home, ".ariadnev", "projects.json"),
      JSON.stringify({ version: 1, projects: [{ name: "other", dir: other }] }),
    );

    const o = opts({ allowedRoots: [home, cwd, other, join(home, ".local", "bin")] });
    const execution = executePurge(purgePlanFor(o), o);

    expect(execution.projects).toHaveLength(1);
    expect(execution.projects[0].target.status).toBe("no-receipt");
    expect(existsSync(join(other, ".ariadnev"))).toBe(false);
    expect(existsSync(other)).toBe(true);
  });

  it("skips a registered directory that is gone without failing", () => {
    write(
      join(home, ".ariadnev", "projects.json"),
      JSON.stringify({ version: 1, projects: [{ name: "gone", dir: join(root, "vanished") }] }),
    );
    const o = opts();
    const execution = executePurge(purgePlanFor(o), o);
    expect(execution.projects[0].target.status).toBe("missing");
    expect(execution.projects[0].residue.removed).toEqual([]);
  });

  it("never visits the current directory twice", () => {
    write(join(cwd, ".ariadnev", "config.json"), "{}");
    write(
      join(home, ".ariadnev", "projects.json"),
      JSON.stringify({ version: 1, projects: [{ name: "cur", dir: cwd }] }),
    );
    const plan = planPurge(realPurgeDeps, { home, cwd, scope: "global", execPath: join(home, "x") });
    expect(plan.projects).toEqual([]);
  });
});
