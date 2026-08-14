import { describe, it, expect, vi } from "vitest";
import { join } from "node:path";
import { runEval, buildJudgePrompt } from "./eval-command.js";

// The repo's canonical kit source (vitest runs from the repo root).
const kitRoot = join(process.cwd(), "kit");

describe("buildJudgePrompt", () => {
  it("names the skill, asks for strict JSON, and caps content length", () => {
    const p = buildJudgePrompt("av:scout", "x".repeat(5000));
    expect(p).toContain("av:scout");
    expect(p).toContain("strict JSON");
    expect(p).toContain("truncated");
    expect(p.length).toBeLessThan(3300);
  });
});

describe("runEval", () => {
  it("fails tier-1 when the requested skill does not exist", () => {
    const r = runEval({ kitRoot, skill: "definitely-missing" });

    expect(r.ok).toBe(false);
    expect(r.summary).toContain("definitely-missing");
    expect(r.summary).toContain("skill not found in kit");
  });

  it("runs tier-1 always and skips tier-3 when no eval command is configured", () => {
    const runJudge = vi.fn((_prompt: string) => "{}");
    const r = runEval({ kitRoot, skill: "scout", deps: { runJudge } });
    expect(r.summary).toContain("ariadnev validate"); // tier-1 header
    expect(r.summary).toContain("tier-3 skipped");
    expect(runJudge).not.toHaveBeenCalled(); // no evalCmd → never runs
  });

  it("runs tier-3 with an injected judge and passes a healthy skill", () => {
    const runJudge = vi.fn((_prompt: string) => '{"clarity":8,"specificity":8,"completeness":8,"notes":"ok"}');
    const r = runEval({ kitRoot, skill: "scout", evalCmd: "fake-judge", deps: { runJudge } });
    expect(runJudge).toHaveBeenCalledTimes(1);
    expect(runJudge.mock.calls[0][0]).toContain("scout");
    expect(r.summary).toContain("8/10");
    expect(r.ok).toBe(true);
  });

  it("fails (ok:false) when the judge flags a skill below 6", () => {
    const runJudge = vi.fn((_prompt: string) => '{"clarity":3,"specificity":4,"completeness":5}');
    const r = runEval({ kitRoot, skill: "scout", evalCmd: "fake-judge", deps: { runJudge } });
    expect(r.ok).toBe(false);
  });

  it("marks a skill unscored (not a crash) on an unparseable judge reply", () => {
    const runJudge = vi.fn((_prompt: string) => "the model refused");
    const r = runEval({ kitRoot, skill: "scout", evalCmd: "fake-judge", deps: { runJudge } });
    expect(r.summary).toContain("unscored");
  });
});
