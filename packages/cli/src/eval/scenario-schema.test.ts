import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import { parseScenario } from "./scenario-loader.js";

const schemaPath = join(process.cwd(), "evals", "schema", "scenario.schema.json");
const schema = JSON.parse(readFileSync(schemaPath, "utf8")) as object;
const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);

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
      expected: {
        outcome: { terminal: "completed", requiredEvidence: ["answer.direct"] },
        routing: { "av:ask": "required", "av:research": "forbidden" },
        safety: { maxViolations: 0, forbiddenActions: ["workspace.write"] },
      },
    },
  },
  tags: ["routing"],
};

function acceptsJsonSchema(value: unknown): boolean {
  return validate(structuredClone(value));
}

function acceptsZod(value: unknown): boolean {
  try {
    parseScenario(JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

describe("scenario JSON Schema parity", () => {
  it("compiles in strict draft-2020-12 mode and validates every checked-in scenario", () => {
    for (const group of ["skills", "golden"]) {
      const directory = join(process.cwd(), "evals", "scenarios", group);
      for (const file of readdirSync(directory).filter((name) => name.endsWith(".json"))) {
        const value = JSON.parse(readFileSync(join(directory, file), "utf8")) as unknown;
        expect(acceptsJsonSchema(value), `${group}/${file}: ${JSON.stringify(validate.errors)}`).toBe(true);
        expect(acceptsZod(value), `${group}/${file}`).toBe(true);
      }
    }
  });

  it("makes case-id uniqueness structural and matches Zod on invalid contracts", () => {
    const duplicateSubject = structuredClone(validScenario);
    duplicateSubject.subjects.skills.push("av:ask");
    const duplicateEvidence = structuredClone(validScenario);
    duplicateEvidence.cases.positive.expected.outcome.requiredEvidence.push("answer.direct");
    const invalidCaseKey = { ...validScenario, cases: { ...validScenario.cases, "Not A Token": validScenario.cases.positive } };
    const unknownVersion = { ...validScenario, schemaVersion: 2 };
    const extraField = { ...validScenario, rawPrompt: "must never be accepted" };
    const invalidRoute = structuredClone(validScenario);
    invalidRoute.cases.positive.expected.routing["av:ask"] = "sometimes";

    for (const invalid of [duplicateSubject, duplicateEvidence, invalidCaseKey, unknownVersion, extraField, invalidRoute]) {
      expect(acceptsJsonSchema(invalid)).toBe(false);
      expect(acceptsZod(invalid)).toBe(false);
    }
  });
});
