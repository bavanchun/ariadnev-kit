import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderDoctorSummary, runDoctor } from "./doctor-command.js";
import { packageVersion } from "../version.js";
import type { ProviderFinding } from "../doctor/diagnose.js";
import { disableProject, enableProject } from "../content-search/lifecycle.js";

describe("renderDoctorSummary (branded, scored)", () => {
  it("shows a health bar, glyph rows, and a remedy line — plain when color:false", () => {
    const findings: ProviderFinding[] = [
      { providerId: "claude-code", level: "fail", message: "missing file: x", remedy: "ariadnev install", weight: 10 },
      { providerId: "codex", level: "skip", message: "nothing to verify" },
    ];
    const s = renderDoctorSummary("degraded", findings, { color: false });
    expect(s).not.toContain("\x1b[");
    expect(s).toContain("health");
    expect(s).toContain("90"); // 100 - 10
    expect(s).toContain("↳ run  ariadnev install");
    expect(s).toContain("codex: nothing to verify");
  });

  it("still greets a not-installed root without a score", () => {
    const s = renderDoctorSummary("not-installed", [], { color: false });
    expect(s).toContain("no receipt found");
    expect(s).not.toContain("health");
  });
});

describe("content shard health", () => {
  const dirs: string[] = [];
  const mk = () => {
    const dir = mkdtempSync(join(tmpdir(), "ariadnev-doctor-shard-"));
    dirs.push(dir);
    return dir;
  };
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it("says nothing when no project has opted in", () => {
    // A health line about a feature nobody turned on is noise, and the opt-in
    // default is off.
    expect(renderDoctorSummary("healthy", [], { color: false }, mk())).not.toContain("content shard");
  });

  it("reports an opted-in project whose shard was never built, with the fix", () => {
    const home = mk();
    enableProject(home, join(home, "proj"), "proj", "2026-08-28T00:00:00.000Z");

    const summary = renderDoctorSummary("healthy", [], { color: false }, home);

    expect(summary).toContain("content shard (proj): absent");
    expect(summary).toContain("av content-search rebuild --project proj");
  });

  it("reports the shard on a root with no receipt at all", () => {
    // A shard belongs to the home, not to the install. Measured against the
    // compiled binary: `doctor` in a home with a live shard printed nothing,
    // because the not-installed path returned before the shard lines — which is
    // exactly the person most likely to be asking why a search is empty.
    const home = mk();
    enableProject(home, join(home, "proj"), "proj", "2026-08-28T00:00:00.000Z");

    const summary = renderDoctorSummary("not-installed", [], { color: false }, home);

    expect(summary).toContain("no receipt found");
    expect(summary).toContain("content shard (proj): absent");
  });

  it("does not report a project that opted back out", () => {
    const home = mk();
    const dir = join(home, "proj");
    enableProject(home, dir, "proj", "2026-08-28T00:00:00.000Z");
    disableProject(home, dir, "proj", "2026-08-28T01:00:00.000Z");

    expect(renderDoctorSummary("healthy", [], { color: false }, home)).not.toContain("content shard");
  });
});

describe("runDoctor — exit contract preserved", () => {
  const dirs: string[] = [];
  const mk = () => {
    const d = mkdtempSync(join(tmpdir(), "ariadnev-doctor-"));
    dirs.push(d);
    return d;
  };
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  it("a fail finding (missing installed file) still yields degraded + exit 1 — not masked as healthy", () => {
    const cwd = mk();
    mkdirSync(join(cwd, ".ariadnev"), { recursive: true });
    writeFileSync(
      join(cwd, ".ariadnev", "receipt.json"),
      JSON.stringify({
        schemaVersion: 1,
        ariadnevVersion: packageVersion(),
        installs: {
          "claude-code": {
            timestamp: "t",
            scope: "project",
            // Recorded at install time but not present on disk now → a fail.
            files: [{ path: ".claude/skills/brainstorm/SKILL.md", sha256: "x" }],
            agentsMdManaged: false,
            hookBindings: [],
            skipped: [],
          },
        },
      }),
    );
    const res = runDoctor({ scope: "project", home: cwd, cwd });
    expect(res.status).toBe("degraded");
    expect(res.exitCode).toBe(1);
    expect(res.summary).toContain("brainstorm/SKILL.md");
  });
});
