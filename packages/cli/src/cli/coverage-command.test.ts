import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildProgram } from "../index.js";
import { runCoverage } from "./coverage-command.js";

const kitRoot = join(process.cwd(), "kit");
const originalExitCode = process.exitCode;

afterEach(() => {
  process.exitCode = originalExitCode;
  vi.restoreAllMocks();
});

describe("runCoverage", () => {
  it("is strict for an unclassified claim-tracked skill", () => {
    const result = runCoverage({ kitRoot, skill: "docs-seeker" });
    expect(result.ok).toBe(false);
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.findings.every((finding) => finding.kind === "unclassified")).toBe(true);
    expect(result.summary).toContain("docs-seeker");
    expect(result.summary).toContain("not behavioral parity");
  });

  it.each([
    ["git", "fork"],
    ["obsidian-second-brain-note", "none"],
  ])("exempts %s with relation %s", (skill, relation) => {
    const result = runCoverage({ kitRoot, skill });
    expect(result.ok).toBe(true);
    expect(result.findings).toEqual([]);
    expect(result.summary).toContain(`relation ${relation}`);
  });

  it("reports a distillation without tracked claims as not applicable", () => {
    const result = runCoverage({ kitRoot, skill: "scout" });
    expect(result.ok).toBe(true);
    expect(result.summary).toContain("no tracked claims");
  });

  it("fails clearly for an unknown skill", () => {
    const result = runCoverage({ kitRoot, skill: "missing" });
    expect(result.ok).toBe(false);
    expect(result.findings[0]).toMatchObject({ kind: "missing-skill", skill: "missing" });
  });

  it("sets a non-zero process exit code through the registered strict command", async () => {
    process.exitCode = undefined;
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    await buildProgram().parseAsync(["node", "vcskill", "coverage", "--skill", "docs-seeker"]);
    expect(process.exitCode).toBe(1);
  });
});
