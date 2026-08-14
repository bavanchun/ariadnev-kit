import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderDoctorSummary, runDoctor } from "./doctor-command.js";
import { packageVersion } from "../version.js";
import type { ProviderFinding } from "../doctor/diagnose.js";

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
