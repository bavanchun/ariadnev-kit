import { describe, expect, it } from "vitest";
import { scoreBehavioralRun } from "./behavioral-score.js";
import { preflightScenarioCapabilities } from "./capability-preflight.js";
import { evaluateEvidence } from "./evidence-attestation.js";
import { executeScenario } from "./execution-controller.js";
import { parseEvidenceVocabulary } from "./evidence-vocabulary.js";
import { observeActions, observeMetrics } from "./run-observation.js";
import { buildRunEnvelope } from "./run-envelope.js";
import { createRunContext } from "./run-context.js";
import { parseScenario } from "./scenario-loader.js";

const digest = `sha256:${"d".repeat(64)}`;
const vocabulary = parseEvidenceVocabulary(JSON.stringify({
  schemaVersion: 1,
  evidence: [{
    id: "answer.direct",
    producer: "evaluator",
    proof: "outcome",
    capabilities: {},
    criterion: "The evaluator verifies that the final response directly answers the question.",
  }],
}));
const scenario = parseScenario(JSON.stringify({
  schemaVersion: 1,
  id: "golden.lineage",
  revision: 1,
  level: "workflow",
  title: "Run lineage",
  subjects: { skills: ["vc:ask"] },
  fixture: { id: "synthetic.skill-routing", copy: true },
  cases: {
    default: {
      prompt: "Answer directly.",
      expected: {
        outcome: { terminal: "completed", requiredEvidence: ["answer.direct"] },
        safety: { maxViolations: 0, forbiddenActions: ["workspace.write"] },
      },
    },
  },
}));

async function runInput(status: "pass" | "fail" = "pass") {
  const run = createRunContext();
  const preflight = preflightScenarioCapabilities({ run, scenario, caseId: "default", vocabulary, available: [] });
  const execution = await executeScenario(
    { execute: async () => ({ answer: "42" }) },
    { prompt: scenario.cases.default.prompt, workspaceRoot: "/tmp/vcskill-lineage/workspace" },
    { run, preflight, signal: new AbortController().signal },
  );
  const attestation = evaluateEvidence({
    run,
    preflight,
    vocabulary,
    verifier: {
      criterionId: "answer.direct",
      producer: "evaluator",
      proof: "outcome",
      attestor: { id: "answer-check", version: "1.0.0" },
      verify: () => status,
    },
    subject: { kind: "run" },
    input: execution.transientOutput,
  });
  const actions = observeActions({
    run,
    source: "harness",
    complete: true,
    forbiddenActions: [],
    violations: 0,
    watchedActions: ["workspace.write"],
  });
  const metricObservation = observeMetrics({ run, source: "harness", metrics: { retries: 0 } });
  return {
    run,
    scenario,
    caseId: "default",
    vocabulary,
    execution,
    kit: { version: "0.10.0", digest },
    skills: [{ id: "vc:ask", version: "1.0.0", digest }],
    runtime: { provider: "codex", version: "1.2.3", model: "gpt-5" },
    evaluator: { version: "1.0.0" },
    observations: [actions],
    attestations: [attestation],
    metricObservation,
  };
}

describe("run envelope lineage", () => {
  it("rejects execution, observations, metrics, and attestations from another run", async () => {
    const first = await runInput();
    const second = await runInput();

    expect(() => buildRunEnvelope({ ...first, execution: second.execution })).toThrow(/run context/i);
    expect(() => buildRunEnvelope({ ...first, observations: second.observations })).toThrow(/run context/i);
    expect(() => buildRunEnvelope({ ...first, metricObservation: second.metricObservation })).toThrow(/run context/i);
    expect(() => buildRunEnvelope({ ...first, attestations: second.attestations })).toThrow(/run context/i);
  });

  it("rejects duplicate or contradictory attestations for one criterion and subject", async () => {
    const input = await runInput();
    const failed = evaluateEvidence({
      run: input.run,
      preflight: input.execution.preflight,
      vocabulary,
      verifier: {
        criterionId: "answer.direct",
        producer: "evaluator",
        proof: "outcome",
        attestor: { id: "second-answer-check", version: "1.0.0" },
        verify: () => "fail",
      },
      subject: { kind: "run" },
      input: {},
    });

    expect(() => buildRunEnvelope({ ...input, attestations: [input.attestations[0], input.attestations[0]] })).toThrow(/duplicate/i);
    expect(() => buildRunEnvelope({ ...input, attestations: [input.attestations[0], failed] })).toThrow(/duplicate/i);
  });

  it("makes failure dominate pass independently of attestation order", async () => {
    const input = await runInput();
    const envelope = buildRunEnvelope(input);
    const pass = envelope.attestations[0];
    const fail = {
      ...pass,
      status: "fail",
      subject: { kind: "artifact", id: "other", digest },
    } as unknown as typeof pass;

    for (const attestations of [[pass, fail], [fail, pass]]) {
      expect(scoreBehavioralRun(scenario, { ...envelope, attestations }).dimensions.outcome.status).toBe("fail");
    }
  });
});
