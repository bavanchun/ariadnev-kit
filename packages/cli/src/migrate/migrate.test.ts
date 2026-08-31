import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseManifest, type Manifest } from "./manifest.js";
import { planMigrations } from "./plan-migrations.js";
import { executeMigrations } from "./execute-migrations.js";
import { readAppliedState } from "./applied-state.js";

// The real file, not a copy of it. An inline manifest checked itself against
// the resolver and left the shipped one unguarded, so the two could drift
// exactly as far as they liked — and did: the resolver moved antigravity to
// `.gemini/config/skills` while `portable-manifest.json` still pointed a
// migration at the root it had left.
const manifest: Manifest = parseManifest(
  JSON.parse(readFileSync(join(__dirname, "..", "..", "..", "..", "portable-manifest.json"), "utf8")),
);

describe("manifest ↔ resolver path consistency", () => {
  it("antigravity migration `to` matches the resolver skill target", async () => {
    const { getResolver } = await import("../providers/index.js");
    const m = manifest.providerPathMigrations.find((x) => x.provider === "antigravity")!;
    // Home, not cwd: antigravity is home-anchored, so a migration into a
    // project directory would move files where nothing reads them.
    const dest = getResolver("antigravity").targetFor(
      { type: "skill", name: "x", frontmatter: {}, body: "", raw: "", sourcePath: "" },
      { home: "/h", cwd: "/r", scope: "project" },
    )!;
    expect(dest.startsWith(`/h/${m.to}/`)).toBe(true);
  });

  it("migrates only from a directory antigravity owned alone", () => {
    // `.agents/skills` is shared by cursor, omp, dsh and generic, and by codex
    // under global scope. A directory-level migration out of it would take
    // every other provider's files along, so the manifest must never name it as
    // a `from`. Installs that already sit there are handled by uninstall, not
    // by a move this shape cannot express safely.
    for (const m of manifest.providerPathMigrations) {
      expect(m.from).not.toBe(".agents/skills");
    }
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
    expect(ops[0].toAbs).toBe("/r/.gemini/config/skills");
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
    root = mkdtempSync(join(tmpdir(), "ariadnev-mig-"));
    mkdirSync(join(root, ".agent/skills/x"), { recursive: true });
    writeFileSync(join(root, ".agent/skills/x/SKILL.md"), "hi");
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("moves old path → new with backup, records applied; re-run no-op", () => {
    const ops = planMigrations(manifest, new Set(), { root });
    const res = executeMigrations(ops, root, { dryRun: false, timestamp: "20260603-000000" });
    expect(res.moved.length).toBe(1);
    expect(existsSync(join(root, ".gemini/config/skills/x/SKILL.md"))).toBe(true);
    expect(existsSync(join(root, ".agent/skills"))).toBe(false);
    expect(readAppliedState(root).size).toBe(1);
    // re-run: planner sees applied + from gone → no ops
    expect(planMigrations(manifest, readAppliedState(root), { root }).length).toBe(0);
  });

  it("dry-run moves nothing", () => {
    const ops = planMigrations(manifest, new Set(), { root });
    executeMigrations(ops, root, { dryRun: true, timestamp: "t" });
    expect(existsSync(join(root, ".agent/skills/x"))).toBe(true);
    expect(existsSync(join(root, ".gemini/config/skills/x"))).toBe(false);
  });
});
