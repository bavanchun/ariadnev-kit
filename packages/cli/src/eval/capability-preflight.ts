import { categoricalToken } from "./categorical-token.js";
import type { EvidenceVocabularyV1 } from "./evidence-vocabulary.js";
import { assertRunBound, bindRunContext, type RunBoundV1, type RunContextV1 } from "./run-context.js";
import { getScenarioCase, type ScenarioV1 } from "./scenario-types.js";

const capabilityPreflightBrand: unique symbol = Symbol("ariadnev.capability-preflight");

export interface CapabilityPreflightV1 extends RunBoundV1 {
  readonly scenario: { readonly id: string; readonly revision: number; readonly caseId: string };
  readonly status: "supported" | "unsupported";
  readonly required: readonly string[];
  readonly missing: readonly string[];
  readonly [capabilityPreflightBrand]: true;
}

function capabilitySet(values: readonly string[], label: string): string[] {
  return [...new Set(values.map((value, index) => categoricalToken(value, `${label}[${index}]`)))].sort();
}

function requiredCapabilities(
  scenario: ScenarioV1,
  caseId: string,
  vocabulary: EvidenceVocabularyV1,
): string[] {
  const testCase = getScenarioCase(scenario, caseId);
  const criteria = new Set([
    ...testCase.expected.outcome.requiredEvidence,
    ...Object.values(testCase.expected.artifacts ?? {}).map((artifact) => artifact.evidenceId),
  ]);
  const fromEvidence = [...criteria].flatMap((criterionId) => {
    const entry = vocabulary.evidence.find((candidate) => candidate.id === criterionId);
    if (!entry) throw new Error(`evidence criterion is not in vocabulary: ${criterionId}`);
    return Object.keys(entry.capabilities);
  });
  return capabilitySet([
    ...Object.keys(testCase.requirements?.capabilities ?? {}),
    ...fromEvidence,
  ], "capability.required");
}

export function preflightScenarioCapabilities(input: {
  run: RunContextV1;
  scenario: ScenarioV1;
  caseId: string;
  vocabulary: EvidenceVocabularyV1;
  available: string[];
}): CapabilityPreflightV1 {
  const required = requiredCapabilities(input.scenario, input.caseId, input.vocabulary);
  const available = new Set(capabilitySet(input.available, "capability.available"));
  const missing = required.filter((capability) => !available.has(capability));
  const result = {
    scenario: Object.freeze({ id: input.scenario.id, revision: input.scenario.revision, caseId: input.caseId }),
    status: missing.length === 0 ? "supported" : "unsupported",
    required: Object.freeze(required),
    missing: Object.freeze(missing),
  } as Omit<CapabilityPreflightV1, keyof RunBoundV1>;
  Object.defineProperty(result, capabilityPreflightBrand, { value: true });
  return bindRunContext(input.run, result) as CapabilityPreflightV1;
}

export function isCapabilityPreflight(value: unknown): value is CapabilityPreflightV1 {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.isFrozen(value) &&
    Object.prototype.hasOwnProperty.call(value, capabilityPreflightBrand)
  );
}

export function assertCapabilityPreflight(run: RunContextV1, value: unknown): asserts value is CapabilityPreflightV1 {
  if (!isCapabilityPreflight(value)) throw new Error("capability preflight must be controller-created");
  assertRunBound(run, value, "capability preflight");
}

export function assertScenarioPreflight(
  run: RunContextV1,
  value: unknown,
  scenario: ScenarioV1,
  caseId: string,
  vocabulary: EvidenceVocabularyV1,
): asserts value is CapabilityPreflightV1 {
  assertCapabilityPreflight(run, value);
  const expected = requiredCapabilities(scenario, caseId, vocabulary);
  if (
    value.scenario.id !== scenario.id ||
    value.scenario.revision !== scenario.revision ||
    value.scenario.caseId !== caseId ||
    value.required.length !== expected.length ||
    value.required.some((capability, index) => capability !== expected[index])
  ) {
    throw new Error("capability preflight does not match scenario contract");
  }
}
