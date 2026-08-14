import { assertScenarioPreflight } from "./capability-preflight.js";
import { categoricalToken, sha256Digest } from "./categorical-token.js";
import type { EvidenceAttestationV1 } from "./evidence-attestation.js";
import type { EvidenceVocabularyV1 } from "./evidence-vocabulary.js";
import { isControlledExecution, type ControlledExecutionV1, type ControlledStatus } from "./execution-controller.js";
import {
  isMetricObservation,
  isRunObservation,
  type MetricName,
  type MetricObservationV1,
  type ObservationSource,
  type RunObservationV1,
} from "./run-observation.js";
import { collectEnvelopeEvidence } from "./run-envelope-evidence.js";
import { assertRunBound, isRunContext, type RunContextV1 } from "./run-context.js";
import { getScenarioCase, scenarioSchemaV1, type ScenarioV1 } from "./scenario-types.js";

export const RUN_ENVELOPE_SCHEMA_VERSION = 1 as const;
export type RunStatus = ControlledStatus;
export interface RunMetricsV1 {
  readonly latencyMs: number;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly contextChars: number | null;
  readonly retries: number | null;
  readonly humanInterventions: number | null;
}
interface ObservationState { readonly complete: boolean; readonly source: ObservationSource | null }
export interface RunEnvelopeV1 {
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly scenario: { readonly id: string; readonly revision: number; readonly caseId: string };
  readonly capabilities: { readonly status: "supported" | "unsupported"; readonly required: readonly string[]; readonly missing: readonly string[] };
  readonly kit: { readonly version: string; readonly digest: string };
  readonly skills: ReadonlyArray<{ readonly id: string; readonly version: string; readonly digest: string }>;
  readonly runtime: { readonly provider: string; readonly version: string; readonly model: string };
  readonly evaluator: { readonly version: string };
  readonly status: RunStatus;
  readonly observations: {
    readonly routing: ObservationState & { readonly selectedSkills: readonly string[] };
    readonly actions: ObservationState & { readonly forbiddenActions: readonly string[]; readonly violations: number };
    readonly trajectory: ObservationState & { readonly labels: readonly string[]; readonly eventCount: number };
  };
  readonly attestations: readonly EvidenceAttestationV1[];
  readonly artifacts: ReadonlyArray<{ readonly id: string; readonly kind: string; readonly digest: string; readonly bytes: number }>;
  readonly metrics: RunMetricsV1;
  readonly metricSources: Readonly<Record<keyof RunMetricsV1, ObservationSource | null>>;
  readonly redaction: { readonly mode: "allowlist"; readonly executorOutput: "excluded" };
}
type UnknownRecord = Record<string, unknown>;
function record(value: unknown, label: string): UnknownRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as UnknownRecord;
}
function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
}
function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function identities(root: UnknownRecord) {
  const kit = record(root.kit, "kit");
  const runtime = record(root.runtime, "runtime");
  const evaluator = record(root.evaluator, "evaluator");
  const skills = array(root.skills, "skills").map((value, index) => {
    const skill = record(value, `skills[${index}]`);
    return {
      id: categoricalToken(skill.id, `skills[${index}].id`),
      version: categoricalToken(skill.version, `skills[${index}].version`),
      digest: sha256Digest(skill.digest, `skills[${index}].digest`),
    };
  });
  if (new Set(skills.map((skill) => skill.id)).size !== skills.length) throw new Error("skills must be unique");
  return {
    kit: { version: categoricalToken(kit.version, "kit.version"), digest: sha256Digest(kit.digest, "kit.digest") },
    skills,
    runtime: {
      provider: categoricalToken(runtime.provider, "runtime.provider"),
      version: categoricalToken(runtime.version, "runtime.version"),
      model: categoricalToken(runtime.model, "runtime.model"),
    },
    evaluator: { version: categoricalToken(evaluator.version, "evaluator.version") },
  };
}

function observations(values: unknown, scenario: ScenarioV1, caseId: string, pinned: Set<string>, run: RunContextV1) {
  const testCase = getScenarioCase(scenario, caseId);
  const batches = values === undefined ? [] : array(values, "observations");
  const byDomain = new Map<string, RunObservationV1>();
  for (const [index, value] of batches.entries()) {
    if (!isRunObservation(value)) throw new Error(`observations[${index}] must be a trusted observation`);
    assertRunBound(run, value, `observations[${index}]`);
    if (byDomain.has(value.domain)) throw new Error(`duplicate observation domain: ${value.domain}`);
    byDomain.set(value.domain, value);
  }
  const routing = byDomain.get("routing");
  const actions = byDomain.get("actions");
  const trajectory = byDomain.get("trajectory");
  if (routing?.domain === "routing" && routing.selectedSkills.some((skill) => !pinned.has(skill))) {
    throw new Error("selected route must have pinned skill metadata");
  }
  const watched = new Set(testCase.expected.safety.forbiddenActions);
  if (actions?.domain === "actions" && actions.forbiddenActions.some((action) => !watched.has(action))) {
    throw new Error("action observation is not in scenario policy");
  }
  const labels = new Set(Object.keys(testCase.expected.trajectory?.labels ?? {}));
  if (trajectory?.domain === "trajectory" && trajectory.labels.some((label) => !labels.has(label))) {
    throw new Error("trajectory observation is not in scenario contract");
  }
  return {
    routing: routing?.domain === "routing"
      ? { complete: routing.complete, source: routing.source, selectedSkills: routing.selectedSkills }
      : { complete: false, source: null, selectedSkills: [] },
    actions: actions?.domain === "actions"
      ? { complete: actions.complete, source: actions.source, forbiddenActions: actions.forbiddenActions, violations: actions.violations }
      : { complete: false, source: null, forbiddenActions: [], violations: 0 },
    trajectory: trajectory?.domain === "trajectory"
      ? { complete: trajectory.complete, source: trajectory.source, labels: trajectory.labels, eventCount: trajectory.eventCount }
      : { complete: false, source: null, labels: [], eventCount: 0 },
  };
}

function metrics(execution: ControlledExecutionV1, value: unknown, run: RunContextV1) {
  let observation: MetricObservationV1 | undefined;
  if (value !== undefined) {
    if (!isMetricObservation(value)) throw new Error("metricObservation must be a trusted observation");
    assertRunBound(run, value, "metricObservation");
    observation = value;
  }
  const names: MetricName[] = ["inputTokens", "outputTokens", "contextChars", "retries", "humanInterventions"];
  const values = Object.fromEntries(names.map((name) => [name, observation?.metrics[name] ?? null])) as Omit<RunMetricsV1, "latencyMs">;
  const sources = Object.fromEntries(
    names.map((name) => [name, observation?.metrics[name] === undefined ? null : observation.source]),
  ) as Record<MetricName, ObservationSource | null>;
  return { values: { latencyMs: execution.latencyMs, ...values }, sources: { latencyMs: "harness" as const, ...sources } };
}

function hasEvidence(root: UnknownRecord): boolean {
  return [root.observations, root.attestations, root.artifacts].some((value) => Array.isArray(value) && value.length > 0)
    || root.metricObservation !== undefined;
}

export function buildRunEnvelope(input: unknown): RunEnvelopeV1 {
  const root = record(input, "run envelope input");
  if (!isRunContext(root.run)) throw new Error("run must be a controller-created run context");
  const run = root.run;
  const scenario = scenarioSchemaV1.parse(root.scenario);
  const caseId = categoricalToken(root.caseId, "scenario.caseId");
  getScenarioCase(scenario, caseId);
  if (!isControlledExecution(root.execution)) throw new Error("execution must be a controlled execution");
  assertRunBound(run, root.execution, "execution");
  const vocabulary = root.vocabulary as EvidenceVocabularyV1;
  if (!vocabulary || !Array.isArray(vocabulary.evidence)) throw new Error("evidence vocabulary is required");
  assertScenarioPreflight(run, root.execution.preflight, scenario, caseId, vocabulary);
  if ((root.execution.preflight.status === "unsupported") !== (root.execution.status === "unsupported")) {
    throw new Error("execution status does not match capability preflight");
  }
  if (root.execution.status === "unsupported" && hasEvidence(root)) throw new Error("unsupported run cannot contain evidence");
  const metadata = identities(root);
  const observed = observations(root.observations, scenario, caseId, new Set(metadata.skills.map((skill) => skill.id)), run);
  const proven = collectEnvelopeEvidence({ run, attestations: root.attestations, artifacts: root.artifacts, vocabulary, scenario, caseId });
  const measured = metrics(root.execution, root.metricObservation, run);
  const preflight = root.execution.preflight;
  return deepFreeze({
    schemaVersion: RUN_ENVELOPE_SCHEMA_VERSION,
    runId: run.runId,
    scenario: { id: scenario.id, revision: scenario.revision, caseId },
    capabilities: { status: preflight.status, required: [...preflight.required], missing: [...preflight.missing] },
    ...metadata,
    status: root.execution.status,
    observations: observed,
    ...proven,
    metrics: measured.values,
    metricSources: measured.sources,
    redaction: { mode: "allowlist", executorOutput: "excluded" },
  });
}
