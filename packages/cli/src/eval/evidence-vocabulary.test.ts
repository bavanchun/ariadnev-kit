import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { preflightScenarioCapabilities } from "./capability-preflight.js";
import {
  loadEvidenceVocabulary,
  parseEvidenceVocabulary,
  validateScenarioEvidence,
} from "./evidence-vocabulary.js";
import { loadScenarioDirectory, parseScenario } from "./scenario-loader.js";
import { createRunContext } from "./run-context.js";

const vocabularyPath = join(process.cwd(), "evals", "vocabulary", "evidence-v1.json");

describe("evidence vocabulary", () => {
  it("defines and validates exactly every outcome and artifact criterion", () => {
    const vocabulary = loadEvidenceVocabulary(vocabularyPath);
    const scenarios = ["skills", "golden"].flatMap((group) =>
      loadScenarioDirectory(join(process.cwd(), "evals", "scenarios", group)),
    );
    const required = scenarios.flatMap((scenario) =>
      Object.values(scenario.cases).flatMap((testCase) => [
        ...testCase.expected.outcome.requiredEvidence,
        ...Object.values(testCase.expected.artifacts ?? {}).map((artifact) => artifact.evidenceId),
      ]),
    );

    expect(() => validateScenarioEvidence(scenarios, vocabulary)).not.toThrow();
    expect(vocabulary.evidence.map((entry) => entry.id).sort()).toEqual([...new Set(required)].sort());
    expect(vocabulary.evidence.every((entry) => entry.criterion.length >= 20)).toBe(true);

    const capabilityCells = scenarios.flatMap((scenario) => Object.keys(scenario.cases).flatMap((caseId) => {
      const run = createRunContext();
      const preflight = preflightScenarioCapabilities({ run, scenario, caseId, vocabulary, available: [] });
      return preflight.required.length ? [`${scenario.id}.${caseId}=${preflight.required.join(",")}`] : [];
    }));
    // This was a literal list of the twelve cells that needed a capability.
    // At 105 skill scenarios that list is churn, not a check — it would have to
    // be rewritten every time a scenario is added, which is how the coverage
    // claim in evals/README.md drifted in the first place. The property it was
    // standing in for is the real invariant: a case requires exactly the union
    // of the capabilities its required evidence declares, nothing more.
    const expectedCells = scenarios.flatMap((scenario) =>
      Object.entries(scenario.cases).flatMap(([caseId, testCase]) => {
        const needed = new Set<string>();
        for (const id of testCase.expected.outcome.requiredEvidence) {
          const entry = vocabulary.evidence.find((candidate) => candidate.id === id);
          for (const capability of Object.keys(entry?.capabilities ?? {})) needed.add(capability);
        }
        return needed.size ? [`${scenario.id}.${caseId}=${[...needed].sort().join(",")}`] : [];
      }),
    );
    expect(capabilityCells.sort()).toEqual(expectedCells.sort());
    // A capability-free suite would satisfy the equality above vacuously.
    expect(capabilityCells.length).toBeGreaterThan(0);
  });

  it("rejects artifacts whose semantic criterion is absent from required evidence", () => {
    const vocabulary = loadEvidenceVocabulary(vocabularyPath);
    const scenario = parseScenario(
      JSON.stringify({
        schemaVersion: 1,
        id: "golden.invalid-artifact",
        revision: 1,
        level: "workflow",
        title: "Invalid artifact evidence",
        subjects: { skills: ["av:ask"] },
        fixture: { id: "synthetic.skill-routing", copy: true },
        cases: {
          default: {
            prompt: "Answer.",
            expected: {
              outcome: { terminal: "completed", requiredEvidence: ["answer.direct"] },
              artifacts: { answer: { kind: "report", evidenceId: "answer.citation" } },
              safety: { maxViolations: 0, forbiddenActions: [] },
            },
          },
        },
      }),
    );

    expect(() => validateScenarioEvidence([scenario], vocabulary)).toThrow(/artifact.*required evidence/i);
  });

  it("rejects duplicate and secret-shaped evidence identifiers", () => {
    const base = {
      schemaVersion: 1,
      evidence: [
        { id: "tests.results", producer: "harness", proof: "execution", capabilities: {}, criterion: "The recorded test command exits successfully." },
      ],
    };
    expect(() => parseEvidenceVocabulary(JSON.stringify({ ...base, evidence: [...base.evidence, ...base.evidence] }))).toThrow(
      /unique/i,
    );
    expect(() =>
      parseEvidenceVocabulary(JSON.stringify({ ...base, evidence: [{ ...base.evidence[0], id: "sk_live_abcd" }] })),
    ).toThrow(/sensitive/i);
    expect(() => parseEvidenceVocabulary(JSON.stringify({
      ...base,
      evidence: [{ ...base.evidence[0], capabilities: undefined }],
    }))).toThrow();
  });
});
