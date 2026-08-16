import assert from "node:assert/strict";
import test from "node:test";
import { createCandidate, baseState, heldState, SHA, TAG } from "./release-privileged-fixtures.mjs";
import { assertNoLeak, execute, mutationKinds, publishRun } from "./release-privileged-harness.mjs";
import { withScratch } from "./release-test-helpers.mjs";

const runPublisher = (mutate = () => {}, overrides = {}) => withScratch("av-publish-", (dir) => {
  const candidate = createCandidate(dir), state = baseState(candidate); mutate(state, candidate);
  state.run.status = "in_progress"; state.run.conclusion = null;
  return execute(dir, publishRun, state, candidate, overrides);
});

test("publisher FRESH creates durable annotated state then uploads once without clobber", () => {
  const run = runPublisher((state) => { state.artifactHistory = [{ id: 6, name: `ariadnev-candidate-${SHA}-run-98-attempt-1`, digest: `sha256:${"f".repeat(64)}`, expired: false, workflow_run: { head_sha: SHA } }]; });
  assert.equal(run.result.status, 0, run.result.stderr);
  assert.deepEqual(mutationKinds(run), ["create-tag-object", "create-tag-ref", "create-release", "release-upload"]);
  assert.match(run.output, /^mode=FRESH$/m);
  assert.match(run.state.tagObject.message, /^ariadnev-candidate-envelope-v1\n/);
  const envelope = JSON.parse(run.state.tagObject.message.split("\n").slice(1).join("\n"));
  assert.deepEqual(envelope.rejectedArtifacts, [{ artifactId: "6", artifactName: `ariadnev-candidate-${SHA}-run-98-attempt-1`, artifactDigest: `sha256:${"f".repeat(64)}`, runId: "98", runAttempt: "1" }]);
  const upload = run.state.requests.find((entry) => entry.command === "release");
  assert.ok(upload); assert.ok(!upload.args.includes("--clobber"));
  assert.deepEqual(run.state.release.assets.map((asset) => asset.name).sort(), createCandidateNames());
  const posts = run.state.requests.filter((entry) => entry.method === "POST");
  assert.deepEqual(posts.map((entry) => entry.body), [
    { tag: "ariadnev@1.2.3", message: run.state.tagObject.message, object: SHA, type: "commit" },
    { ref: "refs/tags/ariadnev@1.2.3", sha: "c".repeat(40) },
    { tag_name: "ariadnev@1.2.3", target_commitish: SHA, name: "ariadnev@1.2.3", body: "Held draft release; candidate envelope is bound in the annotated tag.", draft: true, make_latest: "false" },
  ]);
  assertNoLeak(assert, run);
});

test("publisher EXACT-NOOP validates all remote assets and makes zero mutations", () => withScratch("av-publish-", (dir) => {
  const candidate = createCandidate(dir), state = heldState(candidate); state.run.status = "in_progress"; state.run.conclusion = null;
  const run = execute(dir, publishRun, state, candidate);
  assert.equal(run.result.status, 0, run.result.stderr); assert.deepEqual(mutationKinds(run), []);
  assert.match(run.output, /^mode=EXACT-NOOP$/m);
  const downloads = run.state.requests.filter((entry) => entry.path?.includes("/releases/assets/"));
  assert.equal(downloads.length, 9); assert.ok(downloads.every((entry) => entry.accept === "Accept: application/octet-stream"));
  assertNoLeak(assert, run);
}));

for (const [name, mutate] of [
  ["tag-only conflict", (state) => { state.tagRef = { object: { type: "tag", sha: "c".repeat(40) } }; }],
  ["release-only conflict", (state) => { state.release = { id: 11, draft: true, tag_name: TAG, assets: [] }; }],
  ["lightweight tag conflict", (state) => { state.tagRef = { object: { type: "commit", sha: SHA } }; state.release = { id: 11, draft: true, tag_name: TAG, assets: [] }; }],
  ["published release conflict", (state, candidate) => { Object.assign(state, heldState(candidate)); state.release.draft = false; }],
  ["asset count conflict", (state, candidate) => { Object.assign(state, heldState(candidate)); state.release.assets.pop(); }],
  ["asset digest conflict", (state, candidate) => { Object.assign(state, heldState(candidate)); state.assetBytes["1"] = Buffer.from("wrong").toString("base64"); }],
]) test(`publisher ${name} fails preflight with zero mutations`, () => {
  const run = runPublisher(mutate);
  assert.notEqual(run.result.status, 0); assert.deepEqual(mutationKinds(run), []); assertNoLeak(assert, run);
});

function createCandidateNames() {
  return ["checksums.txt", "docs-bundle-manifest-v1.schema.json", "docs-bundle.manifest.json", "docs-bundle.tar.gz",
    "ariadnev-darwin-arm64", "ariadnev-darwin-x64", "ariadnev-linux-arm64", "ariadnev-linux-x64", "ariadnev-windows-x64.exe"].sort();
}
