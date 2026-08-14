import { z } from "zod";
import { isFixtureCopy, type FixtureCopyV1 } from "./fixture-catalog.js";

export const SCENARIO_SCHEMA_VERSION = 1 as const;

const token = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z0-9][a-z0-9:._-]*$/, "must be a categorical identifier");
const skillId = z.string().regex(/^vc:[a-z0-9]+(?:-[a-z0-9]+)*$/, "must be a vc skill id");
const nonNegative = z.number().finite().nonnegative();

function uniqueArray<T extends z.ZodTypeAny>(item: T) {
  return z.array(item).superRefine((values, context) => {
    const keys = values.map((value) => JSON.stringify(value));
    if (new Set(keys).size !== keys.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "entries must be unique" });
    }
  });
}

const routingExpectation = z
  .record(skillId, z.enum(["required", "forbidden"]))
  .refine((skills) => Object.keys(skills).length > 0, "must define at least one routing relation");

const outcomeExpectation = z
  .object({
    terminal: z.enum(["completed", "failed", "cancelled", "timed-out", "unsupported"]),
    requiredEvidence: uniqueArray(token),
  })
  .strict();

const artifactExpectation = z.object({ kind: token, evidenceId: token }).strict();

const safetyExpectation = z
  .object({
    maxViolations: z.number().int().nonnegative(),
    forbiddenActions: uniqueArray(token),
  })
  .strict();

const trajectoryExpectation = z
  .object({
    labels: z
      .record(token, z.enum(["required", "forbidden"]))
      .refine((labels) => Object.keys(labels).length > 0, "must define at least one trajectory relation"),
    maxEvents: z.number().int().positive(),
  })
  .strict();

const budgets = z
  .object({
    latencyMs: nonNegative.optional(),
    tokens: nonNegative.optional(),
    contextChars: nonNegative.optional(),
    retries: z.number().int().nonnegative().optional(),
    humanInterventions: z.number().int().nonnegative().optional(),
  })
  .strict();

export const scenarioCaseSchemaV1 = z
  .object({
    prompt: z.string().min(1).max(8_000),
    requirements: z
      .object({
        capabilities: z
          .record(token, z.literal("required"))
          .refine((capabilities) => Object.keys(capabilities).length > 0, "must define at least one capability"),
      })
      .strict()
      .optional(),
    expected: z
      .object({
        outcome: outcomeExpectation,
        routing: routingExpectation.optional(),
        artifacts: z
          .record(token, artifactExpectation)
          .refine((artifacts) => Object.keys(artifacts).length > 0, "must define at least one artifact")
          .optional(),
        safety: safetyExpectation,
        trajectory: trajectoryExpectation.optional(),
      })
      .strict(),
    budgets: budgets.optional(),
  })
  .strict();

export const scenarioSchemaV1 = z
  .object({
    $schema: z.literal("../../schema/scenario.schema.json").optional(),
    schemaVersion: z.literal(SCENARIO_SCHEMA_VERSION),
    id: token,
    revision: z.number().int().positive(),
    level: z.enum(["skill", "workflow", "kit"]),
    title: z.string().min(1).max(160),
    subjects: z.object({ skills: uniqueArray(skillId).pipe(z.array(skillId).min(1)) }).strict(),
    fixture: z.object({ id: token, copy: z.literal(true) }).strict(),
    cases: z
      .record(token, scenarioCaseSchemaV1)
      .refine((cases) => Object.keys(cases).length > 0, "must define at least one case"),
    tags: uniqueArray(token).optional(),
  })
  .strict();

export type ScenarioV1 = z.infer<typeof scenarioSchemaV1>;
export type ScenarioCaseV1 = z.infer<typeof scenarioCaseSchemaV1>;

export interface ScenarioExecutionInput {
  readonly prompt: string;
  /** Randomized disposable path; benchmark and fixture identities stay controller-side. */
  readonly workspaceRoot: string;
}

export interface ScenarioExecutor {
  /** The return value is transient and never score evidence by itself. */
  execute(input: ScenarioExecutionInput, signal: AbortSignal): Promise<unknown>;
}

export function getScenarioCase(scenario: ScenarioV1, caseId: string): ScenarioCaseV1 {
  const testCase = scenario.cases[caseId];
  if (!testCase) throw new Error(`scenario case not found: ${caseId}`);
  return testCase;
}

export function createScenarioExecutionInput(
  scenario: ScenarioV1,
  caseId: string,
  fixture: FixtureCopyV1,
): ScenarioExecutionInput {
  const testCase = getScenarioCase(scenario, caseId);
  if (!isFixtureCopy(fixture)) throw new Error("fixture must be a verified disposable copy");
  if (fixture.id !== scenario.fixture.id) throw new Error("fixture copy does not match scenario");
  return Object.freeze({ prompt: testCase.prompt, workspaceRoot: fixture.root });
}
