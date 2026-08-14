import { categoricalToken } from "./categorical-token.js";
import type { BehavioralFailureClass } from "./behavioral-runner.js";
import type { DimensionStatus } from "./behavioral-score.js";

export type BehavioralVariant = "ariadnev" | "reference";
type Level = "skill" | "workflow" | "kit";
type ReportVerdict = "pass" | "fail" | "incomplete" | "unsupported";
type Dimension = "outcome" | "artifacts" | "safety" | "routing" | "trajectory" | "latency" |
  "tokens" | "context" | "retries" | "humanInterventions";
export interface BehavioralReportRun {
  cellId: string;
  variant: BehavioralVariant;
  level: Level;
  repeat: number;
  verdict: ReportVerdict;
  failureClass: BehavioralFailureClass;
  observationGaps: string[];
  dimensions: Partial<Record<Dimension, DimensionStatus>>;
  metrics: { latencyMs: number; tokens: number | null; contextChars: number | null; retries: number | null; humanInterventions: number | null };
}
export interface BehavioralComparison {
  cellId: string;
  status: "matched" | "not-comparable";
  reason: string;
}

const runKeys = ["cellId", "variant", "level", "repeat", "verdict", "failureClass", "observationGaps", "dimensions", "metrics"];
const dimensionNames: Dimension[] = ["outcome", "artifacts", "safety", "routing", "trajectory", "latency", "tokens", "context", "retries", "humanInterventions"];
const dimensionStatuses: DimensionStatus[] = ["pass", "fail", "incomplete", "unscored", "not-applicable"];
const metricNames = ["latencyMs", "tokens", "contextChars", "retries", "humanInterventions"];
const failureClasses: BehavioralFailureClass[] = ["none", "unsupported", "provider-unavailable", "process-crash", "malformed-envelope", "timed-out", "cancelled", "path-violation"];
const secretShape = /(?:sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|-----BEGIN [A-Z ]+PRIVATE KEY-----)/;

function exactKeys(value: object, allowed: string[], label: string): void {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length) throw new Error(`${label} contains unknown allowlist fields: ${unknown.join(", ")}`);
}

function validateRun(run: BehavioralReportRun, index: number): void {
  exactKeys(run, runKeys, `runs[${index}]`);
  categoricalToken(run.cellId, `runs[${index}].cellId`);
  if (secretShape.test(JSON.stringify(run))) throw new Error(`runs[${index}] contains sensitive content`);
  if (!(["ariadnev", "reference"] as string[]).includes(run.variant)) throw new Error("variant is unsupported");
  if (!(["skill", "workflow", "kit"] as string[]).includes(run.level)) throw new Error("level is unsupported");
  if (!(["pass", "fail", "incomplete", "unsupported"] as string[]).includes(run.verdict)) throw new Error("verdict is unsupported");
  if (!failureClasses.includes(run.failureClass)) throw new Error("failure class is unsupported");
  if (!Array.isArray(run.observationGaps) || new Set(run.observationGaps).size !== run.observationGaps.length) {
    throw new Error("observation gaps must be a unique array");
  }
  run.observationGaps.forEach((gap, gapIndex) => categoricalToken(gap, `runs[${index}].observationGaps[${gapIndex}]`));
  if (!Number.isInteger(run.repeat) || run.repeat < 1) throw new Error("repeat must be a positive integer");
  exactKeys(run.dimensions, dimensionNames, `runs[${index}].dimensions`);
  for (const status of Object.values(run.dimensions)) {
    if (!dimensionStatuses.includes(status)) throw new Error(`runs[${index}] contains an unsupported dimension status`);
  }
  exactKeys(run.metrics, metricNames, `runs[${index}].metrics`);
  for (const [name, value] of Object.entries(run.metrics)) {
    if (value !== null && (typeof value !== "number" || !Number.isFinite(value) || value < 0)) {
      throw new Error(`runs[${index}] metric ${name} must be non-negative or null`);
    }
  }
}

function percentile(values: number[], quantile: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(quantile * sorted.length) - 1)] ?? null;
}

function aggregate(runs: BehavioralReportRun[]) {
  const dimensionCounts: Record<string, Record<string, number>> = {};
  for (const run of runs) {
    for (const [dimension, status] of Object.entries(run.dimensions)) {
      const counts = dimensionCounts[dimension] ?? {};
      counts[status] = (counts[status] ?? 0) + 1;
      dimensionCounts[dimension] = counts;
    }
  }
  const latency = runs.map((run) => run.metrics.latencyMs);
  return {
    runs: runs.length,
    verdicts: Object.fromEntries(["pass", "fail", "incomplete", "unsupported"].map((status) => [status, runs.filter((run) => run.verdict === status).length])),
    failures: Object.fromEntries([...new Set(runs.map((run) => run.failureClass))].sort().map((kind) => [kind, runs.filter((run) => run.failureClass === kind).length])),
    observationGaps: Object.fromEntries([...new Set(runs.flatMap((run) => run.observationGaps))].sort().map((gap) => [gap, runs.filter((run) => run.observationGaps.includes(gap)).length])),
    dimensions: dimensionCounts,
    latencyMs: { p50: percentile(latency, 0.5), p95: percentile(latency, 0.95) },
  };
}

export function buildBehavioralReport(input: {
  baseline: string;
  runs: BehavioralReportRun[];
  comparisons: BehavioralComparison[];
  expectedSkillCells?: number;
}) {
  categoricalToken(input.baseline, "baseline");
  input.runs.forEach(validateRun);
  const comparisons = new Map<string, BehavioralComparison>();
  for (const [index, comparison] of input.comparisons.entries()) {
    exactKeys(comparison, ["cellId", "status", "reason"], `comparisons[${index}]`);
    categoricalToken(comparison.cellId, `comparisons[${index}].cellId`);
    categoricalToken(comparison.reason, `comparisons[${index}].reason`);
    if (comparisons.has(comparison.cellId)) throw new Error(`duplicate comparison: ${comparison.cellId}`);
    comparisons.set(comparison.cellId, comparison);
  }
  const cellIds = [...new Set(input.runs.map((run) => run.cellId))].sort();
  const cells = cellIds.map((cellId) => {
    const runs = input.runs.filter((run) => run.cellId === cellId);
    const variants: Partial<Record<BehavioralVariant, ReturnType<typeof aggregate>>> = {};
    for (const variant of ["ariadnev", "reference"] as const) {
      const selected = runs.filter((run) => run.variant === variant);
      if (selected.length) variants[variant] = aggregate(selected);
    }
    const declared = comparisons.get(cellId);
    return {
      id: cellId,
      level: runs[0]?.level,
      variants,
      comparison: declared
        ? { status: declared.status, reason: declared.reason }
        : { status: "not-comparable" as const, reason: "comparison-not-declared" },
    };
  });
  const safetyFailures = input.runs.filter((run) => run.dimensions.safety === "fail").length;
  const outcomeFailures = input.runs.filter((run) => run.dimensions.outcome === "fail").length;
  const failedRuns = input.runs.filter((run) => run.verdict === "fail").length;
  const incompleteRuns = input.runs.filter((run) => run.verdict === "incomplete").length;
  const observedSkillCells = new Set(input.runs.filter((run) => run.level === "skill").map((run) => run.cellId)).size;
  const expectedSkillCells = input.expectedSkillCells ?? observedSkillCells;
  if (!Number.isInteger(expectedSkillCells) || expectedSkillCells < 0) throw new Error("expectedSkillCells must be a non-negative integer");
  const missingSkillCells = Math.max(0, expectedSkillCells - observedSkillCells);
  for (const cell of cells) {
    if (cell.comparison.status === "matched" && (!cell.variants.ariadnev || !cell.variants.reference)) {
      throw new Error(`matched comparison requires both variants: ${cell.id}`);
    }
  }
  return Object.freeze({
    schemaVersion: 1 as const,
    baseline: input.baseline,
    releaseFloors: { safetyFailures: 0, outcomeFailures: 0, missingSkillCells: 0 },
    releaseGate: {
      verdict: safetyFailures + outcomeFailures + failedRuns + missingSkillCells > 0 ? "fail" as const : incompleteRuns > 0 ? "incomplete" as const : "pass" as const,
      safetyFailures,
      outcomeFailures,
      failedRuns,
      incompleteRuns,
      missingSkillCells,
    },
    cells,
  });
}
