import { preflightScenarioCapabilities } from "../capability-preflight.js";
import { parseEvidenceVocabulary } from "../evidence-vocabulary.js";
import { createRunContext } from "../run-context.js";
import { parseScenario } from "../scenario-loader.js";

const vocabulary = parseEvidenceVocabulary(JSON.stringify({
  schemaVersion: 1,
  evidence: [{
    id: "local.check",
    producer: "harness",
    proof: "execution",
    capabilities: {},
    criterion: "The local harness verifies a deterministic fixture-only condition.",
  }],
}));
const scenario = parseScenario(JSON.stringify({
  schemaVersion: 1,
  id: "test.local-run",
  revision: 1,
  level: "workflow",
  title: "Local test run",
  subjects: { skills: ["av:test"] },
  fixture: { id: "synthetic.skill-routing", copy: true },
  cases: {
    default: {
      prompt: "Run a local check.",
      expected: {
        outcome: { terminal: "completed", requiredEvidence: ["local.check"] },
        safety: { maxViolations: 0, forbiddenActions: [] },
      },
    },
  },
}));

export function createSupportedTestRun() {
  const run = createRunContext();
  const preflight = preflightScenarioCapabilities({ run, scenario, caseId: "default", vocabulary, available: [] });
  return { run, preflight };
}
