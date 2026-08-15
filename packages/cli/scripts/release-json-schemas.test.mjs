import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { candidateEnvelope, createCandidate, SHA, TAG } from "./release-privileged-fixtures.mjs";
import { repoRoot, withScratch } from "./release-test-helpers.mjs";
import { isStableReleaseTag, RELEASE_PRODUCT_NAMES } from "./release-tag-grammar.mjs";

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

test("a predecessor tag is accepted across the rename and refused beyond it", () => {
  // The only stable release this repository has ever cut is tagged with the old
  // product name. A contract that demands the new name for the *predecessor*
  // can never be satisfied until a release under the new name exists — which it
  // cannot, because cutting one requires this contract to validate first.
  // `resolve-previous-stable.mjs` and `build-binaries.mjs` both already read
  // across the rename; the lock was the one place that did not.
  const validate = validator("web-consumer-lock.schema.json");
  const [oldName, currentName] = RELEASE_PRODUCT_NAMES;
  const lockWith = (tag) => ({
    schemaVersion: 1,
    repository: "bavanchun/ariadnev-web",
    commitSha: "f".repeat(40),
    contractDigests: { "package.json": `sha256:${"a".repeat(64)}` },
    invocation: { cwd: "scripts", argv: ["pnpm", "verify"], reportPath: "report.json", outputs: [{ path: "report.json", kind: "file" }] },
    previousSource: { tag, descriptorPath: "package.json", descriptorDigest: `sha256:${"b".repeat(64)}` },
  });

  // The schema owns the shape…
  assert.equal(validate(lockWith(`${oldName}@0.12.0`)), true, JSON.stringify(validate.errors));
  assert.equal(validate(lockWith(`${currentName}@1.0.0`)), true, JSON.stringify(validate.errors));
  assert.equal(validate(lockWith(`${currentName}@1.0`)), false);
  assert.equal(validate(lockWith("v1.0.0")), false);

  // …and the grammar module owns which products have ever carried a release, so
  // a shape-valid tag naming something else is still refused.
  assert.equal(isStableReleaseTag(`${oldName}@0.12.0`), true);
  assert.equal(isStableReleaseTag(`${currentName}@1.0.0`), true);
  assert.equal(validate(lockWith("upstream@1.0.0")), true);
  assert.equal(isStableReleaseTag("upstream@1.0.0"), false);
  assert.equal(isStableReleaseTag(undefined), false);
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
