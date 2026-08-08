import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseStrictJson } from "./strict-json.js";

const baselineRoot = join(process.cwd(), "evals/baselines/v0.10.0");

function load(name: string): Record<string, unknown> {
  return parseStrictJson(readFileSync(join(baselineRoot, name), "utf8"), name) as Record<string, unknown>;
}

describe("v0.10.0 behavioral baseline artifacts", () => {
  it("covers the frozen population and names every comparison decision", () => {
    const summary = load("summary.json") as {
      schemaVersion: number;
      kind: string;
      environment: {
        variant: string;
        kit: { version: string; digest: string };
        runtime: { provider: string; version: string; model: string };
        evaluator: { version: string };
        settings: { timeoutMs: number; skillRepeats: number; deepRepeats: number; concurrency: number; capabilities: string[] };
      };
      population: { skillScenarios: number; skillCells: number; deepTasks: number; runs: number };
      samples: Array<{
        cellId: string;
        level: string;
        repeat: number;
        verdict: string;
        dimensions: { outcome: string; safety: string };
      }>;
      report: {
        releaseGate: {
          verdict: string;
          safetyFailures: number;
          outcomeFailures: number;
          failedRuns: number;
          incompleteRuns: number;
          missingSkillCells: number;
        };
        cells: Array<{
          id: string;
          level: string;
          variants: Record<string, unknown>;
          comparison: { status: string; reason: string };
        }>;
      };
    };
    expect(summary.schemaVersion).toBe(1);
    expect(summary.kind).toBe("behavioral-eval");
    expect(summary.population).toEqual({ skillScenarios: 26, skillCells: 52, deepTasks: 14, runs: 66 });
    expect(summary.environment).toMatchObject({
      variant: "vcskill",
      kit: { version: "0.10.0" },
      runtime: { provider: "codex", version: "0.147.0", model: "gpt-5.4-mini" },
      evaluator: { version: "behavioral-v1" },
      settings: { timeoutMs: 300000, skillRepeats: 1, deepRepeats: 1, concurrency: 3, capabilities: [] },
    });
    expect(summary.samples).toHaveLength(66);
    expect(summary.samples.every((sample) => sample.repeat === 1)).toBe(true);
    expect(summary.report.cells).toHaveLength(66);
    expect(summary.report.cells.filter((cell) => cell.level === "skill")).toHaveLength(52);
    expect(new Set(summary.samples.map((sample) => sample.cellId))).toHaveLength(66);
    expect(summary.samples.map((sample) => sample.cellId).sort()).toEqual(
      summary.report.cells.map((cell) => cell.id).sort(),
    );
    expect(summary.samples.filter((sample) => sample.level === "skill" && sample.cellId.endsWith(":positive"))).toHaveLength(26);
    expect(summary.samples.filter((sample) => sample.level === "skill" && sample.cellId.endsWith(":negative"))).toHaveLength(26);
    expect(summary.report.cells.every((cell) =>
      cell.comparison.status === "not-comparable"
      && cell.comparison.reason === "trusted-observation-source-unavailable"
      && !Object.hasOwn(cell.variants, "agentkit"))).toBe(true);
    expect(summary.report.releaseGate).toEqual({
      verdict: "fail",
      safetyFailures: 1,
      outcomeFailures: 1,
      failedRuns: 4,
      incompleteRuns: 50,
      missingSkillCells: 0,
    });
    expect(summary.samples.filter((sample) => sample.verdict === "fail")).toHaveLength(4);
    expect(summary.samples.filter((sample) => sample.verdict === "incomplete")).toHaveLength(50);
    expect(summary.samples.filter((sample) => sample.verdict === "unsupported")).toHaveLength(12);
    expect(summary.samples.filter((sample) => sample.dimensions.safety === "fail")).toHaveLength(1);
    expect(summary.samples.filter((sample) => sample.dimensions.outcome === "fail")).toHaveLength(1);
  });

  it("pins both sources and the exact runtime without machine paths", () => {
    const environment = load("environment.json") as {
      vcskill: { kitVersion: string; kitRevision: string; kitTree: string; harnessRevision: string };
      agentkit: { cliVersion: string; kitVersion: string; sourceCommit: string; manifestSha256: string; executedCells: number; reason: string };
      runtime: { provider: string; version: string; model: string };
      invocation: { runnerArgv: string[]; timeoutMs: number; skillRepeats: number; deepRepeats: number; concurrency: number; capabilities: string[]; runnerHome: string };
      host: { powerPolicy: string };
    };
    expect(environment.vcskill).toEqual({
      kitVersion: "0.10.0",
      kitRevision: "41eee05b1ebf3ecd7404baa05c6972cecbbd6c40",
      kitTree: "0f25711289bb53db26a5e88254660b3ef13bf304",
      harnessRevision: "4fa4108ac3c2fa37b61443cb7dddec96df0a01e8",
      harnessTree: "59a7c8bae1860cd252598ba588479d4ddf1c51e7",
    });
    expect(environment.agentkit).toMatchObject({
      cliVersion: "2.8.0-beta.8",
      kitVersion: "2.8.0-beta.8",
      sourceCommit: "fdf5302ebb2238f3c1a95e8a0e834f3bc2735cca",
      manifestSha256: "7d9cec4404112bd4d2e1afc1aa91af0cc861b849d4f2a37c7617ec4239256f20",
      executedCells: 0,
      reason: "trusted-observation-source-unavailable",
    });
    expect(environment.runtime).toEqual({ provider: "codex", version: "0.147.0", model: "gpt-5.4-mini" });
    expect(environment.invocation).toMatchObject({
      timeoutMs: 300000,
      skillRepeats: 1,
      deepRepeats: 1,
      concurrency: 3,
      capabilities: [],
      runnerHome: "isolated-vcskill-install",
    });
    expect(environment.invocation.runnerArgv).toContain("workspace-write");
    expect(environment.host.powerPolicy).toBe("caffeinate-dimsu");
    expect(JSON.stringify(environment)).not.toMatch(/\/Users\/|\/tmp\//);
  });

  it("contains no executor payload, trace, run identity, or credential shape", () => {
    const serialized = JSON.stringify(load("summary.json"));
    expect(serialized).not.toMatch(/(?:rawTrace|rawTranscript|prompt|executorOutput|runId)/i);
    expect(serialized).not.toMatch(/(?:sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|BEGIN [A-Z ]+PRIVATE KEY)/);
    expect(serialized).not.toMatch(/\/Users\/|\/tmp\//);
  });
});
