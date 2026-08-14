import { createHash } from "node:crypto";
import { closeSync, constants, fstatSync, openSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { assertCapabilityPreflight, type CapabilityPreflightV1 } from "./capability-preflight.js";
import {
  evaluateEvidence,
  type EvidenceAttestationV1,
  type EvidenceVerifier,
} from "./evidence-attestation.js";
import type { EvidenceVocabularyV1 } from "./evidence-vocabulary.js";
import { bindRunContext, type RunBoundV1, type RunContextV1 } from "./run-context.js";
import { getScenarioCase, type ScenarioV1 } from "./scenario-types.js";

const MAX_ARTIFACT_BYTES = 16 * 1024 * 1024;
const artifactProofBrand: unique symbol = Symbol("vcskill.artifact-proof");

export interface ArtifactSnapshotV1 {
  readonly relativePath: string;
  readonly contentBase64: string;
  readonly digest: string;
  readonly bytes: number;
}

export interface ArtifactProofV1 extends RunBoundV1 {
  readonly id: string;
  readonly kind: string;
  readonly digest: string;
  readonly bytes: number;
  readonly attestation: EvidenceAttestationV1;
  readonly [artifactProofBrand]: true;
}

export interface ArtifactProofInput {
  run: RunContextV1;
  preflight: CapabilityPreflightV1;
  fixtureRoot: string;
  relativePath: string;
  scenario: ScenarioV1;
  caseId: string;
  artifactId: string;
  vocabulary: EvidenceVocabularyV1;
  verifier: EvidenceVerifier<ArtifactSnapshotV1>;
}

function isInside(root: string, candidate: string): boolean {
  const offset = relative(root, candidate);
  return offset !== "" && !offset.startsWith("..") && !isAbsolute(offset);
}

function snapshotFile(fixtureRoot: string, relativePath: string): ArtifactSnapshotV1 {
  const root = realpathSync(fixtureRoot);
  if (isAbsolute(relativePath)) throw new Error("artifact must be a file inside fixture root");
  const unresolved = resolve(root, relativePath);
  if (!isInside(root, unresolved)) throw new Error("artifact must be a file inside fixture root");
  const candidate = realpathSync(unresolved);
  if (!isInside(root, candidate)) throw new Error("artifact must be a file inside fixture root");
  const noFollow = "O_NOFOLLOW" in constants ? constants.O_NOFOLLOW : 0;
  const descriptor = openSync(candidate, constants.O_RDONLY | noFollow);
  try {
    const stats = fstatSync(descriptor);
    if (!stats.isFile()) throw new Error("artifact must be a regular file inside fixture root");
    if (stats.size > MAX_ARTIFACT_BYTES) throw new Error(`artifact exceeds ${MAX_ARTIFACT_BYTES} bytes`);
    const content = readFileSync(descriptor);
    if (content.byteLength > MAX_ARTIFACT_BYTES) throw new Error(`artifact exceeds ${MAX_ARTIFACT_BYTES} bytes`);
    return Object.freeze({
      relativePath,
      contentBase64: content.toString("base64"),
      digest: `sha256:${createHash("sha256").update(content).digest("hex")}`,
      bytes: content.byteLength,
    });
  } finally {
    closeSync(descriptor);
  }
}

export function proveArtifactFile(input: ArtifactProofInput): ArtifactProofV1 {
  assertCapabilityPreflight(input.run, input.preflight);
  if (input.preflight.status === "unsupported") throw new Error("cannot prove artifacts for an unsupported run");
  const expected = getScenarioCase(input.scenario, input.caseId).expected.artifacts?.[input.artifactId];
  if (!expected) throw new Error(`artifact is not declared by scenario: ${input.artifactId}`);
  if (input.verifier.criterionId !== expected.evidenceId) {
    throw new Error(`artifact verifier does not match expected evidence: ${expected.evidenceId}`);
  }
  const snapshot = snapshotFile(input.fixtureRoot, input.relativePath);
  const attestation = evaluateEvidence({
    run: input.run,
    preflight: input.preflight,
    vocabulary: input.vocabulary,
    verifier: input.verifier,
    subject: { kind: "artifact", id: input.artifactId, digest: snapshot.digest },
    input: snapshot,
  });
  const proof = {
    id: input.artifactId,
    kind: expected.kind,
    digest: snapshot.digest,
    bytes: snapshot.bytes,
    attestation,
  } as Omit<ArtifactProofV1, keyof RunBoundV1>;
  Object.defineProperty(proof, artifactProofBrand, { value: true });
  return bindRunContext(input.run, proof) as ArtifactProofV1;
}

export function isArtifactProof(value: unknown): value is ArtifactProofV1 {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.isFrozen(value) &&
    Object.prototype.hasOwnProperty.call(value, artifactProofBrand)
  );
}
