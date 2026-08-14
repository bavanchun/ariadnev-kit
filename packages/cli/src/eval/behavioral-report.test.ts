import { describe, expect, it } from "vitest";
import { buildBehavioralReport, type BehavioralReportRun } from "./behavioral-report.js";

function run(overrides: Partial<BehavioralReportRun> = {}): BehavioralReportRun {
  return {
    cellId: "skill.ask.routing:positive",
    variant: "vcskill",
    level: "skill",
    repeat: 1,
    verdict: "pass",
    failureClass: "none",
    observationGaps: ["routing.runtime-events"],
    dimensions: {
      outcome: "pass",
      safety: "pass",
      routing: "incomplete",
      trajectory: "unscored",
    },
    metrics: { latencyMs: 20, tokens: null, contextChars: 120, retries: null, humanInterventions: null },
    ...overrides,
  };
}

describe("buildBehavioralReport", () => {
  it("keeps repeat distributions and explicit non-comparable cells", () => {
    const report = buildBehavioralReport({
      baseline: "v0.10.0",
      runs: [run(), run({ repeat: 2, metrics: { ...run().metrics, latencyMs: 80 } })],
      comparisons: [{ cellId: "skill.ask.routing:positive", status: "not-comparable", reason: "runtime-contract-mismatch" }],
    });
    expect(report.cells[0].variants.vcskill?.runs).toBe(2);
    expect(report.cells[0].variants.vcskill?.latencyMs).toEqual({ p50: 20, p95: 80 });
    expect(report.cells[0].comparison).toEqual({ status: "not-comparable", reason: "runtime-contract-mismatch" });
  });

  it("fails the release gate when any safety dimension fails", () => {
    const report = buildBehavioralReport({
      baseline: "v0.10.0",
      runs: [run(), run({ cellId: "golden.safe", level: "workflow", dimensions: { ...run().dimensions, safety: "fail" } })],
      comparisons: [],
    });
    expect(report.releaseGate).toMatchObject({ verdict: "fail", safetyFailures: 1 });
  });

  it("fails closed on missing skill cells or a one-sided matched comparison", () => {
    const report = buildBehavioralReport({
      baseline: "v0.10.0",
      runs: [run()],
      comparisons: [],
      expectedSkillCells: 2,
    });
    expect(report.releaseGate).toMatchObject({ verdict: "fail", missingSkillCells: 1 });
    expect(() => buildBehavioralReport({
      baseline: "v0.10.0",
      runs: [run()],
      comparisons: [{ cellId: run().cellId, status: "matched", reason: "same-runtime-contract" }],
    })).toThrow(/matched.*both/i);
  });

  it("rejects raw traces and credential-shaped report categories", () => {
    expect(() => buildBehavioralReport({
      baseline: "v0.10.0",
      runs: [run({ cellId: `sk-${"x".repeat(40)}` })],
      comparisons: [],
    })).toThrow(/sensitive|categorical/i);
    expect(() => buildBehavioralReport({
      baseline: "v0.10.0",
      runs: [{ ...run(), rawTrace: "secret" } as BehavioralReportRun],
      comparisons: [],
    })).toThrow(/allowlist|unknown/i);
    expect(() => buildBehavioralReport({
      baseline: "v0.10.0",
      runs: [run({ metrics: { ...run().metrics, latencyMs: Number.NaN } })],
      comparisons: [],
    })).toThrow(/metric/i);
  });
});
