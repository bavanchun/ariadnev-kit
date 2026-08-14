import { categoricalToken, sha256Digest } from "./categorical-token.js";
import { assertCapabilityPreflight, type CapabilityPreflightV1 } from "./capability-preflight.js";
import type { EvidenceVocabularyV1 } from "./evidence-vocabulary.js";
import { bindRunContext, type RunBoundV1, type RunContextV1 } from "./run-context.js";

const evidenceAttestationBrand: unique symbol = Symbol("ariadnev.evidence-attestation");

export type EvidenceProducer = "harness" | "evaluator";
export type EvidenceProof = "artifact" | "decision" | "execution" | "external-state" | "outcome" | "source";
export type EvidenceStatus = "pass" | "fail" | "incomplete";
export type EvidenceSubjectV1 =
  | { readonly kind: "run" }
  | { readonly kind: "artifact"; readonly id: string; readonly digest: string };

export interface EvidenceAttestationV1 extends RunBoundV1 {
  readonly criterionId: string;
  readonly producer: EvidenceProducer;
  readonly proof: EvidenceProof;
  readonly status: EvidenceStatus;
  readonly subject: EvidenceSubjectV1;
  readonly attestor: { readonly id: string; readonly version: string };
  readonly [evidenceAttestationBrand]: true;
}

export interface EvidenceVerifier<T> {
  criterionId: string;
  producer: EvidenceProducer;
  proof: EvidenceProof;
  attestor: { id: string; version: string };
  verify(input: T): EvidenceStatus;
}

function normalizeSubject(subject: EvidenceSubjectV1): EvidenceSubjectV1 {
  if (subject.kind === "run") return Object.freeze({ kind: "run" });
  return Object.freeze({
    kind: "artifact",
    id: categoricalToken(subject.id, "evidence.subject.id"),
    digest: sha256Digest(subject.digest, "evidence.subject.digest"),
  });
}

export function evaluateEvidence<T>(input: {
  run: RunContextV1;
  preflight: CapabilityPreflightV1;
  vocabulary: EvidenceVocabularyV1;
  verifier: EvidenceVerifier<T>;
  subject: EvidenceSubjectV1;
  input: T;
}): EvidenceAttestationV1 {
  assertCapabilityPreflight(input.run, input.preflight);
  if (input.preflight.status === "unsupported") throw new Error("cannot verify evidence for an unsupported run");
  const criterionId = categoricalToken(input.verifier.criterionId, "evidence.criterionId");
  const entry = input.vocabulary.evidence.find((candidate) => candidate.id === criterionId);
  if (!entry) throw new Error(`evidence criterion is not in vocabulary: ${criterionId}`);
  if (entry.producer !== input.verifier.producer) throw new Error(`evidence producer mismatch: ${criterionId}`);
  if (entry.proof !== input.verifier.proof) throw new Error(`evidence proof mismatch: ${criterionId}`);
  if (Object.keys(entry.capabilities).some((capability) => !input.preflight.required.includes(capability))) {
    throw new Error(`capability preflight does not cover evidence criterion: ${criterionId}`);
  }
  const status = input.verifier.verify(input.input);
  if (!(["pass", "fail", "incomplete"] as const).includes(status)) throw new Error("invalid evidence status");
  const attestation = {
    criterionId,
    producer: entry.producer,
    proof: entry.proof,
    status,
    subject: normalizeSubject(input.subject),
    attestor: Object.freeze({
      id: categoricalToken(input.verifier.attestor.id, "evidence.attestor.id"),
      version: categoricalToken(input.verifier.attestor.version, "evidence.attestor.version"),
    }),
  } as Omit<EvidenceAttestationV1, keyof RunBoundV1>;
  Object.defineProperty(attestation, evidenceAttestationBrand, { value: true });
  return bindRunContext(input.run, attestation) as EvidenceAttestationV1;
}

export function isEvidenceAttestation(value: unknown): value is EvidenceAttestationV1 {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.isFrozen(value) &&
    Object.prototype.hasOwnProperty.call(value, evidenceAttestationBrand)
  );
}

export function assertAttestationVocabulary(
  attestation: EvidenceAttestationV1,
  vocabulary: EvidenceVocabularyV1,
): void {
  const entry = vocabulary.evidence.find((candidate) => candidate.id === attestation.criterionId);
  if (!entry || entry.producer !== attestation.producer || entry.proof !== attestation.proof) {
    throw new Error(`evidence attestation does not match vocabulary: ${attestation.criterionId}`);
  }
}
