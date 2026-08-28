import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { RECOVER_PREVIEW_WARNING, runRecover } from "./recover-command.js";

const dirs: string[] = [];
const mk = () => {
  const dir = mkdtempSync(join(tmpdir(), "ariadnev-recover-"));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const STAMP = "20260828-120000";
/** The schema requires a real 64-hex digest; the value itself is not checked here. */
const DIGEST = "a".repeat(64);

/** A project root with one backup holding one installed file. */
function withBackup(): { home: string; cwd: string; target: string } {
  const home = mk();
  const cwd = join(home, "project");
  const target = join(cwd, ".claude", "skills", "demo", "SKILL.md");
  mkdirSync(join(target, ".."), { recursive: true });
  writeFileSync(target, "current\n");

  const root = join(cwd, ".ariadnev", "backups", STAMP);
  const relPath = join("scope", ".claude", "skills", "demo", "SKILL.md");
  mkdirSync(join(root, relPath, ".."), { recursive: true });
  writeFileSync(join(root, relPath), "backed up\n");
  writeFileSync(
    join(root, "manifest.json"),
    JSON.stringify({
      manifestVersion: 2,
      entries: [{ originalPath: target, relPath, label: "skill", kind: "file", sha256: DIGEST, size: 10 }],
    }),
  );
  return { home, cwd, target };
}

const base = (home: string, cwd: string) => ({
  home,
  cwd,
  scope: "project" as const,
  timestamp: STAMP,
  preRestoreTimestamp: "20260828-130000",
});

describe("recover previews by default", () => {
  it("writes nothing and warns that this used to write", () => {
    // The dangerous half of this change: a scripted `av recover <id>` becomes a
    // no-op that still exits 0 and still prints restore-shaped output. Someone
    // believes their machine was restored when it was not.
    const { home, cwd, target } = withBackup();

    const result = runRecover(base(home, cwd));

    expect(readFileSync(target, "utf8"), "the live file is untouched").toBe("current\n");
    expect(result.output).toContain(RECOVER_PREVIEW_WARNING);
    expect(result.restored).toEqual([target]);
  });

  it("restores when --yes is passed", () => {
    const { home, cwd, target } = withBackup();

    const result = runRecover({ ...base(home, cwd), yes: true });

    expect(readFileSync(target, "utf8")).toBe("backed up\n");
    expect(result.output).not.toContain(RECOVER_PREVIEW_WARNING);
  });

  it("keeps the pre-restore safety backup the hardened path takes", () => {
    // Restoring overwrites live files, so the current state is backed up first.
    // That belongs to the restore path and this must not bypass it.
    const { home, cwd } = withBackup();
    runRecover({ ...base(home, cwd), yes: true });
    expect(existsSync(join(cwd, ".ariadnev", "backups", "pre-restore-20260828-130000"))).toBe(true);
  });

  it("does not warn when the preview was asked for explicitly", () => {
    // `--dry-run` meant "show me the plan" before this change and still does, so
    // nothing about it is news. A warning on every invocation is one nobody
    // reads by the third day.
    const { home, cwd } = withBackup();
    const result = runRecover({ ...base(home, cwd), dryRun: true });

    expect(result.output).not.toContain(RECOVER_PREVIEW_WARNING);
    expect(result.output).toMatch(/Nothing was restored/);
  });

  it("carries the warning in the JSON, where a script is the only reader", () => {
    const { home, cwd } = withBackup();
    const parsed = JSON.parse(runRecover({ ...base(home, cwd), json: true }).output) as {
      data: { applied: boolean; previewed: boolean; warning?: string };
    };

    expect(parsed.data).toMatchObject({ applied: false, previewed: true });
    expect(parsed.data.warning).toBe(RECOVER_PREVIEW_WARNING);
  });

  it("drops the warning from the JSON once --yes is used", () => {
    const { home, cwd } = withBackup();
    const parsed = JSON.parse(runRecover({ ...base(home, cwd), yes: true, json: true }).output) as {
      data: { applied: boolean; warning?: string };
    };
    expect(parsed.data.applied).toBe(true);
    expect(parsed.data.warning).toBeUndefined();
  });
});

describe("--allow-root only ever narrows", () => {
  it("refuses an entry outside the roots the caller authorised", () => {
    const { home, cwd } = withBackup();

    const result = runRecover({ ...base(home, cwd), yes: true, allowRoot: [join(home, "elsewhere")] });

    expect(result.exitCode).toBe(2);
    expect(result.output).toMatch(/outside the roots you authorised/);
    expect(result.restored).toEqual([]);
  });

  it("proceeds when the authorised root covers the entry", () => {
    const { home, cwd, target } = withBackup();

    const result = runRecover({ ...base(home, cwd), yes: true, allowRoot: [cwd] });

    expect(result.exitCode).toBe(0);
    expect(readFileSync(target, "utf8")).toBe("backed up\n");
  });

  it("refuses before writing anything, not partway through", () => {
    // A half-applied restore is worse than a refused one — the same discipline
    // the manifest check already follows one level down.
    const { home, cwd, target } = withBackup();
    runRecover({ ...base(home, cwd), yes: true, allowRoot: ["/nowhere-at-all"] });
    expect(readFileSync(target, "utf8")).toBe("current\n");
  });

  it("leaves the default roots in charge when the flag is absent", () => {
    const { home, cwd, target } = withBackup();
    expect(runRecover({ ...base(home, cwd), yes: true }).exitCode).toBe(0);
    expect(readFileSync(target, "utf8")).toBe("backed up\n");
  });
});

describe("the hardening underneath is untouched", () => {
  it("still refuses a manifest entry pointing outside the install surface", () => {
    // This is `260822-1407` phase 5's guarantee, reached through the new
    // command. If this ever needs relaxing, the change above is wrong.
    const home = mk();
    const cwd = join(home, "project");
    const root = join(cwd, ".ariadnev", "backups", STAMP);
    mkdirSync(join(root, "abs"), { recursive: true });
    writeFileSync(join(root, "abs", "authorized_keys"), "pwned\n");
    writeFileSync(
      join(root, "manifest.json"),
      JSON.stringify({
        manifestVersion: 2,
        entries: [{
          originalPath: join(home, ".ssh", "authorized_keys"),
          relPath: join("abs", "authorized_keys"),
          label: "x", kind: "file", sha256: DIGEST, size: 6,
        }],
      }),
    );

    expect(() => runRecover({ ...base(home, cwd), yes: true })).toThrow(/does not install/);
    expect(existsSync(join(home, ".ssh", "authorized_keys"))).toBe(false);
  });
});
