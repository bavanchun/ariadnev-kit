import assert from "node:assert/strict";
import test from "node:test";
import { releaseDecision, releaseOutputs } from "./detect-release-source.mjs";

// The invariant is "the current version has no tag yet", not "the version just
// changed". The old shape compared the tip against its parent, which cannot fire
// when the version was bumped several commits earlier and sat unreleased — the
// exact state this repository was in, where 1.0.0 had been in package.json for
// nineteen commits and no push could ever have produced a release.
test("releases a version that has never been tagged", () => {
  const decision = releaseDecision({ version: "1.0.0", tags: ["vcskill@0.12.0"] }); // brand-drift-allow: the real pre-rename tag in this repository
  assert.equal(decision.release, true);
  assert.match(decision.reason, /no tag/i);
});

test("refuses a version that is already tagged, however it was reached", () => {
  // This is what stops a second push from cutting the same release twice — the
  // property the version-diff shape did not have.
  const decision = releaseDecision({ version: "1.0.0", tags: ["vcskill@0.12.0", "ariadnev@1.0.0"] }); // brand-drift-allow: the real pre-rename tag in this repository
  assert.equal(decision.release, false);
  assert.match(decision.reason, /already/i);
});

test("fails closed when the version cannot be read", () => {
  for (const version of ["", null, undefined]) {
    const decision = releaseDecision({ version, tags: [] });
    assert.equal(decision.release, false, String(version));
  }
});

test("matches the tag exactly — a prefix or suffix is a different release", () => {
  const tags = ["ariadnev@1.0.01", "ariadnev@11.0.0", "xariadnev@1.0.0"];
  assert.equal(releaseDecision({ version: "1.0.0", tags }).release, true);
});

test("a pre-rename tag at the same version does not count as released", () => {
  // Tag grammar for what this project *produces* is the current name only, so a
  // vcskill@1.0.0 tag would not mean ariadnev@1.0.0 was ever cut. brand-drift-allow: names the pre-rename grammar
  const decision = releaseDecision({ version: "1.0.0", tags: ["vcskill@1.0.0"] }); // brand-drift-allow: the pre-rename grammar, deliberately not a match
  assert.equal(decision.release, true);
});

test("emits every output the downstream jobs read", () => {
  const outputs = releaseOutputs({
    version: "1.0.0",
    tags: [],
    sha: "a".repeat(40),
    generatedAt: "2026-08-16T00:00:00+07:00",
    sourceDateEpoch: "1786838400",
    runId: "42",
    runAttempt: "1",
  });
  assert.deepEqual(Object.keys(outputs).sort(), [
    "candidate_artifact_name", "generated_at", "release", "source_date_epoch", "source_sha", "version",
  ]);
  assert.equal(outputs.release, "true");
  assert.equal(outputs.version, "1.0.0");
  assert.equal(outputs.source_sha, "a".repeat(40));
  assert.equal(outputs.candidate_artifact_name, `ariadnev-candidate-${"a".repeat(40)}-run-42-attempt-1`);
});

test("renders as GITHUB_OUTPUT lines with no stray newlines", () => {
  const outputs = releaseOutputs({
    version: "1.0.0", tags: ["ariadnev@1.0.0"], sha: "b".repeat(40),
    generatedAt: "2026-08-16T00:00:00+07:00", sourceDateEpoch: "1786838400",
    runId: "42", runAttempt: "1",
  });
  for (const [key, value] of Object.entries(outputs)) {
    assert.doesNotMatch(String(value), /[\n\r]/, key);
  }
  assert.equal(outputs.release, "false");
});
