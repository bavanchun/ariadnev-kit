import assert from "node:assert/strict";
import test from "node:test";
import { extractRun, listRunBlocks, listUses, loadJobs, loadWorkflow, readWorkflow } from "./release-test-helpers.mjs";

const release = "release.yml";
const build = "release-candidate-build.yml";
const publish = "release-candidate-publish.yml";
const finalize = "finalize-release.yml";
const fullSha = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+@[a-f0-9]{40}$/;

test("release orchestration preserves the required DAG and one upload boundary", () => {
  const jobs = loadJobs(release);
  assert.deepEqual(Object.keys(jobs), ["version-pr", "candidate-build", "candidate-publish"]);
  assert.equal(jobs["candidate-build"].uses, "./.github/workflows/release-candidate-build.yml");
  assert.deepEqual(jobs["candidate-build"].needs, ["version-pr"]);
  assert.equal(jobs["candidate-publish"].uses, "./.github/workflows/release-candidate-publish.yml");
  assert.deepEqual(jobs["candidate-publish"].needs, ["version-pr", "candidate-build"]);
  assert.equal(jobs["candidate-publish"].with.candidate_artifact_id, "${{ needs.candidate-build.outputs.candidate_artifact_id }}");
  assert.equal(jobs["candidate-publish"].with.candidate_artifact_digest, "${{ needs.candidate-build.outputs.candidate_artifact_digest }}");
  const uploads = [release, build, publish, finalize].flatMap(listUses).filter((entry) => entry.startsWith("actions/upload-artifact@"));
  assert.equal(uploads.length, 1);
});

test("the release trigger is decided by the extracted script, not by shell in YAML", () => {
  // The invariant it enforces ("this version has no tag yet") is only testable
  // because it lives in a script. Inline shell was how the previous shape —
  // "the version changed since the parent commit" — went unexercised until it
  // silently refused to fire.
  const step = loadJobs(release)["version-pr"].steps.find((entry) => entry.name === "Detect exact release source");
  assert.equal(step.run.trim(), "node packages/cli/scripts/detect-release-source.mjs");
  assert.deepEqual(Object.keys(step.env).sort(), ["GITHUB_RUN_ATTEMPT", "GITHUB_RUN_ID", "SHA"]);
  assert.doesNotMatch(step.run, /\$\{\{/);
});

test("workflow permissions and dispatch inputs are literal and minimal", () => {
  const releaseData = loadWorkflow(release);
  const releaseJobs = loadJobs(release);
  const buildJobs = loadJobs(build);
  const publishJobs = loadJobs(publish);
  const finalizeData = loadWorkflow(finalize);
  assert.deepEqual(releaseData.permissions, {});
  assert.deepEqual(releaseJobs["version-pr"].permissions, { contents: "write", "pull-requests": "write" });
  assert.deepEqual(releaseJobs["candidate-build"].permissions, { contents: "read" });
  assert.deepEqual(releaseJobs["candidate-publish"].permissions, { contents: "write", actions: "read" });
  assert.deepEqual(buildJobs.build.permissions, { contents: "read" });
  assert.deepEqual(publishJobs.publish.permissions, { contents: "write", actions: "read" });
  assert.deepEqual(finalizeData.jobs.finalize.permissions, { contents: "write", actions: "read" });
  // No deployment environment: it is a paid feature on a private repository, so
  // declaring one made finalize unschedulable. Serialization per tag is what
  // carries the weight, and that lives in the concurrency group.
  assert.equal(finalizeData.jobs.finalize.environment, undefined);
  assert.equal(finalizeData.concurrency.group, "core-release-production-${{ inputs.tag }}");
  assert.equal(finalizeData.concurrency["cancel-in-progress"], false);
  const versionStep = loadJobs(release)["version-pr"].steps.find((step) => step.name === "Changesets version PR");
  assert.equal(versionStep.with.commitMode, "github-api");
  const dispatch = finalizeData.on.workflow_dispatch.inputs;
  assert.deepEqual(Object.keys(dispatch), [
    "release_id",
    "tag",
    "source_sha",
    "candidate_run_id",
    "candidate_run_attempt",
    "candidate_artifact_id",
    "candidate_artifact_name",
    "candidate_artifact_digest",
  ]);
});

test("all workflow actions are pinned to full SHAs and checkout disables persisted credentials", () => {
  for (const file of [release, build, publish, finalize]) {
    for (const value of listUses(file)) assert.match(value, fullSha);
  }
  const buildYaml = readWorkflow(build);
  assert.match(buildYaml, /persist-credentials:\s+false/);
  assert.doesNotMatch(readWorkflow(publish), /actions\/checkout@/);
  assert.doesNotMatch(readWorkflow(finalize), /actions\/checkout@/);
});

test("the privileged gh helper can hold a whole candidate artifact", () => {
  // spawnSync defaults to a 1MB buffer and the candidate zip is ~192MB, so every
  // binary download failed as an opaque "GitHub API request failed". Both blocks
  // download it, so both need the bound, and it is the same ceiling they assert
  // on candidate contents.
  for (const file of [publish, finalize]) {
    const helper = readWorkflow(file).split("\n").find((line) => line.includes("spawnSync(\"gh\""));
    assert.ok(helper, `${file} has no gh helper`);
    assert.match(helper, /maxBuffer:\s*536870912/, file);
  }
});

test("privileged publisher and finalizer run blocks contain no expression interpolation", () => {
  for (const file of [publish, finalize]) {
    for (const step of listRunBlocks(file)) {
      assert.doesNotMatch(step.run, /\$\{\{/);
    }
  }
});

test("publisher and finalizer call only extracted privileged scripts and known safe tooling", () => {
  const buildJob = loadJobs(build).build;
  const buildSteps = buildJob.steps.map((step) => step.name);
  assert.deepEqual(buildSteps.slice(-5), [
    "Build release assets",
    "Smoke the built binaries",
    "Create inner provenance A",
    "Stage flat candidate inventory",
    "Upload exact candidate artifact",
  ]);
  assert.match(extractRun(publish, "Publish held draft from exact candidate"), /node <<'NODE'/);
  assert.match(extractRun(finalize, "Finalize held draft release"), /node <<'NODE'/);
  assert.equal((extractRun(finalize, "Finalize held draft release").match(/method:\s*"PATCH"/g) ?? []).length, 1);
  assert.doesNotMatch(readWorkflow(publish), /pnpm install|actions\/setup-node|npm install/);
  assert.doesNotMatch(readWorkflow(finalize), /pnpm install|actions\/setup-node|npm install/);
});

test("the previous stable source is locked before build, and one flat artifact is retained", () => {
  const steps = loadJobs(build).build.steps;
  const names = steps.map((step) => step.name);
  assert.ok(names.indexOf("Resolve immediate previous stable") < names.indexOf("Checkout previous stable exact commit"));
  assert.ok(names.indexOf("Checkout previous stable exact commit") < names.indexOf("Lock previous stable source tree"));
  assert.ok(names.indexOf("Lock previous stable source tree") < names.indexOf("Build release assets"));
  // Smoke before the attestation: provenance should only ever be created for an
  // artifact set that was actually run.
  assert.ok(names.indexOf("Build release assets") < names.indexOf("Smoke the built binaries"));
  assert.ok(names.indexOf("Smoke the built binaries") < names.indexOf("Create inner provenance A"));
  assert.ok(names.indexOf("Create inner provenance A") < names.indexOf("Stage flat candidate inventory"));
  const upload = steps.find((step) => step.name === "Upload exact candidate artifact");
  assert.equal(upload.with.path, "packages/cli/dist/candidate-upload/*");
  assert.equal(upload.with.overwrite, false);
  assert.equal(upload.with["retention-days"], 90);
  const previousCheckout = steps.find((step) => step.name === "Checkout previous stable exact commit");
  assert.equal(previousCheckout.with.ref, "${{ steps.previous.outputs.release_tag }}");
  const previousLock = steps.find((step) => step.name === "Lock previous stable source tree");
  const previousLockEnv = previousLock["env"];
  assert.equal(previousLockEnv.PREVIOUS_SOURCE_TAG, "${{ steps.previous.outputs.release_tag }}");
  assert.equal(previousLockEnv.PREVIOUS_SOURCE_SHA, "${{ steps.previous.outputs.source_sha }}");
  assert.match(previousLock.run, /rev-parse \"\$\{PREVIOUS_SOURCE_TAG\}\^\{commit\}\"/);
  assert.match(extractRun(build, "Build release assets"), /--previous-source-tree[\s\S]*--previous-source-tag[\s\S]*--previous-source-sha/);
});

test("privileged steps authenticate only through env and bind durable handoff evidence", () => {
  for (const [file, jobName, stepName] of [
    [publish, "publish", "Publish held draft from exact candidate"],
    [finalize, "finalize", "Finalize held draft release"],
  ]) {
    const step = loadJobs(file)[jobName].steps.find((entry) => entry.name === stepName);
    assert.equal(step["env"]["GH_TOKEN"], "${{ github.token }}");
    assert.doesNotMatch(step.run, /GH_TOKEN|github\.token|--clobber/);
  }
  assert.match(extractRun(publish, "Publish held draft from exact candidate"), /ariadnev-candidate-envelope-v1/);
  const finalizerStep = loadJobs(finalize).finalize.steps.find((entry) => entry.name === "Finalize held draft release");
  assert.equal(finalizerStep["env"].EXACT_WORKFLOW_SHA, "${{ github.workflow_sha }}");
  assert.equal(finalizerStep["env"].DISPATCH_REF, "${{ github.ref }}");
  assert.equal(finalizerStep["env"].DISPATCH_REF_TYPE, "${{ github.ref_type }}");
  assert.match(finalizerStep.run, /finalization_attestation=/);
  for (const file of [publish, finalize]) assert.match(extractRun(file, file === publish ? "Publish held draft from exact candidate" : "Finalize held draft release"), /sizes\.length === listing\.length/);
  assert.equal(loadWorkflow(publish).on.workflow_call.outputs.candidate_envelope.value, "${{ jobs.publish.outputs.candidate_envelope }}");
});
