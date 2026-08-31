import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { planPurge, type PurgePlanDeps, type PurgePlanOpts } from "./purge-plan.js";
import { STATE_DIRECTORY_ENTRIES } from "../storage/operational-paths.js";

const HOME = "/home/u";
const CWD = "/work/proj";
const EXEC = "/home/u/.local/bin/ariadnev";

interface World {
  files?: Set<string>;
  entries?: Record<string, string[]>;
  json?: Record<string, unknown>;
  links?: Record<string, string>;
  identical?: [string, string][];
  platform?: NodeJS.Platform;
}

function deps(world: World): PurgePlanDeps {
  const files = world.files ?? new Set<string>();
  return {
    fileExists: (p) => files.has(p),
    listEntries: (dir) => world.entries?.[dir] ?? [],
    readJson: (p) => world.json?.[p] ?? null,
    readLinkTarget: (p) => world.links?.[p] ?? null,
    sameContent: (a, b) => (world.identical ?? []).some(([x, y]) => x === a && y === b),
    platform: world.platform ?? "linux",
  };
}

function opts(over: Partial<PurgePlanOpts> = {}): PurgePlanOpts {
  return { home: HOME, cwd: CWD, scope: "global", execPath: EXEC, ...over };
}

const STATE = join(HOME, ".ariadnev");

describe("planPurge — state directory", () => {
  it("removes the directory whole when its top level is entirely known", () => {
    const plan = planPurge(
      deps({ files: new Set([STATE]), entries: { [STATE]: ["backups", "receipt.json", "operational"] } }),
      opts(),
    );
    expect(plan.state).toEqual([{ action: "remove-tree", path: STATE, reason: "ariadnev state directory" }]);
  });

  it("keeps an unrecognised entry, reports it, and removes the rest one by one", () => {
    const plan = planPurge(
      deps({ files: new Set([STATE]), entries: { [STATE]: ["backups", "notes.txt"] } }),
      opts(),
    );
    expect(plan.state).toContainEqual({
      action: "report-kept",
      path: join(STATE, "notes.txt"),
      reason: "not part of ariadnev's state layout",
    });
    expect(plan.state).toContainEqual({ action: "remove-tree", path: join(STATE, "backups"), reason: "ariadnev state" });
    // The parent survives, so the stray file survives with it.
    expect(plan.state).not.toContainEqual(expect.objectContaining({ path: STATE, action: "remove-tree" }));
  });

  it("plans nothing when there is no state directory", () => {
    expect(planPurge(deps({}), opts()).state).toEqual([]);
  });

  it("recognises every entry the layout constant names", () => {
    const plan = planPurge(
      deps({ files: new Set([STATE]), entries: { [STATE]: [...STATE_DIRECTORY_ENTRIES] } }),
      opts(),
    );
    expect(plan.state).toEqual([{ action: "remove-tree", path: STATE, reason: "ariadnev state directory" }]);
  });
});

describe("planPurge — registered projects", () => {
  const A = "/work/a";
  const B = "/work/b";

  it("plans one target per registered project, sorted, skipping the current directory", () => {
    const plan = planPurge(
      deps({
        files: new Set([B, A, join(A, ".ariadnev", "receipt.json")]),
        json: {
          [join(HOME, ".ariadnev", "projects.json")]: {
            version: 1,
            projects: [
              { name: "b", dir: B },
              { name: "cur", dir: CWD },
              { name: "a", dir: A },
            ],
          },
        },
      }),
      opts(),
    );
    expect(plan.projects).toEqual([
      { name: "a", dir: A, status: "ready" },
      { name: "b", dir: B, status: "no-receipt" },
    ]);
  });

  it("marks a registered directory that no longer exists as missing", () => {
    const plan = planPurge(
      deps({ json: { [join(HOME, ".ariadnev", "projects.json")]: { version: 1, projects: [{ name: "gone", dir: A }] } } }),
      opts(),
    );
    expect(plan.projects).toEqual([{ name: "gone", dir: A, status: "missing" }]);
  });

  it("plans no fan-out at project scope", () => {
    const plan = planPurge(
      deps({ json: { [join(HOME, ".ariadnev", "projects.json")]: { version: 1, projects: [{ name: "a", dir: A }] } } }),
      opts({ scope: "project" }),
    );
    expect(plan.projects).toEqual([]);
  });
});

describe("planPurge — MCP residue", () => {
  const USER_CONFIG = join(HOME, ".claude.json");

  it("removes a server that runs the binary being deleted, and keeps one that does not", () => {
    const plan = planPurge(
      deps({
        files: new Set([USER_CONFIG]),
        json: {
          [USER_CONFIG]: {
            mcpServers: {
              ours: { command: EXEC },
              alias: { command: "av" },
              theirs: { command: "/opt/other/server" },
            },
          },
        },
      }),
      opts(),
    );
    expect(plan.mcp).toContainEqual({ action: "remove-mcp-server", path: USER_CONFIG, name: "ours" });
    expect(plan.mcp).toContainEqual({ action: "remove-mcp-server", path: USER_CONFIG, name: "alias" });
    expect(plan.mcp).toContainEqual({
      action: "report-kept",
      path: `${USER_CONFIG}#theirs`,
      reason: 'MCP server ariadnev cannot prove it added (runs "/opt/other/server")',
    });
  });

  it("removes the backup file the mcp command leaves behind", () => {
    const backup = `${USER_CONFIG}.ariadnev-backup`;
    const plan = planPurge(deps({ files: new Set([backup]) }), opts());
    expect(plan.mcp).toEqual([{ action: "remove-file", path: backup }]);
  });

  it("reads only the project config at project scope", () => {
    const plan = planPurge(
      deps({
        files: new Set([USER_CONFIG]),
        json: { [USER_CONFIG]: { mcpServers: { ours: { command: EXEC } } } },
      }),
      opts({ scope: "project" }),
    );
    expect(plan.mcp).toEqual([]);
  });
});

describe("planPurge — binary", () => {
  const ALIAS = "/home/u/.local/bin/av";

  it("removes our symlinked alias before the binary it points at", () => {
    const plan = planPurge(
      deps({ files: new Set([EXEC, ALIAS]), links: { [ALIAS]: "ariadnev" } }),
      opts(),
    );
    expect(plan.binary).toEqual([
      { action: "remove-binary", path: ALIAS },
      { action: "remove-binary", path: EXEC },
    ]);
  });

  it("removes a byte-identical copy, the shape install.ps1 leaves", () => {
    const plan = planPurge(
      deps({ files: new Set([EXEC, ALIAS]), identical: [[ALIAS, EXEC]] }),
      opts(),
    );
    expect(plan.binary[0]).toEqual({ action: "remove-binary", path: ALIAS });
  });

  it("leaves an 'av' that is not ours, exactly as the installer refuses to clobber it", () => {
    const plan = planPurge(deps({ files: new Set([EXEC, ALIAS]) }), opts());
    expect(plan.binary).toContainEqual({
      action: "report-kept",
      path: ALIAS,
      reason: "an 'av' that is not ariadnev's — left alone, as the installer leaves it",
    });
    expect(plan.binary).not.toContainEqual({ action: "remove-binary", path: ALIAS });
  });

  it("deletes nothing on Windows, where a running executable cannot be unlinked", () => {
    const winExec = "C:\\Users\\u\\AppData\\Local\\Programs\\ariadnev\\ariadnev.exe";
    const plan = planPurge(
      deps({ files: new Set([winExec]), platform: "win32" }),
      opts({ execPath: winExec }),
    );
    expect(plan.binary.every((op) => op.action === "report-kept")).toBe(true);
  });

  it("plans no binary removal at project scope", () => {
    expect(planPurge(deps({ files: new Set([EXEC]) }), opts({ scope: "project" })).binary).toEqual([]);
  });
});
