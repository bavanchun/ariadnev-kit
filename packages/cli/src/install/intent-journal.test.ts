import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadKit } from "../kit/load-kit.js";
import { installKit } from "./install-execute.js";
import { journalPath, readJournal, writeJournal, clearJournal, JOURNAL_SCHEMA_VERSION } from "./intent-journal.js";
import { runUninstall, NoInstallRecordError } from "../cli/uninstall-command.js";

// The receipt is written once, after the last file. Anything that kills the
// process before that point used to leave files on disk with no record of
// them: `uninstall` then reported success and removed nothing. These tests
// drive a real interrupted install rather than a mocked one.

function skillMd(name: string): string {
  return `---
name: av:${name}
description: Use this fixture skill named ${name} to exercise the install crash boundary.
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

let sandbox: string;
let kitRoot: string;
let ctx: { home: string; cwd: string; scope: "project" };

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), "ariadnev-journal-"));
  kitRoot = join(sandbox, "kit");
  for (const n of ["aaa", "bbb", "ccc"]) {
    mkdirSync(join(kitRoot, "skills", n), { recursive: true });
    writeFileSync(join(kitRoot, "skills", n, "SKILL.md"), skillMd(n));
  }
  ctx = { home: join(sandbox, "home"), cwd: join(sandbox, "proj"), scope: "project" };
  mkdirSync(ctx.home, { recursive: true });
  mkdirSync(ctx.cwd, { recursive: true });
});
afterEach(() => rmSync(sandbox, { recursive: true, force: true }));

/** Every planned skill destination for claude-code, in plan order. */
function plannedSkillDests(): string[] {
  const journal = readJournal(ctx.cwd);
  return (journal?.providers[0].planned ?? [])
    .filter((p) => p.action === "write" && p.path.endsWith("SKILL.md"))
    .map((p) => join(ctx.cwd, p.path));
}

describe("journal file", () => {
  it("round-trips and is removed by clearJournal", () => {
    const journal = {
      schemaVersion: JOURNAL_SCHEMA_VERSION,
      timestamp: "20260814-000001",
      scope: "project" as const,
      providers: [{ provider: "claude-code" as const, planned: [{ path: ".claude/x.md", action: "write" as const }] }],
    };
    writeJournal(ctx.cwd, journal);
    expect(readJournal(ctx.cwd)).toEqual(journal);
    clearJournal(ctx.cwd);
    expect(readJournal(ctx.cwd)).toBeNull();
  });

  it("treats an unreadable or future-schema journal as absent", () => {
    mkdirSync(join(ctx.cwd, ".ariadnev"), { recursive: true });
    writeFileSync(journalPath(ctx.cwd), "{not json");
    expect(readJournal(ctx.cwd)).toBeNull();
    writeFileSync(journalPath(ctx.cwd), JSON.stringify({ schemaVersion: 99, providers: [] }));
    expect(readJournal(ctx.cwd)).toBeNull();
  });

  it("clearJournal on a machine that never installed is a no-op", () => {
    expect(() => clearJournal(ctx.cwd)).not.toThrow();
  });
});

describe("install writes and clears the journal", () => {
  it("leaves no journal behind after a successful install", () => {
    installKit(loadKit(kitRoot), ["claude-code"], ctx, { timestamp: "20260814-000001" });
    expect(existsSync(join(ctx.cwd, ".ariadnev", "receipt.json"))).toBe(true);
    expect(existsSync(journalPath(ctx.cwd))).toBe(false);
  });

  it("records the installed skill selection in the receipt", () => {
    installKit(loadKit(kitRoot), ["claude-code"], ctx, { timestamp: "20260814-000001" });
    const receipt = JSON.parse(readFileSync(join(ctx.cwd, ".ariadnev", "receipt.json"), "utf8")) as {
      installs: Record<string, { skillSelection: { mode: string; skills: string[]; selectedCount: number; totalCount: number } }>;
    };
    const selection = receipt.installs["claude-code"].skillSelection;
    // Sorted here, not asserted in kit order: the kit is read with readdir,
    // whose order is filesystem-dependent and differs between macOS and CI.
    expect([...selection.skills].sort()).toEqual(["aaa", "bbb", "ccc"]);
    expect(selection).toMatchObject({ mode: "all", selectedCount: 3, totalCount: 3 });
  });

  it("writes no journal for a dry run", () => {
    installKit(loadKit(kitRoot), ["claude-code"], ctx, { timestamp: "20260814-000001", dryRun: true });
    expect(existsSync(journalPath(ctx.cwd))).toBe(false);
  });
});

describe("recovery after an interrupted install", () => {
  /**
   * Interrupt the install for real: a plain file sitting where a skill's
   * directory must go makes that write throw ENOTDIR, exactly as a killed
   * process would leave the earlier files written and the later ones not.
   */
  function crashDuringInstall(): { existing: string[]; missing: string[] } {
    const dests = (() => {
      // Plan once via a dry run to learn the order without writing anything.
      installKit(loadKit(kitRoot), ["claude-code"], ctx, { timestamp: "20260814-000000", dryRun: true });
      const kit = loadKit(kitRoot);
      mkdirSync(join(ctx.cwd, ".claude", "skills"), { recursive: true });
      // Block the second planned skill dir.
      const order = kit.skills.map((s) => s.name);
      writeFileSync(join(ctx.cwd, ".claude", "skills", `av-${order[1]}`), "not a directory");
      return order;
    })();

    expect(() =>
      installKit(loadKit(kitRoot), ["claude-code"], ctx, { timestamp: "20260814-000001" }),
    ).toThrow();

    return {
      existing: [join(ctx.cwd, ".claude", "skills", `av-${dests[0]}`, "SKILL.md")],
      missing: [join(ctx.cwd, ".claude", "skills", `av-${dests[2]}`, "SKILL.md")],
    };
  }

  it("leaves a journal and no receipt when the install throws", () => {
    crashDuringInstall();
    expect(existsSync(join(ctx.cwd, ".ariadnev", "receipt.json"))).toBe(false);
    expect(readJournal(ctx.cwd)?.providers[0].provider).toBe("claude-code");
  });

  it("uninstall removes exactly the files the crashed install had written", () => {
    const { existing, missing } = crashDuringInstall();
    expect(existsSync(existing[0])).toBe(true);
    expect(existsSync(missing[0])).toBe(false);

    const planned = plannedSkillDests();
    const onDiskBefore = planned.filter((p) => existsSync(p));
    // Without this the loops below would pass on an empty set and prove nothing.
    expect(onDiskBefore.length).toBeGreaterThan(0);
    expect(onDiskBefore.length).toBeLessThan(planned.length);

    const { outcomes, summary } = runUninstall({
      providers: [],
      scope: "project",
      dryRun: false,
      home: ctx.home,
      cwd: ctx.cwd,
      timestamp: "20260814-000002",
    });

    expect(summary).toContain("recovered from an interrupted install");
    const removed = outcomes[0].result.removed;
    for (const p of onDiskBefore) expect(removed).toContain(p);
    for (const p of onDiskBefore) expect(existsSync(p)).toBe(false);
    // Nothing that was never written gets reported as removed.
    expect(removed).not.toContain(missing[0]);
  });

  it("consumes the journal, so a second uninstall does not replay the run", () => {
    crashDuringInstall();
    runUninstall({ providers: [], scope: "project", dryRun: false, home: ctx.home, cwd: ctx.cwd, timestamp: "t1" });
    expect(existsSync(journalPath(ctx.cwd))).toBe(false);
    expect(() =>
      runUninstall({ providers: [], scope: "project", dryRun: false, home: ctx.home, cwd: ctx.cwd, timestamp: "t2" }),
    ).toThrow(NoInstallRecordError);
  });

  it("keeps the journal on a dry run", () => {
    crashDuringInstall();
    const { summary } = runUninstall({
      providers: [], scope: "project", dryRun: true, home: ctx.home, cwd: ctx.cwd, timestamp: "t1",
    });
    expect(summary).toContain("DRY RUN");
    expect(existsSync(journalPath(ctx.cwd))).toBe(true);
  });
});

describe("no install record at all", () => {
  it("fails loudly instead of reporting an empty success", () => {
    expect(() =>
      runUninstall({ providers: [], scope: "project", dryRun: false, home: ctx.home, cwd: ctx.cwd, timestamp: "t1" }),
    ).toThrow(NoInstallRecordError);
  });

  it("names the directory it looked in, so a scope mix-up is diagnosable", () => {
    try {
      runUninstall({ providers: [], scope: "project", dryRun: false, home: ctx.home, cwd: ctx.cwd, timestamp: "t1" });
      throw new Error("expected a throw");
    } catch (err) {
      expect((err as Error).message).toContain(join(ctx.cwd, ".ariadnev"));
      expect((err as Error).message).toContain("--global");
    }
  });
});

describe("backups survive a mass overwrite", () => {
  it("keeps one recoverable copy per overwritten file", () => {
    installKit(loadKit(kitRoot), ["claude-code"], ctx, { timestamp: "20260814-000001" });
    for (const n of ["aaa", "bbb", "ccc"]) {
      writeFileSync(join(ctx.cwd, ".claude", "skills", `av-${n}`, "SKILL.md"), `local edit ${n}`);
    }

    installKit(loadKit(kitRoot), ["claude-code"], ctx, { timestamp: "20260814-000002" });

    const manifest = JSON.parse(
      readFileSync(join(ctx.cwd, ".ariadnev", "backups", "20260814-000002", "manifest.json"), "utf8"),
    ) as { originalPath: string; relPath: string }[];
    const skillBackups = manifest.filter((e) => e.originalPath.endsWith("SKILL.md"));
    expect(skillBackups).toHaveLength(3);
    const contents = skillBackups
      .map((e) => readFileSync(join(ctx.cwd, ".ariadnev", "backups", "20260814-000002", e.relPath), "utf8"))
      .sort();
    expect(contents).toEqual(["local edit aaa", "local edit bbb", "local edit ccc"]);
  });
});
