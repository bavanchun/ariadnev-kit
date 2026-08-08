import { isArtifactProof, type ArtifactProofV1 } from "./artifact-proof.js";
import {
  assertAttestationVocabulary,
  isEvidenceAttestation,
  type EvidenceAttestationV1,
} from "./evidence-attestation.js";
import type { EvidenceVocabularyV1 } from "./evidence-vocabulary.js";
import { assertRunBound, type RunContextV1 } from "./run-context.js";
import { getScenarioCase, type ScenarioV1 } from "./scenario-types.js";

function values(input: unknown, label: string): unknown[] {
  if (input === undefined) return [];
  if (!Array.isArray(input)) throw new Error(`${label} must be an array`);
  return input;
}

function attestationKey(attestation: EvidenceAttestationV1): string {
  const subject = attestation.subject.kind === "run"
    ? `run:${attestation.runId}`
    : `artifact:${attestation.subject.id}:${attestation.subject.digest}`;
  return `${attestation.criterionId}:${subject}`;
}

export function collectEnvelopeEvidence(input: {
  run: RunContextV1;
  attestations: unknown;
  artifacts: unknown;
  vocabulary: EvidenceVocabularyV1;
  scenario: ScenarioV1;
  caseId: string;
}) {
  const attestations = values(input.attestations, "attestations").map((value, index) => {
    if (!isEvidenceAttestation(value)) throw new Error(`attestations[${index}] must be independently verified`);
    assertRunBound(input.run, value, `attestations[${index}]`);
    if (value.subject.kind !== "run") throw new Error("artifact attestations must arrive with artifact proof");
    assertAttestationVocabulary(value, input.vocabulary);
    return value;
  });
  const artifacts = values(input.artifacts, "artifacts").map((value, index) => {
    if (!isArtifactProof(value)) throw new Error(`artifacts[${index}] must be created by proveArtifactFile`);
    assertRunBound(input.run, value, `artifacts[${index}]`);
    assertRunBound(input.run, value.attestation, `artifacts[${index}].attestation`);
    assertAttestationVocabulary(value.attestation, input.vocabulary);
    return value as ArtifactProofV1;
  });
  if (new Set(artifacts.map((item) => item.id)).size !== artifacts.length) throw new Error("artifacts must be unique");
  const expected = getScenarioCase(input.scenario, input.caseId).expected.artifacts ?? {};
  for (const artifact of artifacts) {
    const contract = expected[artifact.id];
    const subject = artifact.attestation.subject;
    if (
      !contract ||
      contract.kind !== artifact.kind ||
      contract.evidenceId !== artifact.attestation.criterionId ||
      subject.kind !== "artifact" ||
      subject.id !== artifact.id ||
      subject.digest !== artifact.digest
    ) {
      throw new Error(`artifact proof does not match scenario contract: ${artifact.id}`);
    }
    attestations.push(artifact.attestation);
  }
  const keys = attestations.map(attestationKey);
  if (new Set(keys).size !== keys.length) throw new Error("duplicate evidence attestation for criterion and subject");
  const orderedAttestations = attestations
    .map((attestation) => ({ attestation, key: attestationKey(attestation) }))
    .sort((left, right) => left.key.localeCompare(right.key))
    .map(({ attestation }) => attestation);
  return {
    attestations: orderedAttestations,
    artifacts: artifacts
      .map(({ id, kind, digest, bytes }) => ({ id, kind, digest, bytes }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  };
}
