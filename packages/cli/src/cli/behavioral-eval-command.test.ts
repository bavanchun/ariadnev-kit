import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { parseBehavioralCommand, runBehavioralEval } from "./behavioral-eval-command.js";

const kitRoot = join(process.cwd(), "kit");

describe("parseBehavioralCommand", () => {
  it("accepts only a non-empty JSON argv array", () => {
    expect(parseBehavioralCommand('["codex","exec","-","--ephemeral"]')).toEqual([
      "codex", "exec", "-", "--ephemeral",
    ]);
    expect(() => parseBehavioralCommand("codex exec -")).toThrow(/json/i);
    expect(() => parseBehavioralCommand("[]")).toThrow(/non-empty/i);
    expect(() => parseBehavioralCommand('["codex",7]')).toThrow(/string/i);
  });
});

describe("runBehavioralEval", () => {
  it("runs tier 1 and emits one machine-readable Tier 2 envelope", async () => {
    const runSuite = vi.fn(async () => ({
      population: { skillScenarios: 26, skillCells: 52, deepTasks: 14, runs: 66 },
      runs: [{
        cellId: "skill.ask.routing:positive", variant: "vcskill" as const, level: "skill" as const,
        repeat: 1, verdict: "incomplete" as const, failureClass: "none" as const,
        observationGaps: ["routing.runtime-events"], dimensions: { routing: "incomplete" as const },
        metrics: { latencyMs: 1, tokens: null, contextChars: 10, retries: null, humanInterventions: null },
      }],
      identity: {
        kit: { version: "0.10.0", digest: `sha256:${"a".repeat(64)}` },
        runtime: { provider: "codex", version: "0.147.0", model: "gpt-5.4" },
        evaluator: { version: "behavioral-v1" },
      },
      report: { releaseGate: { verdict: "incomplete" as const } },
    }));
    const result = await runBehavioralEval({
      kitRoot,
      command: ["fake-runner"],
      variant: "vcskill",
      runtime: { provider: "codex", version: "0.147.0", model: "gpt-5.4" },
      availableCapabilities: [],
      timeoutMs: 1000,
      skillRepeats: 1,
      deepRepeats: 1,
      deps: { runSuite },
    });
    const parsed = JSON.parse(result.summary);
    expect(parsed).toMatchObject({
      schemaVersion: 1,
      kind: "behavioral-eval",
      tier1: { ok: true },
      environment: {
        variant: "vcskill",
        evaluator: { version: "behavioral-v1" },
        runtime: { provider: "codex", version: "0.147.0", model: "gpt-5.4" },
      },
      population: { skillScenarios: 26, skillCells: 52, deepTasks: 14 },
      report: { releaseGate: { verdict: "incomplete" } },
    });
    expect(result.ok).toBe(false);
    expect(parsed.samples).toHaveLength(1);
    expect(parsed.samples[0]).toMatchObject({ repeat: 1, observationGaps: ["routing.runtime-events"] });
    expect(runSuite).toHaveBeenCalledTimes(1);
  });
});
