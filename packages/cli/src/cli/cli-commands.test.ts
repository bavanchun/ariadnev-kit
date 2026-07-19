import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runInstall } from "./install-command.js";
import { runDoctor } from "./doctor-command.js";
import { runList } from "./list-command.js";
import { renderSummary } from "./render-summary.js";
import { nowStamp } from "./timestamp.js";

const here = dirname(fileURLToPath(import.meta.url));
const kitRoot = join(here, "..", "..", "..", "..", "kit");

let sandbox: string;
let base: { home: string; cwd: string };
beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), "vcskill-cli-"));
  base = { home: join(sandbox, "home"), cwd: join(sandbox, "proj") };
  mkdirSync(base.home, { recursive: true });
  mkdirSync(base.cwd, { recursive: true });
});
afterEach(() => rmSync(sandbox, { recursive: true, force: true }));

describe("renderSummary", () => {
  it("formats a known result set", () => {
    const out = renderSummary(
      [{ provider: "codex", written: 5, backedUp: 1, skipped: [{ action: "skip", kind: "agent", name: "x", reason: "unverified" }], ops: [] }],
      false,
    );
    expect(out).toContain("vcskill install — complete");
    expect(out).toContain("codex");
    expect(out).toContain("written=5");
    expect(out).toContain("skip agent/x: unverified");
  });

  it("marks dry-run", () => {
    expect(renderSummary([], true)).toContain("DRY RUN");
  });
});

describe("runInstall handler", () => {
  it("dry-run multi-provider covers both, writes nothing", () => {
    const { results } = runInstall({
      providers: ["codex", "cursor"],
      scope: "project",
      dryRun: true,
      home: base.home,
      cwd: base.cwd,
      kitRoot,
      timestamp: nowStamp(),
    });
    expect(results.map((r) => r.provider)).toEqual(["codex", "cursor"]);
    expect(existsSync(join(base.cwd, ".agents"))).toBe(false);
  });

  it("prints a settings snippet when hook merge is not confirmed", () => {
    const hookKitRoot = join(sandbox, "hook-kit");
    mkdirSync(join(hookKitRoot, "skills"), { recursive: true });
    const hookDir = join(hookKitRoot, "hooks", "session-init");
    mkdirSync(hookDir, { recursive: true });
    writeFileSync(join(hookDir, "hook.cjs"), "process.exit(0);\n");
    writeFileSync(
      join(hookDir, "hook.json"),
      JSON.stringify({ event: "SessionStart", description: "init env" }),
    );
    const { summary } = runInstall({
      providers: ["claude-code"],
      scope: "project",
      dryRun: false,
      home: base.home,
      cwd: base.cwd,
      kitRoot: hookKitRoot,
      timestamp: nowStamp(),
    });
    expect(summary).toContain("settings.json");
    expect(summary).toContain("session-init.cjs");
    expect(existsSync(join(base.cwd, ".claude/settings.json"))).toBe(false);
  });

  it("rejects unknown provider", () => {
    expect(() =>
      runInstall({ providers: ["bogus"], scope: "project", dryRun: true, home: base.home, cwd: base.cwd, kitRoot, timestamp: "t" }),
    ).toThrow(/unknown provider/);
  });

  it("real install writes files", () => {
    runInstall({ providers: ["claude-code"], scope: "project", dryRun: false, home: base.home, cwd: base.cwd, kitRoot, timestamp: nowStamp() });
    expect(existsSync(join(base.cwd, ".claude/skills/brainstorm/SKILL.md"))).toBe(true);
  });
});

describe("runList handler", () => {
  it("lists kit + detects install state", () => {
    const before = runList({ scope: "project", home: base.home, cwd: base.cwd, kitRoot });
    expect(before).toContain("brainstorm");
    expect(before).toContain("not installed");
    runInstall({ providers: ["claude-code"], scope: "project", dryRun: false, home: base.home, cwd: base.cwd, kitRoot, timestamp: nowStamp() });
    const after = runList({ scope: "project", home: base.home, cwd: base.cwd, kitRoot });
    expect(after).toMatch(/claude-code\s+installed/);
  });
});

describe("runDoctor handler (sandbox integration)", () => {
  it("reports not-installed with exit code 2 when no receipt exists", () => {
    const res = runDoctor({ scope: "project", home: base.home, cwd: base.cwd, kitRoot });
    expect(res.status).toBe("not-installed");
    expect(res.exitCode).toBe(2);
  });

  it("reports healthy with exit code 0 right after a real install", () => {
    runInstall({
      providers: ["claude-code"],
      scope: "project",
      dryRun: false,
      home: base.home,
      cwd: base.cwd,
      kitRoot,
      timestamp: nowStamp(),
    });
    const res = runDoctor({ scope: "project", home: base.home, cwd: base.cwd, kitRoot });
    expect(res.status).toBe("healthy");
    expect(res.exitCode).toBe(0);
  });

  it("detects a deleted file as degraded with exit code 1, naming the file", () => {
    runInstall({
      providers: ["claude-code"],
      scope: "project",
      dryRun: false,
      home: base.home,
      cwd: base.cwd,
      kitRoot,
      timestamp: nowStamp(),
    });
    rmSync(join(base.cwd, ".claude/skills/brainstorm/SKILL.md"));
    const res = runDoctor({ scope: "project", home: base.home, cwd: base.cwd, kitRoot });
    expect(res.status).toBe("degraded");
    expect(res.exitCode).toBe(1);
    expect(res.summary).toContain("brainstorm/SKILL.md");
  });
});
