import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildDiagnostics, runDiagnosticsExport } from "./diagnostics-command.js";
import { assertNoForbiddenKeys, isForbiddenKey, maskHome, scrub, scrubDeep } from "../diagnostics/redact.js";
import { registryPath } from "../projects/registry.js";
import { activityRoot } from "../storage/operational-paths.js";
import { enableProject } from "../content-search/lifecycle.js";

const dirs: string[] = [];
const mk = () => {
  const dir = mkdtempSync(join(tmpdir(), "ariadnev-diag-"));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const NOW = "2026-08-28T00:00:00.000Z";

/** A home with a secret-shaped path and a credential in a file it may read. */
function populated(): { home: string; cwd: string } {
  const home = mk();
  const cwd = join(home, "work", "myapp");
  mkdirSync(cwd, { recursive: true });
  mkdirSync(join(home, ".ariadnev"), { recursive: true });
  writeFileSync(
    registryPath(home),
    JSON.stringify({ version: 1, projects: [{ name: "myapp", dir: cwd, registered_at: NOW, updated_at: NOW }] }),
  );
  mkdirSync(activityRoot(home), { recursive: true });
  writeFileSync(join(activityRoot(home), "activity-20260828.jsonl"), "{}\n");
  enableProject(home, cwd, "myapp", NOW);
  for (const root of [cwd, home]) {
    mkdirSync(join(root, ".ariadnev"), { recursive: true });
    writeFileSync(
      join(root, ".ariadnev", "receipt.json"),
      JSON.stringify({ schemaVersion: 1, installs: { "claude-code": { files: [{ path: "a" }, { path: "b" }] } } }),
    );
  }
  return { home, cwd };
}

const opts = (home: string, cwd: string) => ({ home, cwd, now: NOW });

describe("the bundle is safe to paste", () => {
  it("carries no home path", () => {
    // Not a secret, but it carries the user's account name and tells a reader
    // nothing they need.
    const { home, cwd } = populated();
    const output = runDiagnosticsExport({ ...opts(home, cwd), json: true }).output;
    expect(output).not.toContain(home);
  });

  it("carries no project directory, only a count", () => {
    // Where someone's projects live is a path on their machine and has no
    // business in a public issue thread.
    const { home, cwd } = populated();
    const output = runDiagnosticsExport({ ...opts(home, cwd), json: true }).output;
    expect(output).not.toContain(cwd);
    expect(output).toContain('"registered_projects": 1');
  });

  it("carries no file list from the receipt, only how many", () => {
    const { home, cwd } = populated();
    const parsed = JSON.parse(runDiagnosticsExport({ ...opts(home, cwd), json: true }).output) as {
      data: { install: { project: { files: number; providers: number } } };
    };
    expect(parsed.data.install.project).toMatchObject({ providers: 1, files: 2 });
  });

  it("refuses to emit a forbidden field even if one is assembled by mistake", () => {
    // The allowlist is the design; this is the backstop that makes a mistake in
    // it loud instead of silent.
    expect(() => assertNoForbiddenKeys({ cli: { api_key: "x" } })).toThrow(/forbidden field/);
    expect(() => assertNoForbiddenKeys({ a: [{ session_id: "x" }] })).toThrow(/forbidden field/);
  });

  it("names the field shapes it will never carry", () => {
    for (const key of ["token", "GITHUB_TOKEN", "api_key", "apiKey", "password", "authorization", "cookie", "session_id"]) {
      expect(isForbiddenKey(key), key).toBe(true);
    }
    for (const key of ["version", "platform", "fts5", "registered_projects"]) {
      expect(isForbiddenKey(key), key).toBe(false);
    }
  });
});

describe("redaction", () => {
  it("masks the home directory wherever it appears", () => {
    expect(maskHome("/Users/someone/code/app", "/Users/someone")).toBe("~/code/app");
    expect(maskHome("a /Users/someone b /Users/someone c", "/Users/someone")).toBe("a ~ b ~ c");
  });

  it("masks a Windows-shaped home too", () => {
    // A bundle is pasted somewhere else by definition, so the separator it was
    // recorded with is not the one it is read with.
    expect(maskHome("C:\\Users\\someone\\app", "C:/Users/someone")).toBe("~\\app");
  });

  it("scrubs a credential before masking, so neither hides the other", () => {
    const scrubbed = scrub("token ghp_abcdefghijklmnopqrstuvwxyz0123 in /home/u", "/home/u");
    expect(scrubbed).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz0123");
    expect(scrubbed).toContain("~");
  });

  it("reaches every string in a nested structure", () => {
    const cleaned = scrubDeep({ a: { b: ["/home/u/x", 1, true, null] } }, "/home/u");
    expect(cleaned).toEqual({ a: { b: ["~/x", 1, true, null] } });
  });
});

describe("the bundle's contents", () => {
  it("reports capabilities that actually explain a failure", () => {
    const { home, cwd } = populated();
    const bundle = buildDiagnostics(opts(home, cwd)) as { capabilities: Record<string, unknown> };
    expect(Object.keys(bundle.capabilities).sort())
      .toEqual(["ed25519", "fts5", "sqlite_driver", "sqlite_ok", "wal"]);
  });

  it("works on a machine where nothing has been set up", () => {
    // Someone exporting diagnostics is usually someone whose install is broken.
    const home = mk();
    const result = runDiagnosticsExport({ home, cwd: join(home, "nothing"), now: NOW });
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("safe to paste");
  });

  it("says plainly that no file contents are included", () => {
    const { home, cwd } = populated();
    expect(runDiagnosticsExport(opts(home, cwd)).output).toMatch(/No file contents are included/);
  });
});
