import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  createBehavioralProcessLauncher,
  type BehavioralCredentialEnvironment,
} from "../eval/behavioral-process.js";
import type { BehavioralVariant } from "../eval/behavioral-report.js";
import { runBehavioralSuite, type BehavioralSuiteOptions } from "../eval/behavioral-suite.js";
import { loadEvidenceVocabulary } from "../eval/evidence-vocabulary.js";
import { parseStrictJson } from "../eval/strict-json.js";
import { loadKit } from "../kit/load-kit.js";
import { packageVersion } from "../version.js";
import type { EvalResult } from "./eval-command.js";
import { runValidate } from "./validate-command.js";

interface SuiteResult {
  population: { skillScenarios: number; skillCells: number; deepTasks: number; runs: number };
  runs: import("../eval/behavioral-report.js").BehavioralReportRun[];
  identity: {
    kit: { version: string; digest: string };
    runtime: { provider: string; version: string; model: string };
    evaluator: { version: string };
  };
  report: { releaseGate: { verdict: "pass" | "fail" | "incomplete" } };
}
export interface BehavioralEvalDeps {
  runSuite(options: Omit<BehavioralSuiteOptions, "launcher" | "scenarioDirectories" | "catalogPath" | "vocabulary" | "identity"> & {
    command: string[];
    evalRoot: string;
    kitRoot: string;
    runtime: { provider: string; version: string; model: string };
    runnerHome?: string;
  }): Promise<SuiteResult>;
}
export interface BehavioralEvalOptions {
  command: string[];
  variant: BehavioralVariant;
  runtime: { provider: string; version: string; model: string };
  availableCapabilities: string[];
  timeoutMs: number;
  skillRepeats: number;
  deepRepeats: number;
  concurrency?: number;
  kitRoot: string;
  runnerHome?: string;
  evalRoot?: string;
  deps?: BehavioralEvalDeps;
}

export function parseBehavioralCommand(value: string): string[] {
  const parsed = parseStrictJson(value, "behavioral runner command");
  if (!Array.isArray(parsed) || parsed.length === 0) throw new Error("behavioral runner command must be a non-empty JSON array");
  if (!parsed.every((item) => typeof item === "string")) throw new Error("behavioral runner command entries must be strings");
  if (!parsed[0]?.trim()) throw new Error("behavioral runner executable must be non-empty");
  return parsed;
}

function digest(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function identity(kitRoot: string, runtime: BehavioralEvalOptions["runtime"]) {
  const kit = loadKit(kitRoot);
  const skills = kit.skills.map((skill) => {
    const metadata = skill.frontmatter.metadata as Record<string, unknown> | undefined;
    return {
      id: String(skill.frontmatter.name),
      version: typeof metadata?.version === "string" ? metadata.version
        : typeof skill.frontmatter.version === "string" ? skill.frontmatter.version
        : "unversioned",
      digest: digest(skill.raw),
    };
  }).sort((left, right) => left.id.localeCompare(right.id));
  const artifacts = [...kit.skills, ...kit.agents, ...kit.commands, ...kit.rules]
    .map((artifact) => `${artifact.type}:${artifact.name}:${digest(artifact.raw)}`)
    .sort();
  const hooks = kit.hooks.map((hook) => `hook:${hook.name}:${digest(JSON.stringify(hook.manifest))}:${digest(readFileSync(hook.file, "utf8"))}`).sort();
  return {
    kit: { version: packageVersion(), digest: digest([...artifacts, ...hooks].join("\n")) },
    skills,
    runtime,
    evaluator: { version: "behavioral-v1" },
  };
}

function credentialEnvironment(provider: string): BehavioralCredentialEnvironment[] {
  return provider === "codex" ? ["CODEX_HOME"] : [];
}

export function realBehavioralEvalDeps(): BehavioralEvalDeps {
  return {
    async runSuite(options) {
      const [executable, ...args] = options.command;
      return runBehavioralSuite({
        scenarioDirectories: [join(options.evalRoot, "scenarios/skills"), join(options.evalRoot, "scenarios/golden")],
        catalogPath: join(options.evalRoot, "fixtures/catalog.json"),
        vocabulary: loadEvidenceVocabulary(join(options.evalRoot, "vocabulary/evidence-v1.json")),
        identity: identity(options.kitRoot, options.runtime),
        variant: options.variant,
        availableCapabilities: options.availableCapabilities,
        timeoutMs: options.timeoutMs,
        skillRepeats: options.skillRepeats,
        deepRepeats: options.deepRepeats,
        concurrency: options.concurrency,
        launcher: createBehavioralProcessLauncher({
          executable: executable ?? "",
          args,
          credentialEnvironment: credentialEnvironment(options.runtime.provider),
          runnerHome: options.runnerHome,
        }),
      });
    },
  };
}

export async function runBehavioralEval(options: BehavioralEvalOptions): Promise<EvalResult> {
  const tier1 = runValidate({ kitRoot: options.kitRoot });
  const deps = options.deps ?? realBehavioralEvalDeps();
  const suite = await deps.runSuite({
    command: options.command,
    evalRoot: options.evalRoot ?? join(dirname(options.kitRoot), "evals"),
    kitRoot: options.kitRoot,
    runtime: options.runtime,
    variant: options.variant,
    availableCapabilities: options.availableCapabilities,
    timeoutMs: options.timeoutMs,
    skillRepeats: options.skillRepeats,
    deepRepeats: options.deepRepeats,
    concurrency: options.concurrency,
    runnerHome: options.runnerHome,
  });
  const output = {
    schemaVersion: 1,
    kind: "behavioral-eval",
    tier1: { ok: tier1.ok },
    environment: {
      variant: options.variant,
      kit: suite.identity.kit,
      runtime: suite.identity.runtime,
      evaluator: suite.identity.evaluator,
      settings: {
        timeoutMs: options.timeoutMs,
        skillRepeats: options.skillRepeats,
        deepRepeats: options.deepRepeats,
        concurrency: options.concurrency ?? 1,
        capabilities: [...options.availableCapabilities].sort(),
        credentialEnvironment: credentialEnvironment(options.runtime.provider),
        runnerHome: options.runnerHome ? "isolated-vcskill-install" : "fixture",
      },
    },
    population: suite.population,
    samples: suite.runs,
    report: suite.report,
  };
  return {
    ok: tier1.ok && suite.report.releaseGate.verdict === "pass",
    summary: JSON.stringify(output, null, 2),
  };
}
