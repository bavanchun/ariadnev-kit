import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readAppliedState, writeAppliedState } from "../migrate/applied-state.js";
import { backupPath } from "../install/backup.js";
import { EXIT, UnavailableError, UsageError } from "./exit-codes.js";
import { runMcpLink } from "./mcp-command.js";
import { LEGACY_CONFIG_DIRS, findLegacyPrefs, migrateBackups, runMigratePrefs, runMigrateRollback } from "./migrate-extras.js";

// Read from the source rather than spelled out here: the pre-rename directory
// name is the one thing this feature is about, and a test that hardcodes it
// would keep passing against a list that had changed underneath it.
const LEGACY = join(LEGACY_CONFIG_DIRS[0] as string, "config.json");

const dirs: string[] = [];
const mk = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "ariadnev-migx-"));
  dirs.push(dir);
  return dir;
};

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function put(path: string, content: string): string {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  return path;
}

const base = (root: string) => ({ home: root, cwd: root, timestamp: "20260829-142000" });

describe("migrate prefs", () => {
  it("finds a pre-rename config and imports it", () => {
    const root = mk();
    put(join(root, LEGACY), '{"paths":{"plans":"plans"}}');
    expect(findLegacyPrefs(root)).toMatchObject({ from: join(root, LEGACY) });
    const result = runMigratePrefs(base(root));
    expect(result.exitCode).toBe(EXIT.ok);
    expect(readFileSync(join(root, ".ariadnev", "config.json"), "utf8")).toContain('"plans"');
  });

  it("says so and does nothing when there is no legacy config", () => {
    const root = mk();
    expect(runMigratePrefs(base(root)).output).toMatch(/nothing to import/);
    expect(existsSync(join(root, ".ariadnev", "config.json"))).toBe(false);
  });

  it("refuses to merge when both exist, rather than picking a winner per key", () => {
    const root = mk();
    put(join(root, LEGACY), "{}");
    put(join(root, ".ariadnev", "config.json"), '{"mine":true}');
    expect(() => runMigratePrefs(base(root))).toThrow(UsageError);
    expect(() => runMigratePrefs(base(root))).toThrow(/Merging them would silently pick a winner/);
    // And the existing config is untouched.
    expect(readFileSync(join(root, ".ariadnev", "config.json"), "utf8")).toContain("mine");
  });

  it("refuses a corrupt source instead of importing something the loader rejects", () => {
    const root = mk();
    put(join(root, LEGACY), "{ truncated");
    expect(() => runMigratePrefs(base(root))).toThrow(/not valid JSON/);
    expect(existsSync(join(root, ".ariadnev", "config.json"))).toBe(false);
  });

  it("writes nothing under --dry-run", () => {
    const root = mk();
    put(join(root, LEGACY), "{}");
    const result = runMigratePrefs({ ...base(root), dryRun: true });
    expect(result.output).toMatch(/would import/);
    expect(existsSync(join(root, ".ariadnev", "config.json"))).toBe(false);
  });

  it("never writes back to the legacy file, so the old tool keeps working", () => {
    const root = mk();
    const legacy = put(join(root, LEGACY), '{"a":1}');
    runMigratePrefs(base(root));
    expect(readFileSync(legacy, "utf8")).toBe('{"a":1}');
  });
});

// Paths under a provider directory, because that is all `av migrate` ever
// moves — and because `runBackupsRestore` refuses anything outside ariadnev's
// install surface. Reusing that function rather than writing a second restore
// is what gives `migrate rollback` that guard for free.
const SKILL_A = join(".claude", "skills", "av-scout", "SKILL.md");
const SKILL_B = join(".agents", "skills", "av-plan", "SKILL.md");

/** A backup shaped exactly like the one `av migrate` leaves behind. */
function seedMigrateBackup(root: string, stamp: string, target: string, content: string): void {
  put(target, content);
  backupPath(target, join(root, ".ariadnev", "backups", stamp), "migrate", root);
  rmSync(target);
}

describe("migrate rollback", () => {
  it("finds only backups that a migration created", () => {
    const root = mk();
    seedMigrateBackup(root, "20260829-100000", join(root, SKILL_A), "one");
    // A backup from some other command must not be offered as a rollback target.
    put(join(root, SKILL_B), "x");
    backupPath(join(root, SKILL_B), join(root, ".ariadnev", "backups", "20260829-110000"), "install", root);
    expect(migrateBackups(base(root))).toEqual(["20260829-100000"]);
  });

  it("restores what the migration moved and forgets the applied keys", () => {
    const root = mk();
    const moved = join(root, SKILL_A);
    seedMigrateBackup(root, "20260829-100000", moved, "original");
    writeAppliedState(root, new Set(["antigravity:skill:.agent/skills"]));

    const result = runMigrateRollback(base(root));
    expect(result.exitCode).toBe(EXIT.ok);
    expect(readFileSync(moved, "utf8")).toBe("original");
    expect(readAppliedState(root).size).toBe(0);
  });

  it("keeps the ledger when nothing was actually restored", () => {
    // Clearing first would leave the files moved and the ledger saying they are
    // not, so the next migrate would move them again from an empty location.
    const root = mk();
    seedMigrateBackup(root, "20260829-100000", join(root, SKILL_A), "x");
    writeAppliedState(root, new Set(["k"]));
    runMigrateRollback({ ...base(root), dryRun: true });
    expect(readAppliedState(root).has("k")).toBe(true);
  });

  it("inherits the install-surface guard, so it cannot restore an arbitrary path", () => {
    // A rollback that could write anywhere would be a write-anywhere primitive.
    // `av migrate` only ever moves provider install paths, and reusing
    // `runBackupsRestore` is what makes that a checked property rather than a
    // convention.
    const root = mk();
    seedMigrateBackup(root, "20260829-100000", join(root, "somewhere", "else.md"), "x");
    expect(() => runMigrateRollback(base(root))).toThrow(/does not install/);
  });

  it("says there is nothing to roll back rather than failing obscurely", () => {
    expect(() => runMigrateRollback(base(mk()))).toThrow(UnavailableError);
    expect(() => runMigrateRollback(base(mk()))).toThrow(/no backup from/);
  });

  it("refuses a named backup that holds no migration", () => {
    const root = mk();
    seedMigrateBackup(root, "20260829-100000", join(root, SKILL_A), "x");
    expect(() => runMigrateRollback({ ...base(root), to: "20260829-999999" })).toThrow(/holds nothing from/);
  });

  it("takes the newest migration backup when none is named", () => {
    const root = mk();
    seedMigrateBackup(root, "20260829-100000", join(root, SKILL_A), "old");
    seedMigrateBackup(root, "20260829-120000", join(root, SKILL_B), "new");
    const result = runMigrateRollback(base(root));
    expect(result.output).toContain("20260829-120000");
    expect(readFileSync(join(root, SKILL_B), "utf8")).toBe("new");
  });
});

describe("mcp link", () => {
  function withUserServer(root: string, env?: Record<string, string>): void {
    put(join(root, ".claude.json"), JSON.stringify({ mcpServers: { db: { command: "pg-mcp", args: ["--x"], ...(env ? { env } : {}) } } }));
  }

  it("copies a user server into the project config, leaving the source alone", () => {
    const root = mk();
    withUserServer(root);
    const result = runMcpLink("db", { home: root, cwd: root, toProject: true });
    expect(result.exitCode).toBe(EXIT.ok);
    expect(JSON.parse(readFileSync(join(root, ".mcp.json"), "utf8")).mcpServers.db.command).toBe("pg-mcp");
    // A copy, never a move: recovering from `link` deleting the original means
    // retyping a config with an API key in it.
    expect(JSON.parse(readFileSync(join(root, ".claude.json"), "utf8")).mcpServers.db).toBeTruthy();
  });

  it("copies a project server into the user config by default", () => {
    const root = mk();
    put(join(root, ".mcp.json"), JSON.stringify({ mcpServers: { local: { command: "x" } } }));
    runMcpLink("local", { home: root, cwd: root });
    expect(JSON.parse(readFileSync(join(root, ".claude.json"), "utf8")).mcpServers.local.command).toBe("x");
  });

  it("refuses to put env values into the repository config without --allow-secrets", () => {
    // .mcp.json is usually committed, and an MCP server's env is where its API
    // keys live.
    const root = mk();
    withUserServer(root, { PGPASSWORD: "hunter2" });
    expect(() => runMcpLink("db", { home: root, cwd: root, toProject: true })).toThrow(/--allow-secrets/);
    expect(existsSync(join(root, ".mcp.json"))).toBe(false);
  });

  it("carries the env verbatim once that is allowed", () => {
    const root = mk();
    withUserServer(root, { PGPASSWORD: "hunter2" });
    runMcpLink("db", { home: root, cwd: root, toProject: true, allowSecrets: true });
    expect(JSON.parse(readFileSync(join(root, ".mcp.json"), "utf8")).mcpServers.db.env.PGPASSWORD).toBe("hunter2");
  });

  it("does not require the flag when mirroring into the user's own config", () => {
    const root = mk();
    put(join(root, ".mcp.json"), JSON.stringify({ mcpServers: { s: { command: "x", env: { K: "v" } } } }));
    expect(runMcpLink("s", { home: root, cwd: root }).exitCode).toBe(EXIT.ok);
  });

  it("refuses when the server is already in the target scope", () => {
    const root = mk();
    withUserServer(root);
    expect(() => runMcpLink("db", { home: root, cwd: root })).toThrow(/already in/);
  });

  it("reports an unknown server rather than writing an empty one", () => {
    const root = mk();
    const result = runMcpLink("ghost", { home: root, cwd: root, toProject: true });
    expect(result.exitCode).toBe(EXIT.failed);
    expect(existsSync(join(root, ".mcp.json"))).toBe(false);
  });

  it("writes nothing under --dry-run", () => {
    const root = mk();
    withUserServer(root);
    const result = runMcpLink("db", { home: root, cwd: root, toProject: true, dryRun: true });
    expect(result.output).toMatch(/would mirror/);
    expect(existsSync(join(root, ".mcp.json"))).toBe(false);
  });
});
