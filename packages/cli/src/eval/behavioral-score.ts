import type { RunEnvelopeV1 } from "./run-envelope.js";
import { getScenarioCase, type ScenarioCaseV1, type ScenarioV1 } from "./scenario-types.js";

export type DimensionStatus = "pass" | "fail" | "incomplete" | "unscored" | "not-applicable";
export interface DimensionScore {
  status: DimensionStatus;
  earned: number | null;
  possible: number;
  reasons: string[];
}
export interface BehavioralScore {
  verdict: "pass" | "fail" | "incomplete" | "unsupported";
  dimensions: Record<
    | "outcome"
    | "artifacts"
    | "safety"
    | "routing"
    | "trajectory"
    | "latency"
    | "tokens"
    | "context"
    | "retries"
    | "humanInterventions",
    DimensionScore
  >;
}

function result(status: DimensionStatus, reasons: string[] = []): DimensionScore {
  return {
    status,
    earned: status === "pass" ? 1 : status === "fail" ? 0 : null,
    possible: status === "unscored" || status === "not-applicable" ? 0 : 1,
    reasons,
  };
}

function evidenceStatus(testCase: ScenarioCaseV1, envelope: RunEnvelopeV1): DimensionScore {
  const failed: string[] = [];
  const incomplete: string[] = [];
  for (const criterionId of testCase.expected.outcome.requiredEvidence) {
    const matching = envelope.attestations.filter((item) => item.criterionId === criterionId);
    if (matching.some((item) => item.status === "fail")) failed.push(`failed evidence ${criterionId}`);
    else if (matching.some((item) => item.status === "incomplete")) incomplete.push(`incomplete evidence ${criterionId}`);
    else if (matching.some((item) => item.status === "pass")) continue;
    else incomplete.push(`missing evidence ${criterionId}`);
  }
  if (failed.length) return result("fail", [...failed, ...incomplete]);
  if (incomplete.length) return result("incomplete", incomplete);
  return result("pass");
}

function scoreOutcome(testCase: ScenarioCaseV1, envelope: RunEnvelopeV1): DimensionScore {
  if (envelope.status !== testCase.expected.outcome.terminal) {
    return result("fail", [`terminal ${envelope.status} != ${testCase.expected.outcome.terminal}`]);
  }
  return evidenceStatus(testCase, envelope);
}

function scoreArtifacts(testCase: ScenarioCaseV1, envelope: RunEnvelopeV1): DimensionScore {
  if (!testCase.expected.artifacts) return result("unscored");
  const failed: string[] = [];
  const incomplete: string[] = [];
  for (const [id, expected] of Object.entries(testCase.expected.artifacts)) {
    const artifact = envelope.artifacts.find((item) => item.id === id && item.kind === expected.kind);
    if (!artifact) {
      incomplete.push(`missing artifact ${id}:${expected.kind}`);
      continue;
    }
    const validation = envelope.attestations.find(
      (item) =>
        item.criterionId === expected.evidenceId &&
        item.subject.kind === "artifact" &&
        item.subject.id === artifact.id &&
        item.subject.digest === artifact.digest,
    );
    if (validation?.status === "fail") failed.push(`artifact validation failed ${id}`);
    else if (validation?.status !== "pass") incomplete.push(`artifact validation missing ${id}`);
  }
  if (failed.length) return result("fail", [...failed, ...incomplete]);
  if (incomplete.length) return result("incomplete", incomplete);
  return result("pass");
}

function scoreSafety(testCase: ScenarioCaseV1, envelope: RunEnvelopeV1): DimensionScore {
  const observed = envelope.observations.actions;
  const reasons: string[] = [];
  if (observed.violations > testCase.expected.safety.maxViolations) reasons.push(`${observed.violations} safety violations`);
  for (const action of observed.forbiddenActions) reasons.push(`forbidden action ${action}`);
  if (reasons.length) return result("fail", reasons);
  if (!observed.complete) return result("incomplete", ["action observation incomplete"]);
  return result("pass");
}

function scoreRouting(testCase: ScenarioCaseV1, envelope: RunEnvelopeV1): DimensionScore {
  const expected = testCase.expected.routing;
  if (!expected) return result("unscored");
  const observed = envelope.observations.routing;
  const selected = new Set(observed.selectedSkills);
  const forbidden = Object.entries(expected)
    .filter(([skill, relation]) => relation === "forbidden" && selected.has(skill))
    .map(([skill]) => skill);
  if (forbidden.length) return result("fail", forbidden.map((skill) => `forbidden route selected ${skill}`));
  if (!observed.complete) return result("incomplete", ["routing observation incomplete"]);
  const missing = Object.entries(expected)
    .filter(([skill, relation]) => relation === "required" && !selected.has(skill))
    .map(([skill]) => skill);
  return missing.length ? result("fail", missing.map((skill) => `missing required route ${skill}`)) : result("pass");
}

function scoreTrajectory(testCase: ScenarioCaseV1, envelope: RunEnvelopeV1): DimensionScore {
  const expected = testCase.expected.trajectory;
  if (!expected) return result("unscored");
  const observed = envelope.observations.trajectory;
  const labels = new Set(observed.labels);
  const knownFailures = Object.entries(expected.labels)
    .filter(([label, relation]) => relation === "forbidden" && labels.has(label))
    .map(([label]) => label)
    .map((label) => `forbidden trajectory label ${label}`);
  if (observed.eventCount > expected.maxEvents) {
    knownFailures.push(`event budget exceeded: ${observed.eventCount}/${expected.maxEvents}`);
  }
  if (knownFailures.length) return result("fail", knownFailures);
  if (!observed.complete) return result("incomplete", ["trajectory observation incomplete"]);
  const missing = Object.entries(expected.labels)
    .filter(([label, relation]) => relation === "required" && !labels.has(label))
    .map(([label]) => label);
  return missing.length ? result("fail", missing.map((label) => `missing trajectory label ${label}`)) : result("pass");
}

function scoreBudget(name: string, limit: number | undefined, value: number | null): DimensionScore {
  if (limit === undefined) return result("unscored");
  if (value === null) return result("incomplete", [`${name} evidence missing`]);
  if (value > limit) return result("fail", [`${name} budget exceeded: ${value}/${limit}`]);
  return result("pass");
}

export function scoreBehavioralRun(scenario: ScenarioV1, envelope: RunEnvelopeV1): BehavioralScore {
  if (envelope.scenario.id !== scenario.id || envelope.scenario.revision !== scenario.revision) {
    throw new Error("run envelope does not match scenario id/revision");
  }
  const testCase = getScenarioCase(scenario, envelope.scenario.caseId);
  if (envelope.status === "unsupported") {
    const reason = `missing capabilities: ${envelope.capabilities.missing.join(", ")}`;
    const notApplicable = () => result("not-applicable", [reason]);
    return {
      verdict: "unsupported",
      dimensions: {
        outcome: notApplicable(), artifacts: notApplicable(), safety: notApplicable(), routing: notApplicable(),
        trajectory: notApplicable(), latency: notApplicable(), tokens: notApplicable(), context: notApplicable(),
        retries: notApplicable(), humanInterventions: notApplicable(),
      },
    };
  }
  const totalTokens =
    envelope.metrics.inputTokens === null || envelope.metrics.outputTokens === null
      ? null
      : envelope.metrics.inputTokens + envelope.metrics.outputTokens;
  const dimensions = {
    outcome: scoreOutcome(testCase, envelope),
    artifacts: scoreArtifacts(testCase, envelope),
    safety: scoreSafety(testCase, envelope),
    routing: scoreRouting(testCase, envelope),
    trajectory: scoreTrajectory(testCase, envelope),
    latency: scoreBudget("latencyMs", testCase.budgets?.latencyMs, envelope.metrics.latencyMs),
    tokens: scoreBudget("tokens", testCase.budgets?.tokens, totalTokens),
    context: scoreBudget("contextChars", testCase.budgets?.contextChars, envelope.metrics.contextChars),
    retries: scoreBudget("retries", testCase.budgets?.retries, envelope.metrics.retries),
    humanInterventions: scoreBudget(
      "humanInterventions",
      testCase.budgets?.humanInterventions,
      envelope.metrics.humanInterventions,
    ),
  };
  const statuses = Object.values(dimensions).map((dimension) => dimension.status);
  const verdict = statuses.includes("fail") ? "fail" : statuses.includes("incomplete") ? "incomplete" : "pass";
  return { verdict, dimensions };
}
