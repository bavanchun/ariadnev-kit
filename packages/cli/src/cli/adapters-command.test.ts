import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAdaptersRegenerate } from "./adapters-command.js";
import { adapterDir } from "../adapters/write-adapter-artifacts.js";
import { UnavailableError } from "./exit-codes.js";
import type { Receipt } from "../install/install-receipt.js";

let root: string;
let opts: { home: string; cwd: string; scope: "project"; kitVersion: string };

const receipt: Receipt = {
  schemaVersion: 2,
  ariadnevVersion: "1.0.0",
  installs: {
    "claude-code": {
      timestamp: "20260815-101500",
      scope: "project",
      files: [{ path: "~/.claude/skills/scout/SKILL.md", sha256: "c".repeat(64) }],
      agentsMdManaged: false,
      hookBindings: [{ event: "Stop", command: 'node "/home/u/.claude/hooks/av/session-state.cjs"', applied: true }],
      skipped: [],
      skillSelection: { mode: "all", skills: ["scout"], selectedCount: 1, totalCount: 1 },
    },
  },
};

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "ariadnev-adapters-"));
  mkdirSync(join(root, "home"), { recursive: true });
  mkdirSync(join(root, "project", ".ariadnev"), { recursive: true });
  opts = { home: join(root, "home"), cwd: join(root, "project"), scope: "project", kitVersion: "1.0.0" };
  writeFileSync(join(root, "project", ".ariadnev", "receipt.json"), JSON.stringify(receipt, null, 2));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("ariadnev adapters regenerate", () => {
  it("writes the five artifacts for every provider in the receipt", () => {
    const { output, exitCode } = runAdaptersRegenerate(opts);
    expect(exitCode).toBe(0);
    expect(output).toContain("claude-code");
    expect(readdirSync(adapterDir("claude-code", opts.home)).sort()).toEqual([
      "claude-code-ownership.json",
      "install-manifest.json",
      "native-hook-expectations.json",
      "native-skill-hashes.json",
      "native-skill-paths.json",
    ]);
  });

  it("is a repair, not a reconcile — regenerating twice changes nothing", () => {
    runAdaptersRegenerate(opts);
    const before = readFileSync(join(adapterDir("claude-code", opts.home), "install-manifest.json"), "utf8");
    const second = runAdaptersRegenerate(opts);
    expect(second.output).toContain("already up to date");
    expect(readFileSync(join(adapterDir("claude-code", opts.home), "install-manifest.json"), "utf8")).toBe(before);
  });

  it("restores a deleted artifact byte for byte", () => {
    runAdaptersRegenerate(opts);
    const path = join(adapterDir("claude-code", opts.home), "native-skill-hashes.json");
    const original = readFileSync(path, "utf8");
    rmSync(path);
    runAdaptersRegenerate(opts);
    expect(readFileSync(path, "utf8")).toBe(original);
  });

  it("overwrites an artifact someone edited, and says it did", () => {
    // These are a projection. A discrepancy is always answered by regenerating,
    // never by reading the edited file back as if it meant something.
    runAdaptersRegenerate(opts);
    const path = join(adapterDir("claude-code", opts.home), "install-manifest.json");
    writeFileSync(path, '{"tampered":true}\n');
    const { output } = runAdaptersRegenerate(opts);
    expect(output).toContain("1 rewritten");
    expect(readFileSync(path, "utf8")).not.toContain("tampered");
  });

  it("writes nothing under --dry-run but still reports what would change", () => {
    const { output } = runAdaptersRegenerate({ ...opts, dryRun: true });
    expect(output).toContain("dry run");
    expect(() => readdirSync(adapterDir("claude-code", opts.home))).toThrow();
  });

  it("refuses when there is no receipt, instead of writing five empty files", () => {
    rmSync(join(root, "project", ".ariadnev", "receipt.json"));
    expect(() => runAdaptersRegenerate(opts)).toThrow(UnavailableError);
  });

  it("emits the machine envelope", () => {
    const parsed = JSON.parse(runAdaptersRegenerate({ ...opts, json: true }).output);
    expect(parsed.schema_version).toBe(1);
    expect(parsed.kind).toBe("adapters.regenerate");
    expect(parsed.data.results[0].provider).toBe("claude-code");
  });
});
