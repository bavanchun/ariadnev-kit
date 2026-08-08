import { rmSync } from "node:fs";
import { scoreBehavioralRun, type BehavioralScore } from "./behavioral-score.js";
import { createBehavioralObserver, type BehavioralObserverSummary } from "./behavioral-observer.js";
import { preflightScenarioCapabilities } from "./capability-preflight.js";
import type { EvidenceAttestationV1 } from "./evidence-attestation.js";
import type { EvidenceVocabularyV1 } from "./evidence-vocabulary.js";
import { executeScenario, type ControlledExecutionV1 } from "./execution-controller.js";
import { copyScenarioFixture, type FixtureCopyV1 } from "./fixture-catalog.js";
import { buildRunEnvelope, type RunEnvelopeV1 } from "./run-envelope.js";
import { createRunContext, type RunContextV1 } from "./run-context.js";
import { createScenarioExecutionInput, type ScenarioV1 } from "./scenario-types.js";

export type BehavioralFailureClass = "none" | "unsupported" | "provider-unavailable" | "process-crash" |
  "malformed-envelope" | "timed-out" | "cancelled" | "path-violation";
export type BehavioralLaunchResult =
  | { kind: "completed"; output: string }
  | { kind: "unavailable" }
  | { kind: "malformed" }
  | { kind: "crashed"; exitCode?: number; signal?: string };
export interface BehavioralLauncher {
  launch(input: { prompt: string; workspaceRoot: string }, signal: AbortSignal): Promise<BehavioralLaunchResult>;
}
export interface BehavioralRunnerIdentity {
  kit: { version: string; digest: string };
  skills: Array<{ id: string; version: string; digest: string }>;
  runtime: { provider: string; version: string; model: string };
  evaluator: { version: string };
}
export interface BehavioralEvaluationResult {
  attestations?: EvidenceAttestationV1[];
}
export interface BehavioralEvaluationContext {
  run: RunContextV1;
  fixture: FixtureCopyV1;
  execution: ControlledExecutionV1;
}
export interface BehavioralCaseResult {
  envelope: RunEnvelopeV1;
  score: BehavioralScore;
  failureClass: BehavioralFailureClass;
  observer: Pick<BehavioralObserverSummary, "workspaceMutations" | "pathViolations" | "observationGaps">;
}

function normalizeLaunch(value: unknown): BehavioralLaunchResult {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("malformed-envelope");
  const result = value as Record<string, unknown>;
  if (result.kind === "completed" && typeof result.output === "string") return { kind: "completed", output: result.output };
  if (result.kind === "unavailable") return { kind: "unavailable" };
  if (result.kind === "malformed") return { kind: "malformed" };
  if (result.kind === "crashed") {
    if (result.exitCode !== undefined && (!Number.isInteger(result.exitCode) || Number(result.exitCode) < 0)) throw new Error("malformed-envelope");
    if (result.signal !== undefined && typeof result.signal !== "string") throw new Error("malformed-envelope");
    return { kind: "crashed", ...(result.exitCode === undefined ? {} : { exitCode: Number(result.exitCode) }), ...(result.signal === undefined ? {} : { signal: result.signal }) };
  }
  throw new Error("malformed-envelope");
}

function pathGuard(score: BehavioralScore, violations: number): BehavioralScore {
  if (violations === 0) return score;
  return {
    ...score,
    verdict: "fail",
    dimensions: {
      ...score.dimensions,
      safety: { status: "fail", earned: 0, possible: 1, reasons: [`fixture path guard violations: ${violations}`] },
    },
  };
}

export async function runBehavioralCase(input: {
  scenario: ScenarioV1;
  caseId: string;
  catalogPath: string;
  vocabulary: EvidenceVocabularyV1;
  identity: BehavioralRunnerIdentity;
  availableCapabilities: string[];
  timeoutMs: number;
  launcher: BehavioralLauncher;
  signal?: AbortSignal;
  evaluate?(context: BehavioralEvaluationContext): Promise<BehavioralEvaluationResult>;
}): Promise<BehavioralCaseResult> {
  if (!Number.isInteger(input.timeoutMs) || input.timeoutMs < 1) throw new Error("timeoutMs must be a positive integer");
  const fixture = copyScenarioFixture(input.catalogPath, input.scenario.fixture.id);
  const run = createRunContext();
  const preflight = preflightScenarioCapabilities({ run, scenario: input.scenario, caseId: input.caseId, vocabulary: input.vocabulary, available: input.availableCapabilities });
  const observer = createBehavioralObserver({
    run,
    fixture,
    scenario: input.scenario,
    caseId: input.caseId,
    allowedSkills: input.identity.skills.map((skill) => skill.id),
  });
  await observer.ready();
  const controller = new AbortController();
  let abortReason: "cancelled" | "timed-out" | undefined;
  let launchFailure: BehavioralFailureClass = "none";
  const cancel = () => {
    if (!abortReason) abortReason = "cancelled";
    controller.abort();
  };
  if (input.signal?.aborted) cancel();
  else input.signal?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(() => {
    if (!abortReason) abortReason = "timed-out";
    controller.abort();
  }, input.timeoutMs);
  try {
    const execution = await executeScenario({
      execute: async (request, signal) => {
        try {
          const launched = normalizeLaunch(await input.launcher.launch(request, signal));
          if (launched.kind === "completed") return launched.output;
          launchFailure = launched.kind === "unavailable" ? "provider-unavailable"
            : launched.kind === "malformed" ? "malformed-envelope"
            : "process-crash";
          throw new Error(launchFailure);
        } catch (error) {
          if (error instanceof Error && error.message === "malformed-envelope") launchFailure = "malformed-envelope";
          else if (launchFailure === "none") launchFailure = "process-crash";
          throw error;
        }
      },
    }, createScenarioExecutionInput(input.scenario, input.caseId, fixture), {
      run,
      preflight,
      signal: controller.signal,
      abortStatus: () => abortReason ?? "cancelled",
    });
    const observed = await observer.finish();
    const evaluated = input.evaluate && execution.status !== "unsupported"
      ? await input.evaluate({ run, fixture, execution })
      : {};
    const supported = execution.status !== "unsupported";
    const envelope = buildRunEnvelope({
      run, scenario: input.scenario, caseId: input.caseId, vocabulary: input.vocabulary, execution,
      ...input.identity,
      observations: supported ? observed.observations : [],
      metricObservation: supported ? observed.metricObservation : undefined,
      attestations: supported ? evaluated.attestations ?? [] : [],
      artifacts: [],
    });
    const failureClass = observed.pathViolations > 0 ? "path-violation"
      : execution.status === "timed-out" ? "timed-out"
      : execution.status === "cancelled" ? "cancelled"
      : execution.status === "unsupported" ? "unsupported"
      : launchFailure;
    return {
      envelope,
      score: pathGuard(scoreBehavioralRun(input.scenario, envelope), observed.pathViolations),
      failureClass,
      observer: {
        workspaceMutations: observed.workspaceMutations,
        pathViolations: observed.pathViolations,
        observationGaps: observed.observationGaps,
      },
    };
  } finally {
    clearTimeout(timer);
    input.signal?.removeEventListener("abort", cancel);
    rmSync(fixture.containerRoot, { force: true, recursive: true });
  }
}
