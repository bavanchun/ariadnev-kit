import { buildBehavioralReport, type BehavioralReportRun, type BehavioralVariant } from "./behavioral-report.js";
import { runBehavioralCase, type BehavioralLauncher, type BehavioralRunnerIdentity } from "./behavioral-runner.js";
import type { EvidenceVocabularyV1 } from "./evidence-vocabulary.js";
import { validateScenarioEvidence } from "./evidence-vocabulary.js";
import { loadScenarioDirectory } from "./scenario-loader.js";

export interface BehavioralSuiteOptions {
  scenarioDirectories: string[];
  catalogPath: string;
  vocabulary: EvidenceVocabularyV1;
  identity: BehavioralRunnerIdentity;
  variant: BehavioralVariant;
  availableCapabilities: string[];
  timeoutMs: number;
  skillRepeats: number;
  deepRepeats: number;
  concurrency?: number;
  launcher: BehavioralLauncher;
  onProgress?(completed: number, total: number): void;
}

function positiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 1) throw new Error(`${label} must be a positive integer`);
}

function reportRun(
  cellId: string,
  level: "skill" | "workflow" | "kit",
  repeat: number,
  variant: BehavioralVariant,
  result: Awaited<ReturnType<typeof runBehavioralCase>>,
): BehavioralReportRun {
  const dimensions = Object.fromEntries(
    Object.entries(result.score.dimensions).map(([name, score]) => [name, score.status]),
  ) as BehavioralReportRun["dimensions"];
  const input = result.envelope.metrics.inputTokens;
  const output = result.envelope.metrics.outputTokens;
  return {
    cellId,
    variant,
    level,
    repeat,
    verdict: result.score.verdict,
    failureClass: result.failureClass,
    observationGaps: [...result.observer.observationGaps],
    dimensions,
    metrics: {
      latencyMs: result.envelope.metrics.latencyMs,
      tokens: input === null || output === null ? null : input + output,
      contextChars: result.envelope.metrics.contextChars,
      retries: result.envelope.metrics.retries,
      humanInterventions: result.envelope.metrics.humanInterventions,
    },
  };
}

export async function runBehavioralSuite(options: BehavioralSuiteOptions) {
  positiveInteger(options.timeoutMs, "timeoutMs");
  positiveInteger(options.skillRepeats, "skillRepeats");
  positiveInteger(options.deepRepeats, "deepRepeats");
  const concurrency = options.concurrency ?? 1;
  positiveInteger(concurrency, "concurrency");
  const scenarios = options.scenarioDirectories.flatMap(loadScenarioDirectory);
  const ids = scenarios.map((scenario) => scenario.id);
  if (new Set(ids).size !== ids.length) throw new Error("suite scenario ids must be unique");
  validateScenarioEvidence(scenarios, options.vocabulary);
  const work = scenarios.flatMap((scenario) => Object.keys(scenario.cases).flatMap((caseId) => {
    const repeats = scenario.level === "skill" ? options.skillRepeats : options.deepRepeats;
    return Array.from({ length: repeats }, (_, index) => ({ scenario, caseId, repeat: index + 1 }));
  }));
  const runs = new Array<BehavioralReportRun>(work.length);
  const errors = new Array<unknown>(work.length);
  let next = 0;
  let completed = 0;
  const worker = async () => {
    for (;;) {
      const index = next++;
      const item = work[index];
      if (!item) return;
      try {
        const result = await runBehavioralCase({
          scenario: item.scenario,
          caseId: item.caseId,
          catalogPath: options.catalogPath,
          vocabulary: options.vocabulary,
          identity: options.identity,
          availableCapabilities: options.availableCapabilities,
          timeoutMs: options.timeoutMs,
          launcher: options.launcher,
        });
        runs[index] = reportRun(`${item.scenario.id}:${item.caseId}`, item.scenario.level, item.repeat, options.variant, result);
      } catch (error) {
        errors[index] = error;
      } finally {
        completed += 1;
        options.onProgress?.(completed, work.length);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, work.length) }, worker));
  const firstError = errors.find((error) => error !== undefined);
  if (firstError !== undefined) throw firstError;
  const skillScenarios = scenarios.filter((scenario) => scenario.level === "skill");
  const deepScenarios = scenarios.filter((scenario) => scenario.level !== "skill");
  return {
    population: {
      skillScenarios: skillScenarios.length,
      skillCells: skillScenarios.reduce((total, scenario) => total + Object.keys(scenario.cases).length, 0),
      deepTasks: deepScenarios.length,
      runs: runs.length,
    },
    runs,
    identity: {
      kit: options.identity.kit,
      runtime: options.identity.runtime,
      evaluator: options.identity.evaluator,
    },
    report: buildBehavioralReport({
      baseline: options.identity.kit.version,
      runs,
      comparisons: [],
      expectedSkillCells: skillScenarios.reduce((total, scenario) => total + Object.keys(scenario.cases).length, 0),
    }),
  };
}
