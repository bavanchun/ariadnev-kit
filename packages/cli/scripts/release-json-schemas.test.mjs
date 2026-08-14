import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { candidateEnvelope, createCandidate, SHA, TAG } from "./release-privileged-fixtures.mjs";
import { repoRoot, withScratch } from "./release-test-helpers.mjs";

const schemaDirectory = join(repoRoot, ".github", "release");

function validator(name) {
  const ajv = new Ajv2020({ allErrors: true, strict: true, strictTuples: false });
  addFormats(ajv);
  return ajv.compile(JSON.parse(readFileSync(join(schemaDirectory, name), "utf8")));
}

test("every release handoff schema compiles in draft-2020 mode", () => {
  for (const name of [
    "candidate-envelope.schema.json",
    "finalization-attestation.schema.json",
    "release-artifact-attestation.schema.json",
    "web-consumer-lock.schema.json",
  ]) assert.doesNotThrow(() => validator(name), name);
});

test("candidate and inner provenance fixtures validate and malformed dates fail", () => withScratch("av-release-schema-", (dir) => {
  const candidate = createCandidate(dir);
  const validateEnvelope = validator("candidate-envelope.schema.json");
  assert.equal(validateEnvelope(candidateEnvelope(candidate)), true, JSON.stringify(validateEnvelope.errors));
  const invalid = { ...candidateEnvelope(candidate), expiresAt: "not-a-date" };
  assert.equal(validateEnvelope(invalid), false);
  const validateInner = validator("release-artifact-attestation.schema.json");
  assert.equal(validateInner(candidate.attestation), true, JSON.stringify(validateInner.errors));
}));

test("finalization attestation fixture validates", () => {
  const value = {
    schemaVersion: 1,
    schema: "https://ariadnev.com/schemas/finalization-attestation.schema.json",
    runId: "501",
    runAttempt: "1",
    repository: "octo/example",
    releaseId: "11",
    tag: TAG,
    sourceSha: SHA,
    candidateEnvelopeDigest: `sha256:${"a".repeat(64)}`,
    finalizerWorkflowDigest: `sha256:${"b".repeat(64)}`,
    releaseAssetSetDigest: `sha256:${"c".repeat(64)}`,
    verifiedReleaseUpdatedAt: "2026-08-09T01:00:00Z",
  };
  const validate = validator("finalization-attestation.schema.json");
  assert.equal(validate(value), true, JSON.stringify(validate.errors));
});
