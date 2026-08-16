import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadEvidenceVocabulary } from "./evidence-vocabulary.js";

// `evals/README.md` claims scenarios/skills covers every shipped skill. It said
// that while 26 files stood against 103 skills, because nothing checked. These
// tests derive both sides from disk at runtime, so the claim cannot drift again:
// adding a skill without a scenario, or renaming one, fails here.

const root = process.cwd();
const SKILLS_DIR = join(root, "kit", "skills");
const SCENARIOS_DIR = join(root, "evals", "scenarios", "skills");

function shippedSkills(): string[] {
  return readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

interface ScenarioFile {
  file: string;
  scenario: {
    id?: string;
    subjects?: { skills?: string[] };
    cases?: Record<string, { expected?: { outcome?: { requiredEvidence?: string[] } } }>;
  };
}

function scenarioFiles(): ScenarioFile[] {
  return readdirSync(SCENARIOS_DIR)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .map((file) => ({
      file,
      scenario: JSON.parse(readFileSync(join(SCENARIOS_DIR, file), "utf8")) as ScenarioFile["scenario"],
    }));
}

describe("skill scenario coverage", () => {
  it("has a scenario file named for every shipped skill", () => {
    const present = new Set(scenarioFiles().map(({ file }) => file.replace(/\.json$/, "")));
    const uncovered = shippedSkills().filter((skill) => !present.has(skill));
    expect(
      uncovered,
      "each shipped skill needs evals/scenarios/skills/<skill>.json with a positive and a nearest-negative case",
    ).toEqual([]);
  });

  it("names its file after the skill it is the subject of", () => {
    // scenario-loader.test.ts owns "every shipped skill is some scenario's
    // subject", using the real loader. This owns the weaker but separate claim
    // that the filename matches, so `ls | wc -l` is a meaningful count and a
    // file cannot drift away from the skill it is named for.
    const mismatched: string[] = [];
    for (const { file, scenario } of scenarioFiles()) {
      const name = file.replace(/\.json$/, "");
      const subjects = (scenario.subjects?.skills ?? []).map((s) => s.replace(/^av:/, ""));
      if (subjects.length > 0 && !subjects.includes(name)) {
        mismatched.push(`${file} is the subject of ${subjects.join(", ")}`);
      }
    }
    expect(mismatched).toEqual([]);
  });

  it("names no scenario after a skill that no longer ships", () => {
    const shipped = new Set(shippedSkills());
    const stale = scenarioFiles()
      .map(({ file }) => file.replace(/\.json$/, ""))
      .filter((name) => !shipped.has(name));
    expect(stale, "a renamed or removed skill orphans its scenario — rename or delete it").toEqual([]);
  });

  it("resolves every requiredEvidence id against the vocabulary", () => {
    const known = new Set(
      loadEvidenceVocabulary(join(root, "evals", "vocabulary", "evidence-v1.json")).evidence.map((e) => e.id),
    );
    const unknown: string[] = [];
    for (const { file, scenario } of scenarioFiles()) {
      for (const [name, testCase] of Object.entries(scenario.cases ?? {})) {
        for (const id of testCase.expected?.outcome?.requiredEvidence ?? []) {
          if (!known.has(id)) unknown.push(`${file} (${name}): ${id}`);
        }
      }
    }
    expect(
      unknown,
      "add the id to evals/vocabulary/evidence-v1.json with a criterion an evaluator can check, or use an existing one",
    ).toEqual([]);
  });

  it("gives every scenario a unique id", () => {
    const seen = new Map<string, string>();
    const duplicates: string[] = [];
    for (const { file, scenario } of scenarioFiles()) {
      const id = scenario.id ?? "(missing)";
      const first = seen.get(id);
      if (first) duplicates.push(`${id}: ${first} and ${file}`);
      else seen.set(id, file);
    }
    expect(duplicates).toEqual([]);
  });
});
