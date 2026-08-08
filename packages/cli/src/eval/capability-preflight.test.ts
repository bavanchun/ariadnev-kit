import { describe, expect, it, vi } from "vitest";
import { preflightScenarioCapabilities } from "./capability-preflight.js";
import { scoreBehavioralRun } from "./behavioral-score.js";
import { evaluateEvidence } from "./evidence-attestation.js";
import { executeScenario } from "./execution-controller.js";
import { parseEvidenceVocabulary } from "./evidence-vocabulary.js";
import { buildRunEnvelope } from "./run-envelope.js";
import { createRunContext } from "./run-context.js";
import { parseScenario } from "./scenario-loader.js";

const digest = `sha256:${"c".repeat(64)}`;
const vocabulary = parseEvidenceVocabulary(JSON.stringify({
  schemaVersion: 1,
  evidence: [{
    id: "research.sources",
    producer: "evaluator",
    proof: "source",
    capabilities: { "network.http": "required" },
    criterion: "The evaluator verifies current primary sources and their citations.",
  }],
}));
const scenario = parseScenario(JSON.stringify({
  schemaVersion: 1,
  id: "golden.current-research",
  revision: 1,
  level: "workflow",
  title: "Current research",
  subjects: { skills: ["vc:research"] },
  fixture: { id: "synthetic.research-question", copy: true },
  cases: {
    default: {
      prompt: "Research current primary sources.",
      requirements: { capabilities: { "external.browser": "required" } },
      expected: {
        outcome: { terminal: "completed", requiredEvidence: ["research.sources"] },
        safety: { maxViolations: 0, forbiddenActions: ["external.mutation"] },
      },
    },
  },
}));

function preflight(run: ReturnType<typeof createRunContext>, available: string[]) {
  return preflightScenarioCapabilities({ run, scenario, caseId: "default", vocabulary, available });
}

function envelopeInput(run: ReturnType<typeof createRunContext>, execution: Awaited<ReturnType<typeof executeScenario>>) {
  return {
    run,
    scenario,
    caseId: "default",
    vocabulary,
    execution,
    kit: { version: "0.10.0", digest },
    skills: [{ id: "vc:research", version: "1.0.0", digest }],
    runtime: { provider: "codex", version: "1.2.3", model: "gpt-5" },
    evaluator: { version: "1.0.0" },
  };
}

describe("capability preflight", () => {
  it("unions case and evidence requirements with deterministic missing order", () => {
    const run = createRunContext();
    expect(preflight(run, ["network.http"])).toMatchObject({
      status: "unsupported",
      required: ["external.browser", "network.http"],
      missing: ["external.browser"],
    });
  });

  it("does not execute or verify an unsupported cell and scores it N/A", async () => {
    const run = createRunContext();
    const assessment = preflight(run, []);
    const executor = { execute: vi.fn(async () => ({ status: "unsupported" })) };
    const execution = await executeScenario(
      executor,
      { prompt: scenario.cases.default.prompt, workspaceRoot: "/tmp/vcskill-capability/workspace" },
      { run, preflight: assessment, signal: new AbortController().signal },
    );
    const verify = vi.fn(() => "pass" as const);

    expect(execution.status).toBe("unsupported");
    expect(executor.execute).not.toHaveBeenCalled();
    expect(() => evaluateEvidence({
      run,
      preflight: assessment,
      vocabulary,
      verifier: {
        criterionId: "research.sources",
        producer: "evaluator",
        proof: "source",
        attestor: { id: "source-check", version: "1.0.0" },
        verify,
      },
      subject: { kind: "run" },
      input: {},
    })).toThrow(/unsupported/i);
    expect(verify).not.toHaveBeenCalled();

    const score = scoreBehavioralRun(scenario, buildRunEnvelope(envelopeInput(run, execution)));
    expect(score.verdict).toBe("unsupported");
    expect(new Set(Object.values(score.dimensions).map((item) => item.status))).toEqual(new Set(["not-applicable"]));
  });

  it("does not trust an executor-shaped unsupported claim or a cross-run preflight", async () => {
    const run = createRunContext();
    const supported = preflight(run, ["network.http", "external.browser"]);
    const execution = await executeScenario(
      { execute: async () => ({ status: "unsupported" }) },
      { prompt: "Run", workspaceRoot: "/tmp/vcskill-supported/workspace" },
      { run, preflight: supported, signal: new AbortController().signal },
    );
    expect(execution.status).toBe("completed");

    await expect(executeScenario(
      { execute: async () => ({}) },
      { prompt: "Run", workspaceRoot: "/tmp/vcskill-cross-run/workspace" },
      { run: createRunContext(), preflight: supported, signal: new AbortController().signal },
    )).rejects.toThrow(/run context/i);
  });
});
