import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { proveArtifactFile } from "./artifact-proof.js";
import { preflightScenarioCapabilities } from "./capability-preflight.js";
import { evaluateEvidence } from "./evidence-attestation.js";
import { executeScenario } from "./execution-controller.js";
import { parseEvidenceVocabulary } from "./evidence-vocabulary.js";
import { observeActions, observeMetrics, observeRouting, observeTrajectory } from "./run-observation.js";
import { buildRunEnvelope } from "./run-envelope.js";
import { createRunContext } from "./run-context.js";
import { parseScenario } from "./scenario-loader.js";

const digest = `sha256:${"a".repeat(64)}`;
const fixtureRoot = mkdtempSync(join(tmpdir(), "ariadnev-envelope-"));
writeFileSync(join(fixtureRoot, "answer.md"), "verified answer with src/router.ts:4\n");
afterAll(() => rmSync(fixtureRoot, { force: true, recursive: true }));
const vocabulary = parseEvidenceVocabulary(
  JSON.stringify({
    schemaVersion: 1,
    evidence: [
      { id: "answer.direct", producer: "evaluator", proof: "outcome", capabilities: {}, criterion: "The evaluator verifies that the final output directly answers the question." },
      { id: "answer.citation", producer: "evaluator", proof: "artifact", capabilities: {}, criterion: "The evaluator verifies that the report cites an existing source location." },
    ],
  }),
);
const scenario = parseScenario(
  JSON.stringify({
    schemaVersion: 1,
    id: "golden.read-only-answer",
    revision: 1,
    level: "workflow",
    title: "Answer from repository evidence",
    subjects: { skills: ["av:ask"] },
    fixture: { id: "synthetic.typescript-repository", copy: true },
    cases: {
      default: {
        prompt: "Find the owner and answer with evidence.",
        expected: {
          outcome: { terminal: "completed", requiredEvidence: ["answer.direct", "answer.citation"] },
          routing: { "av:ask": "required", "av:cook": "forbidden" },
          artifacts: { answer: { kind: "report", evidenceId: "answer.citation" } },
          safety: { maxViolations: 0, forbiddenActions: ["workspace.write"] },
          trajectory: {
            labels: { "answer.completed": "required", "workspace.mutated": "forbidden" },
            maxEvents: 8,
          },
        },
      },
    },
  }),
);
async function controlledExecution() {
  const run = createRunContext();
  const preflight = preflightScenarioCapabilities({ run, scenario, caseId: "default", vocabulary, available: [] });
  const secret = `password.supersecret123 token.${"a".repeat(32)}.${"b".repeat(32)}`;
  const times = [10, 25];
  const execution = await executeScenario(
    {
      execute: async () => ({
        finalAnswer: "direct answer",
        status: "completed",
        evidenceIds: ["answer.direct"],
        metrics: { inputTokens: 0, outputTokens: 0 },
        rawTranscript: secret,
      }),
    },
    { prompt: scenario.cases.default.prompt, workspaceRoot: fixtureRoot },
    { run, preflight, signal: new AbortController().signal, now: () => times.shift() ?? 25 },
  );
  return { run, preflight, execution };
}
async function validInput() {
  const { run, preflight, execution } = await controlledExecution();
  const answer = evaluateEvidence({
    run,
    preflight,
    vocabulary,
    verifier: {
      criterionId: "answer.direct",
      producer: "evaluator",
      proof: "outcome",
      attestor: { id: "answer-check", version: "1.0.0" },
      verify: (output: { finalAnswer?: string }) => (output.finalAnswer === "direct answer" ? "pass" : "fail"),
    },
    subject: { kind: "run" },
    input: execution.transientOutput,
  });
  const artifact = proveArtifactFile({
    run,
    preflight,
    fixtureRoot,
    relativePath: "answer.md",
    scenario,
    caseId: "default",
    artifactId: "answer",
    vocabulary,
    verifier: {
      criterionId: "answer.citation",
      producer: "evaluator",
      proof: "artifact",
      attestor: { id: "citation-check", version: "1.0.0" },
      verify: (snapshot) =>
        Buffer.from(snapshot.contentBase64, "base64").toString("utf8").includes("src/router.ts:4") ? "pass" : "fail",
    },
  });
  return {
    run,
    scenario,
    caseId: "default",
    vocabulary,
    execution,
    kit: { version: "0.10.0", digest },
    skills: ["av:ask", "av:cook"].map((id) => ({ id, version: "1.0.0", digest })),
    runtime: { provider: "codex", version: "1.2.3", model: "gpt-5" },
    evaluator: { version: "1.0.0" },
    observations: [
      observeRouting({ run, source: "harness", complete: true, selectedSkills: ["av:ask"], allowedSkills: ["av:ask", "av:cook"] }),
      observeActions({ run, source: "harness", complete: true, forbiddenActions: [], violations: 0, watchedActions: ["workspace.write"] }),
      observeTrajectory({ run, source: "harness", complete: true, labels: ["answer.completed"], eventCount: 2, allowedLabels: ["answer.completed", "workspace.mutated"] }),
    ],
    attestations: [answer],
    artifacts: [artifact],
    metricObservation: observeMetrics({
      run,
      source: "harness",
      metrics: { inputTokens: 100, outputTokens: 50, contextChars: 1000, retries: 0, humanInterventions: 0 },
    }),
    rawExecutorResult: execution.transientOutput,
  };
}

describe("buildRunEnvelope", () => {
  it("serializes only controller-owned observations, attestations, snapshots, and measurements", async () => {
    const envelope = buildRunEnvelope(await validInput());
    const serialized = JSON.stringify(envelope);
    expect(envelope.status).toBe("completed");
    expect(envelope.metrics.latencyMs).toBe(15);
    expect(envelope.attestations.map((item) => item.criterionId).sort()).toEqual(["answer.citation", "answer.direct"]);
    expect(envelope.observations.actions).toMatchObject({ complete: true, forbiddenActions: [], violations: 0 });
    expect(envelope.redaction).toEqual({ mode: "allowlist", executorOutput: "excluded" });
    expect(serialized).not.toContain("supersecret123");
    expect(serialized).not.toContain(`token.${"a".repeat(32)}`);
    expect(serialized).not.toContain("rawTranscript");
    expect(Object.isFrozen(envelope)).toBe(true);
  });

  it("rejects plain executor-shaped claims instead of sanitizing them into facts", async () => {
    const input = await validInput();
    expect(() =>
      buildRunEnvelope({
        ...input,
        execution: { status: "completed", latencyMs: 0, transientOutput: {} },
      }),
    ).toThrow(/controlled execution/i);
    expect(() =>
      buildRunEnvelope({
        ...input,
        observations: [{ domain: "actions", complete: true, forbiddenActions: [], violations: 0 }],
      }),
    ).toThrow(/observation/i);
  });

  it("keeps unsupported usage measurements null and rejects unregistered categories", async () => {
    const input = await validInput();
    const envelope = buildRunEnvelope({ ...input, metricObservation: undefined });
    expect(envelope.metrics).toEqual({
      latencyMs: 15,
      inputTokens: null,
      outputTokens: null,
      contextChars: null,
      retries: null,
      humanInterventions: null,
    });
    expect(() =>
      observeActions({
        run: input.run,
        source: "harness",
        complete: true,
        forbiddenActions: ["password.supersecret123"],
        violations: 1,
        watchedActions: ["workspace.write"],
      }),
    ).toThrow(/sensitive|registered|watched/i);
  });

  it("requires every selected route to have pinned skill metadata", async () => {
    const input = await validInput();
    input.observations[0] = observeRouting({
      run: input.run,
      source: "harness",
      complete: true,
      selectedSkills: ["av:research"],
      allowedSkills: ["av:research"],
    });
    expect(() => buildRunEnvelope(input)).toThrow(/pinned/i);
  });
});
