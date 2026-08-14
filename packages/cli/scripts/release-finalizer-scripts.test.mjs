import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { createCandidate, heldState, SHA } from "./release-privileged-fixtures.mjs";
import { assertNoLeak, execute, finalizeRun, mutationKinds } from "./release-privileged-harness.mjs";
import { repoRoot, withScratch } from "./release-test-helpers.mjs";

const runFinalizer = (mutate = () => {}, overrides = {}) => withScratch("vc-finalize-", (dir) => {
  const candidate = createCandidate(dir), state = heldState(candidate); mutate(state, candidate);
  return execute(dir, finalizeRun, state, candidate, overrides);
});

test("finalizer completes every preflight before one typed PATCH and validates post-state", () => {
  const run = runFinalizer();
  assert.equal(run.result.status, 0, run.result.stderr); assert.deepEqual(mutationKinds(run), ["patch-release"]);
  const patchIndex = run.state.requests.findIndex((entry) => entry.method === "PATCH");
  assert.ok(patchIndex > 0); assert.deepEqual(run.state.requests[patchIndex].body, { draft: false, make_latest: "true" });
  const beforePatch = run.state.requests.slice(0, patchIndex);
  assert.ok(beforePatch.some((entry) => entry.path?.endsWith("/immutable-releases")));
  assert.ok(beforePatch.some((entry) => entry.path?.includes("/actions/artifacts/7/zip")));
  assert.ok(beforePatch.some((entry) => entry.path?.includes("/contents/.github/workflows/finalize-release.yml")));
  assert.equal(beforePatch.filter((entry) => entry.path?.includes("/releases/assets/")).length, 9);
  const afterPatch = run.state.requests.slice(patchIndex + 1);
  assert.ok(afterPatch.some((entry) => entry.path?.endsWith("/releases/latest")));
  assert.ok(afterPatch.some((entry) => entry.path?.includes("/git/ref/tags/")));
  assert.equal(afterPatch.filter((entry) => entry.path?.includes("/releases/assets/")).length, 9);
  const value = JSON.parse(run.output.match(/^finalization_attestation=(.+)$/m)[1]);
  const schema = JSON.parse(readFileSync(join(repoRoot, ".github/release/finalization-attestation.schema.json")));
  const ajv = new Ajv2020({ strict: false }); addFormats(ajv);
  assert.equal(ajv.compile(schema)(value), true);
  assert.match(run.summary, /Finalization attestation: `\{"schemaVersion":1/);
  assertNoLeak(assert, run);
});

for (const [name, mutate, overrides] of [
  ["immutable releases disabled", (state) => { state.immutable.enabled = false; }],
  ["candidate run incomplete", (state) => { state.run.status = "in_progress"; state.run.conclusion = null; }],
  ["artifact digest drift", (state) => { state.artifact.digest = `sha256:${"0".repeat(64)}`; }],
  ["lightweight tag", (state) => { state.tagRef.object.type = "commit"; }],
  ["tag target drift", (state) => { state.tagObject.object.sha = "d".repeat(40); }],
  ["candidate envelope drift", (state) => { state.tagObject.message = state.tagObject.message.replace('"artifactId":"7"', '"artifactId":"8"'); }],
  ["rejected envelope drift", (state) => { const envelope = JSON.parse(state.tagObject.message.split("\n").slice(1).join("\n")); envelope.rejectedArtifacts = [{ artifactId: "8", artifactName: "moving", artifactDigest: `sha256:${"f".repeat(64)}`, runId: "98", runAttempt: "1" }]; state.tagObject.message = `vcskill-candidate-envelope-v1\n${JSON.stringify(envelope)}`; }],
  ["source digest drift", (state) => { state.sources.workflow = Buffer.from("wrong").toString("base64"); }],
  ["published draft", (state) => { state.release.draft = false; }],
  ["release ID drift", (state) => { state.release.id = 12; }],
  ["already latest", (state) => { state.latest = { id: 11, tag_name: "vcskill@1.2.3" }; }],
  ["remote asset count drift", (state) => { state.release.assets.pop(); }],
  ["remote asset drift", (state) => { state.assetBytes["1"] = Buffer.from("wrong").toString("base64"); }],
  ["wrong workflow ref", () => {}, { EXACT_WORKFLOW_SHA: "e".repeat(40) }],
  ["wrong dispatch ref", () => {}, { DISPATCH_REF: "refs/heads/main", DISPATCH_REF_TYPE: "branch" }],
]) test(`finalizer ${name} fails with zero PATCH`, () => {
  const run = runFinalizer(mutate, overrides);
  assert.notEqual(run.result.status, 0); assert.deepEqual(mutationKinds(run), []); assertNoLeak(assert, run);
});

test("finalizer sends binary reads with explicit read-only Accept headers", () => {
  const run = runFinalizer();
  const binaryReads = run.state.requests.filter((entry) => entry.path?.includes("/releases/assets/") || entry.path?.includes("/contents/"));
  assert.ok(binaryReads.every((entry) => entry.method === "GET" && entry.accept?.startsWith("Accept: ")));
  assert.equal(run.state.requests.filter((entry) => entry.method === "PATCH").length, 1);
  assert.equal(run.state.release.target_commitish, SHA);
});
