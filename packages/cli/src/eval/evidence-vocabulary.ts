import { readFileSync } from "node:fs";
import { z } from "zod";
import { categoricalToken } from "./categorical-token.js";
import type { ScenarioV1 } from "./scenario-types.js";
import { parseStrictJson } from "./strict-json.js";

const capabilitySchema = z.record(z.string(), z.literal("required"));

const entrySchema = z
  .object({
    id: z.string(),
    producer: z.enum(["harness", "evaluator"]),
    proof: z.enum(["artifact", "decision", "execution", "external-state", "outcome", "source"]),
    capabilities: capabilitySchema,
    criterion: z.string().min(20).max(300),
  })
  .strict();

const vocabularySchema = z
  .object({
    schemaVersion: z.literal(1),
    evidence: z.array(entrySchema).min(1),
  })
  .strict();

export type EvidenceVocabularyV1 = z.infer<typeof vocabularySchema>;

export function parseEvidenceVocabulary(input: string, source = "evidence vocabulary"): EvidenceVocabularyV1 {
  const value = parseStrictJson(input, `${source}: evidence vocabulary`);
  const parsed = vocabularySchema.parse(value);
  const ids = parsed.evidence.map((entry) => categoricalToken(entry.id, "evidence.id"));
  if (new Set(ids).size !== ids.length) throw new Error(`${source}: evidence ids must be unique`);
  return {
    ...parsed,
    evidence: parsed.evidence.map((entry, index) => ({
      ...entry,
      id: ids[index],
      capabilities: Object.fromEntries(
        Object.keys(entry.capabilities).map((capability, capabilityIndex) => [
          categoricalToken(capability, `evidence[${index}].capabilities[${capabilityIndex}]`),
          "required" as const,
        ]),
      ),
    })),
  };
}

export function loadEvidenceVocabulary(path: string): EvidenceVocabularyV1 {
  return parseEvidenceVocabulary(readFileSync(path, "utf8"), path);
}

export function validateScenarioEvidence(
  scenarios: ScenarioV1[],
  vocabulary: EvidenceVocabularyV1,
): void {
  const known = new Set(vocabulary.evidence.map((entry) => entry.id));
  for (const scenario of scenarios) {
    for (const [caseId, testCase] of Object.entries(scenario.cases)) {
      const required = new Set(testCase.expected.outcome.requiredEvidence);
      for (const criterionId of required) {
        if (!known.has(criterionId)) throw new Error(`${scenario.id}.${caseId}: evidence is absent from vocabulary: ${criterionId}`);
      }
      for (const artifact of Object.values(testCase.expected.artifacts ?? {})) {
        if (!known.has(artifact.evidenceId)) {
          throw new Error(`${scenario.id}.${caseId}: artifact evidence is absent from vocabulary: ${artifact.evidenceId}`);
        }
        if (!required.has(artifact.evidenceId)) {
          throw new Error(`${scenario.id}.${caseId}: artifact criterion must also be required evidence: ${artifact.evidenceId}`);
        }
      }
    }
  }
}
