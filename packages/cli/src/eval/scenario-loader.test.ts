import { readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { copyScenarioFixture } from "./fixture-catalog.js";
import { loadScenarioDirectory, parseScenario } from "./scenario-loader.js";
import { createScenarioExecutionInput } from "./scenario-types.js";

const catalogPath = join(process.cwd(), "evals", "fixtures", "catalog.json");
const copies: string[] = [];
const validScenario = {
  schemaVersion: 1,
  id: "skill.ask.routing",
  revision: 1,
  level: "skill",
  title: "Route direct questions",
  subjects: { skills: ["av:ask"] },
  fixture: { id: "synthetic.skill-routing", copy: true },
  cases: {
    positive: {
      prompt: "Answer this technical question directly.",
      requirements: { capabilities: { "network.http": "required" } },
      expected: {
        outcome: { terminal: "completed", requiredEvidence: ["answer.direct"] },
        routing: { "av:ask": "required", "av:research": "forbidden" },
        safety: { maxViolations: 0, forbiddenActions: ["workspace.write"] },
      },
    },
  },
};

afterEach(() => {
  for (const root of copies.splice(0)) rmSync(root, { force: true, recursive: true });
});

describe("parseScenario", () => {
  it("parses a strict schema-v1 scenario whose case ids are structural keys", () => {
    expect(parseScenario(JSON.stringify(validScenario), "valid.json")).toEqual(validScenario);
  });

  it("rejects unknown major versions, invalid case keys, and unknown fields", () => {
    expect(() => parseScenario(JSON.stringify({ ...validScenario, schemaVersion: 2 }), "v2.json")).toThrow(
      /schemaVersion/,
    );
    expect(() =>
      parseScenario(
        JSON.stringify({ ...validScenario, cases: { "Not A Token": validScenario.cases.positive } }),
        "case-key.json",
      ),
    ).toThrow(/cases|categorical/i);
    expect(() => parseScenario(JSON.stringify({ ...validScenario, surprise: true }), "extra.json")).toThrow(
      /unrecognized|unknown/i,
    );
  });

  it("rejects duplicate categorical contract entries", () => {
    const duplicateSubjects = { ...validScenario, subjects: { skills: ["av:ask", "av:ask"] } };
    const duplicateEvidence = structuredClone(validScenario);
    duplicateEvidence.cases.positive.expected.outcome.requiredEvidence.push("answer.direct");

    expect(() => parseScenario(JSON.stringify(duplicateSubjects), "subjects.json")).toThrow(/unique/i);
    expect(() => parseScenario(JSON.stringify(duplicateEvidence), "evidence.json")).toThrow(/unique/i);
  });

  it("rejects duplicate decoded JSON keys before JSON.parse can overwrite them", () => {
    const serialized = JSON.stringify(validScenario);
    const body = JSON.stringify(validScenario.cases.positive);
    const duplicated = serialized.replace(
      `\"cases\":{\"positive\":${body}}`,
      `\"cases\":{\"positive\":${body},\"\\u0070ositive\":${body}}`,
    );

    expect(() => parseScenario(duplicated, "duplicate-case.json")).toThrow(/duplicate.*positive/i);
  });

  it("gives the executor only a prompt and opaque disposable workspace path", () => {
    const scenario = parseScenario(JSON.stringify(validScenario));
    const copy = copyScenarioFixture(catalogPath, scenario.fixture.id, { parentDirectory: tmpdir() });
    copies.push(copy.containerRoot);
    const execution = createScenarioExecutionInput(scenario, "positive", copy);
    const serialized = JSON.stringify(execution);

    expect(execution).toEqual({
      prompt: "Answer this technical question directly.",
      workspaceRoot: copy.root,
    });
    for (const forbidden of [
      "skill.ask.routing",
      "positive",
      "synthetic.skill-routing",
      "network.http",
      "expected",
      "answer.direct",
      "av:research",
      "budgets",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(copy.root).not.toContain(scenario.fixture.id);
  });
});

describe("checked-in behavioral scenarios", () => {
  it("covers every authored skill with positive and nearest-negative routing cases", () => {
    // The suite proves routing for the skills this project wrote. A ported skill
    // arrives with upstream's own description and no scenario, and inventing one
    // would measure this project's guess at what upstream meant rather than
    // anything about the skill. They are listed as an uncovered count instead of
    // being silently excluded, so the gap stays a visible number.
    const scenarios = loadScenarioDirectory(join(process.cwd(), "evals", "scenarios", "skills"));
    const skillsRoot = join(process.cwd(), "kit", "skills");
    const all = readdirSync(skillsRoot).sort();
    const ported = all.filter((name) =>
      /^\s*origin:\s*ported\s*$/m.test(readFileSync(join(skillsRoot, name, "SKILL.md"), "utf8")),
    );
    const authored = all.filter((name) => !ported.includes(name)).map((name) => `av:${name}`);
    const coveredSkills = scenarios.flatMap((scenario) => scenario.subjects.skills).sort();

    const uncovered = authored.filter((skill) => !coveredSkills.includes(skill));
    expect(uncovered, "authored skills with no routing scenario").toEqual([]);

    // Four scenarios outlived the skill they were written for: those skills were
    // replaced by their upstream version, which carries a different description.
    // The scenarios still name real skills, so they are kept rather than thrown
    // away — but what they assert was calibrated against text that is gone, and
    // they need re-reading the next time the behavioral suite is run for real.
    const portedWithScenario = ported.map((name) => `av:${name}`).filter((skill) => coveredSkills.includes(skill));
    expect(portedWithScenario.sort()).toEqual(["av:research", "av:scenario", "av:security-scan", "av:sequential-thinking"]);
    expect(ported.length - portedWithScenario.length, "ported skills with no scenario at all").toBe(23);
    for (const scenario of scenarios) {
      expect(scenario.level).toBe("skill");
      expect(Object.keys(scenario.cases).sort()).toEqual(["negative", "positive"]);
      const positive = Object.entries(scenario.cases.positive.expected.routing ?? {})
        .filter(([, relation]) => relation === "required")
        .map(([skill]) => skill);
      const negative = Object.entries(scenario.cases.negative.expected.routing ?? {})
        .filter(([, relation]) => relation === "forbidden")
        .map(([skill]) => skill);
      expect(positive).toEqual(scenario.subjects.skills);
      expect(negative).toEqual(scenario.subjects.skills);
    }
  });

  it("loads 12-15 deep golden tasks and exposes a machine JSON Schema", () => {
    const golden = loadScenarioDirectory(join(process.cwd(), "evals", "scenarios", "golden"));
    const schema = JSON.parse(
      readFileSync(join(process.cwd(), "evals", "schema", "scenario.schema.json"), "utf8"),
    ) as Record<string, unknown>;

    expect(golden.length).toBeGreaterThanOrEqual(12);
    expect(golden.length).toBeLessThanOrEqual(15);
    expect(new Set(golden.map((scenario) => scenario.id)).size).toBe(golden.length);
    expect(schema).toMatchObject({ $id: "https://ariadnev.com/schemas/eval-scenario-v1.json" });
    expect(JSON.stringify(schema)).toContain('"const":1');
  });
});
