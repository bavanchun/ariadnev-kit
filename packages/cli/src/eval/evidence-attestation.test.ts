import { describe, expect, it } from "vitest";
import { createSupportedTestRun } from "./__fixtures__/run-test-fixture.js";
import { evaluateEvidence, isEvidenceAttestation } from "./evidence-attestation.js";
import { parseEvidenceVocabulary } from "./evidence-vocabulary.js";

const vocabulary = parseEvidenceVocabulary(
  JSON.stringify({
    schemaVersion: 1,
    evidence: [
      {
        id: "answer.direct",
        producer: "evaluator",
        proof: "outcome",
        capabilities: {},
        criterion: "The final answer directly resolves the supplied technical question.",
      },
      {
        id: "tests.results",
        producer: "harness",
        proof: "execution",
        capabilities: {},
        criterion: "The harness observes the required test commands complete successfully.",
      },
    ],
  }),
);

describe("evaluateEvidence", () => {
  it("creates a vocabulary-bound attestation without retaining verifier input", () => {
    const secretOutput = { answer: "42", token: `token.${"a".repeat(32)}.${"b".repeat(32)}` };
    const testRun = createSupportedTestRun();
    const attestation = evaluateEvidence({
      ...testRun,
      vocabulary,
      verifier: {
        criterionId: "answer.direct",
        producer: "evaluator",
        proof: "outcome",
        attestor: { id: "deterministic-answer-check", version: "1.0.0" },
        verify: (output: typeof secretOutput) => (output.answer === "42" ? "pass" : "fail"),
      },
      subject: { kind: "run" },
      input: secretOutput,
    });

    expect(attestation).toMatchObject({ criterionId: "answer.direct", status: "pass", producer: "evaluator" });
    expect(isEvidenceAttestation(attestation)).toBe(true);
    expect(JSON.stringify(attestation)).not.toContain(secretOutput.token);
  });

  it("rejects unknown criteria and producer/proof mismatches before verification", () => {
    const testRun = createSupportedTestRun();
    const base = {
      ...testRun,
      vocabulary,
      subject: { kind: "run" } as const,
      input: "answer",
      verifier: {
        criterionId: "answer.direct",
        producer: "evaluator" as const,
        proof: "outcome" as const,
        attestor: { id: "answer-check", version: "1.0.0" },
        verify: () => "pass" as const,
      },
    };

    expect(() => evaluateEvidence({ ...base, verifier: { ...base.verifier, criterionId: "unknown.claim" } })).toThrow(
      /vocabulary/i,
    );
    expect(() => evaluateEvidence({ ...base, verifier: { ...base.verifier, producer: "harness" } })).toThrow(
      /producer/i,
    );
    expect(() => evaluateEvidence({ ...base, verifier: { ...base.verifier, proof: "source" } })).toThrow(/proof/i);
    expect(isEvidenceAttestation({ criterionId: "answer.direct", status: "pass" })).toBe(false);
  });
});
