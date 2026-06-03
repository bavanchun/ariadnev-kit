import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseManifest, type Manifest } from "./manifest.js";
import { planMigrations } from "./plan-migrations.js";
import { executeMigrations } from "./execute-migrations.js";
import { readAppliedState } from "./applied-state.js";

const manifest: Manifest = parseManifest({
  version: "1.0",
  kitVersion: "0.1.0",
  providerPathMigrations: [
    { provider: "antigravity", type: "skill", from: ".agent/skills", to: ".agents/skills", since: "0.2.0" },
  ],
});

describe("manifest ↔ resolver path consistency", () => {
  it("antigravity migration `to` matches the resolver skill target", async () => {
    const { getResolver } = await import("../providers/index.js");
    const m = manifest.providerPathMigrations.find((x) => x.provider === "antigravity")!;
    const target = getResolver("antigravity").targetFor(
      { type: "skill", name: "x", frontmatter: {}, body: "", raw: "", sourcePath: "" },
      { home: "/h", cwd: "/r", scope: "project" },
    )!;
    // resolver yields /r/.agents/skills/x ; manifest `to` is the dir .agents/skills
    expect(target.startsWith(`/r/${m.to}/`)).toBe(true);
  });
});

describe("parseManifest", () => {
  it("accepts valid manifest", () => {
    expect(manifest.providerPathMigrations.length).toBe(1);
  });
  it("rejects malformed manifest", () => {
    expect(() => parseManifest({ version: 1 })).toThrow(/invalid portable-manifest/);
  });
});

describe("planMigrations (pure)", () => {
  const exists = (p: string) => p.endsWith(".agent/skills");
  it("emits op when from exists + unapplied", () => {
    const ops = planMigrations(manifest, new Set(), { root: "/r", exists });
    expect(ops.length).toBe(1);
    expect(ops[0].toAbs).toBe("/r/.agents/skills");
  });
  it("skips already-applied", () => {
    const applied = new Set([planMigrations(manifest, new Set(), { root: "/r", exists })[0].key]);
    expect(planMigrations(manifest, applied, { root: "/r", exists }).length).toBe(0);
  });
  it("skips when from missing", () => {
    expect(planMigrations(manifest, new Set(), { root: "/r", exists: () => false }).length).toBe(0);
  });
  it("filters by provider", () => {
    expect(planMigrations(manifest, new Set(), { root: "/r", exists }, "codex").length).toBe(0);
  });
});

describe("executeMigrations", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "vcskill-mig-"));
    mkdirSync(join(root, ".agent/skills/x"), { recursive: true });
    writeFileSync(join(root, ".agent/skills/x/SKILL.md"), "hi");
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("moves old path → new with backup, records applied; re-run no-op", () => {
    const ops = planMigrations(manifest, new Set(), { root });
    const res = executeMigrations(ops, root, { dryRun: false, timestamp: "20260603-000000" });
    expect(res.moved.length).toBe(1);
    expect(existsSync(join(root, ".agents/skills/x/SKILL.md"))).toBe(true);
    expect(existsSync(join(root, ".agent/skills"))).toBe(false);
    expect(readAppliedState(root).size).toBe(1);
    // re-run: planner sees applied + from gone → no ops
    expect(planMigrations(manifest, readAppliedState(root), { root }).length).toBe(0);
  });

  it("dry-run moves nothing", () => {
    const ops = planMigrations(manifest, new Set(), { root });
    executeMigrations(ops, root, { dryRun: true, timestamp: "t" });
    expect(existsSync(join(root, ".agent/skills/x"))).toBe(true);
    expect(existsSync(join(root, ".agents/skills/x"))).toBe(false);
  });
});
