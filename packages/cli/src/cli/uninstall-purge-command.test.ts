import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NoInstallRecordError, UNINSTALL_SCHEMA_VERSION, runUninstall } from "./uninstall-command.js";

let root: string;
let home: string;
let cwd: string;
let execPath: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "ariadnev-purge-cmd-"));
  home = join(root, "home");
  cwd = join(root, "work");
  execPath = join(home, "bin", "ariadnev");
  mkdirSync(join(home, "bin"), { recursive: true });
  mkdirSync(cwd, { recursive: true });
  writeFileSync(execPath, "binary");
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

function base(over: Record<string, unknown> = {}) {
  return {
    providers: [],
    scope: "global" as const,
    dryRun: false,
    home,
    cwd,
    timestamp: "260831-0000",
    execPath,
    ...over,
  };
}

describe("runUninstall --purge", () => {
  it("still purges when the receipt is gone, instead of refusing", () => {
    // The exact state a half-cleaned machine is in: no receipt, plenty of residue.
    mkdirSync(join(home, ".ariadnev", "backups"), { recursive: true });
    writeFileSync(join(home, ".ariadnev", "history.jsonl"), "");

    const result = runUninstall(base({ purge: true }));
    expect(existsSync(join(home, ".ariadnev"))).toBe(false);
    expect(existsSync(execPath)).toBe(false);
    expect(result.purge?.state.removed).toEqual([join(home, ".ariadnev")]);
  });

  it("still refuses without --purge, so the plain command keeps its guarantee", () => {
    expect(() => runUninstall(base())).toThrow(NoInstallRecordError);
  });

  it("previews without touching anything, and says the purge cannot be undone", () => {
    mkdirSync(join(home, ".ariadnev"), { recursive: true });
    writeFileSync(join(home, ".ariadnev", "receipt.json"), JSON.stringify({ schemaVersion: 1, installs: {} }));

    const result = runUninstall(base({ purge: true, dryRun: true }));
    expect(existsSync(join(home, ".ariadnev"))).toBe(true);
    expect(existsSync(execPath)).toBe(true);
    expect(result.summary).toContain("IRREVERSIBLE");
  });

  it("carries the purge report in the json envelope, under the bumped schema", () => {
    mkdirSync(join(home, ".ariadnev"), { recursive: true });
    writeFileSync(join(home, ".ariadnev", "receipt.json"), JSON.stringify({ schemaVersion: 1, installs: {} }));

    const result = runUninstall(base({ purge: true, dryRun: true, json: true }));
    const envelope = JSON.parse(result.summary);
    expect(envelope.schema_version).toBe(UNINSTALL_SCHEMA_VERSION);
    expect(UNINSTALL_SCHEMA_VERSION).toBe(2);
    expect(envelope.data.purge.state.removed).toEqual([join(home, ".ariadnev")]);
  });

  it("leaves the state directory alone when not purging", () => {
    mkdirSync(join(home, ".ariadnev"), { recursive: true });
    writeFileSync(join(home, ".ariadnev", "receipt.json"), JSON.stringify({ schemaVersion: 1, installs: {} }));

    const result = runUninstall(base());
    expect(existsSync(join(home, ".ariadnev"))).toBe(true);
    expect(existsSync(execPath)).toBe(true);
    expect(result.purge).toBeUndefined();
  });
});
