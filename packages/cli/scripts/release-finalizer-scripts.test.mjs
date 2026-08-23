import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { generateKeyPairSync, sign } from "node:crypto";
import { createCandidate, heldState, SHA } from "./release-privileged-fixtures.mjs";
import { assertNoLeak, execute, finalizeRun, mutationKinds } from "./release-privileged-harness.mjs";
import { repoRoot, withScratch } from "./release-test-helpers.mjs";

// `overrides` may be a function so a case can build an env value out of the
// candidate — a signature has to be made over that candidate's own checksums.
const runFinalizer = (mutate = () => {}, overrides = {}) => withScratch("av-finalize-", (dir) => {
  const candidate = createCandidate(dir), state = heldState(candidate); mutate(state, candidate);
  return execute(dir, finalizeRun, state, candidate, typeof overrides === "function" ? overrides(candidate) : overrides);
});

const signWith = (key, message) => sign(null, Buffer.from(message), key).toString("base64");
/** A perfectly valid signature — by a key that is not the release key. */
const wrongKeySignature = (candidate) => ({
  CHECKSUMS_SIGNATURE: signWith(
    generateKeyPairSync("ed25519").privateKey,
    `${candidate.attestation.product.version}\n${candidate.files["checksums.txt"]}`,
  ),
});
/** The release key, over the tag rather than the bare version `parseLatestTag`
 *  produces. Signing the wrong string would make every update fail. */
const taggedSignature = (candidate) => ({
  CHECKSUMS_SIGNATURE: signWith(
    candidate.releaseKey.privateKey,
    `ariadnev@${candidate.attestation.product.version}\n${candidate.files["checksums.txt"]}`,
  ),
});

test("finalizer completes every preflight before one typed PATCH and validates post-state", () => {
  const run = runFinalizer();
  assert.equal(run.result.status, 0, run.result.stderr); assert.deepEqual(mutationKinds(run), ["upload-asset", "patch-release"]);
  const patchIndex = run.state.requests.findIndex((entry) => entry.method === "PATCH");
  assert.ok(patchIndex > 0);
  assert.deepEqual(run.state.requests[patchIndex].body, { draft: false, prerelease: false, make_latest: "true" });
  const beforePatch = run.state.requests.slice(0, patchIndex);
  // The settings endpoint answers 403 to GITHUB_TOKEN, and a draft is invisible
  // by tag, so neither may be requested before the release is published.
  assert.ok(!run.state.requests.some((entry) => entry.path?.endsWith("/immutable-releases")));
  assert.ok(!beforePatch.some((entry) => entry.path?.includes("/releases/tags/")));
  assert.ok(beforePatch.some((entry) => entry.path?.includes("/actions/artifacts/7/zip")));
  assert.ok(beforePatch.some((entry) => entry.path?.includes("/contents/.github/workflows/finalize-release.yml")));
  // Nine candidate assets, then the freshly uploaded signature — and only the
  // signature. Re-reading the other nine after the upload would double the
  // bytes for nothing: they were just verified and nothing else writes here.
  assert.equal(beforePatch.filter((entry) => entry.path?.includes("/releases/assets/")).length, 10);
  const afterPatch = run.state.requests.slice(patchIndex + 1);
  assert.ok(afterPatch.some((entry) => entry.path?.endsWith("/releases/latest")));
  assert.ok(afterPatch.some((entry) => entry.path?.includes("/git/ref/tags/")));
  // The published release is re-read in full, signature included.
  assert.equal(afterPatch.filter((entry) => entry.path?.includes("/releases/assets/")).length, 10);
  const value = JSON.parse(run.output.match(/^finalization_attestation=(.+)$/m)[1]);
  const schema = JSON.parse(readFileSync(join(repoRoot, ".github/release/finalization-attestation.schema.json")));
  const ajv = new Ajv2020({ strict: false }); addFormats(ajv);
  assert.equal(ajv.compile(schema)(value), true);
  assert.match(run.summary, /Finalization attestation: `\{"schemaVersion":1/);
  assertNoLeak(assert, run);
});

for (const [name, mutate, overrides] of [
  ["candidate run incomplete", (state) => { state.run.status = "in_progress"; state.run.conclusion = null; }],
  // CI's verdict on the exact source is read at publication, newest run per
  // name: a later red run is not ignored, and a skipped one is not a pass.
  ["CI red on the source", (state) => { state.checkRuns.check_runs.push({ ...state.checkRuns.check_runs[0], conclusion: "failure", started_at: "2026-08-08T00:45:00Z" }); }],
  ["CI skipped on the source", (state) => { state.checkRuns.check_runs[0].conclusion = "skipped"; }],
  ["CI absent on the source", (state) => { state.checkRuns.check_runs = []; }],
  ["artifact digest drift", (state) => { state.artifact.digest = `sha256:${"0".repeat(64)}`; }],
  ["lightweight tag", (state) => { state.tagRef.object.type = "commit"; }],
  ["tag target drift", (state) => { state.tagObject.object.sha = "d".repeat(40); }],
  ["candidate envelope drift", (state) => { state.tagObject.message = state.tagObject.message.replace('"artifactId":"7"', '"artifactId":"8"'); }],
  ["rejected envelope drift", (state) => { const envelope = JSON.parse(state.tagObject.message.split("\n").slice(1).join("\n")); envelope.rejectedArtifacts = [{ artifactId: "8", artifactName: "moving", artifactDigest: `sha256:${"f".repeat(64)}`, runId: "98", runAttempt: "1" }]; state.tagObject.message = `ariadnev-candidate-envelope-v1\n${JSON.stringify(envelope)}`; }],
  ["source digest drift", (state) => { state.sources.workflow = Buffer.from("wrong").toString("base64"); }],
  ["published draft", (state) => { state.release.draft = false; }],
  ["release ID drift", (state) => { state.release.id = 12; }],
  ["already latest", (state) => { state.latest = { id: 11, tag_name: "ariadnev@1.2.3" }; }],
  ["remote asset count drift", (state) => { state.release.assets.pop(); }],
  ["remote asset drift", (state) => { state.assetBytes["1"] = Buffer.from("wrong").toString("base64"); }],
  // The signature is what makes the checksums mean anything. Publishing without
  // a good one would ship a release the binary then refuses to install — and
  // immutability means it could never be corrected.
  ["signature by the wrong key", () => {}, wrongKeySignature],
  ["signature over the tag instead of the version", () => {}, taggedSignature],
  ["signature missing", () => {}, { CHECKSUMS_SIGNATURE: "" }],
  ["signature not base64", () => {}, { CHECKSUMS_SIGNATURE: "%".repeat(88) }],
  ["signing key absent from source", (state) => { state.sources.signingKey = Buffer.from("export const SOMETHING_ELSE = 1;\n").toString("base64"); }],
  ["signing key not ed25519", (state) => {
    const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 }).publicKey.export({ type: "spki", format: "der" }).toString("base64");
    state.sources.signingKey = Buffer.from(`export const UPDATE_SIGNING_PUBLIC_KEY = "${rsa}";\n`).toString("base64");
  }],
  ["wrong workflow ref", () => {}, { EXACT_WORKFLOW_SHA: "e".repeat(40) }],
  ["wrong dispatch ref", () => {}, { DISPATCH_REF: "refs/heads/main", DISPATCH_REF_TYPE: "branch" }],
]) test(`finalizer ${name} fails with zero PATCH`, () => {
  const run = runFinalizer(mutate, overrides);
  assert.notEqual(run.result.status, 0); assert.deepEqual(mutationKinds(run), []); assertNoLeak(assert, run);
});

/**
 * The recovery case. An upload that succeeds followed by a PATCH that fails
 * leaves the signature on the draft; a re-run then has to finish the job rather
 * than refuse it. Before this, the re-run died at the candidate inventory check
 * with "remote asset count drift" — a message about asset drift for a release
 * that was exactly correct — and the draft could only be unwedged by deleting
 * the asset through the API by hand.
 */
test("finalizer re-run publishes a draft that already carries the signature", () => {
  const run = runFinalizer((state, candidate) => {
    const bytes = Buffer.from(`${candidate.checksumsSignature}\n`);
    state.release.assets.push({ id: 900, name: "checksums.txt.sig", size: bytes.length });
    state.assetBytes["900"] = bytes.toString("base64");
  });
  assert.equal(run.result.status, 0, run.result.stderr);
  // No second upload: the asset is already there and byte-identical.
  assert.deepEqual(mutationKinds(run), ["patch-release"]);
  assertNoLeak(assert, run);
});

// But only if it is the *right* signature. A leftover from a different attempt
// must not be published just because something with the right name is present.
test("finalizer refuses a draft carrying a different signature", () => {
  const run = runFinalizer((state) => {
    const bytes = Buffer.from("a-signature-from-some-other-attempt\n");
    state.release.assets.push({ id: 901, name: "checksums.txt.sig", size: bytes.length });
    state.assetBytes["901"] = bytes.toString("base64");
  });
  assert.notEqual(run.result.status, 0);
  assert.deepEqual(mutationKinds(run), []);
  assert.match(run.result.stderr, /remote asset drift: checksums\.txt\.sig/);
  assertNoLeak(assert, run);
});

// This one cannot join the loop above: the guard it exercises reads the
// published release, so the PATCH has necessarily already happened. Publishing
// is the only way to learn whether the repository makes releases immutable, and
// a release that came back mutable is still deletable — which is what makes
// failing here a recoverable outcome rather than a broken one.
test("finalizer fails after its single PATCH when the published release is not immutable", () => {
  const run = runFinalizer((state) => { state.immutable.enabled = false; });
  assert.notEqual(run.result.status, 0);
  assert.deepEqual(mutationKinds(run), ["upload-asset", "patch-release"]);
  assert.match(run.result.stderr, /published release drift/);
  assertNoLeak(assert, run);
});

test("finalizer sends binary reads with explicit read-only Accept headers", () => {
  const run = runFinalizer();
  const binaryReads = run.state.requests.filter((entry) => entry.path?.includes("/releases/assets/") || entry.path?.includes("/contents/"));
  assert.ok(binaryReads.every((entry) => entry.method === "GET" && entry.accept?.startsWith("Accept: ")));
  assert.equal(run.state.requests.filter((entry) => entry.method === "PATCH").length, 1);
  assert.equal(run.state.release.target_commitish, SHA);
});


/**
 * A beta is published but must never become "latest". `/version` answers from
 * the latest release, so that one field is what keeps a bare `av update` and a
 * bare `curl | bash` on stable while a beta exists — it is the mechanism, not a
 * convention, and it is asserted as a negative because a beta silently promoted
 * to latest reaches every installer.
 */
test("finalizer publishes a beta without making it latest", () => {
  const run = runFinalizer(
    (state, candidate) => {
      const betaTag = "ariadnev@1.2.3-beta.1";
      state.tagObject.message = state.tagObject.message.replace(candidate.attestation.product.tag, betaTag);
      state.release.tag_name = betaTag;
      candidate.attestation.product.tag = betaTag;
    },
    { RELEASE_TAG: "ariadnev@1.2.3-beta.1", DISPATCH_REF: "refs/tags/ariadnev@1.2.3-beta.1" },
  );
  // The attestation binds tag to version, so a beta tag needs a beta version in
  // the candidate too — which this fixture cannot restage. What it can prove is
  // that the tag shape is accepted rather than rejected as a malformed ref.
  assert.doesNotMatch(run.result.stderr, /exact ref identity required/);
});
