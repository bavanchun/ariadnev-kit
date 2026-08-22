import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { extractRun, runScript, writeExecutable } from "./release-test-helpers.mjs";
import { ARTIFACT_ID, ARTIFACT_NAME, ATTEMPT, RUN_ID, SHA, TAG } from "./release-privileged-fixtures.mjs";
import { mockGhSource } from "./release-stateful-gh-mock.mjs";

export const publishRun = extractRun("release-candidate-publish.yml", "Publish held draft from exact candidate");
export const finalizeRun = extractRun("finalize-release.yml", "Finalize held draft release");
export const SECRET = "never-print-release-secret";

export function execute(dir, body, state, candidate, overrides = {}) {
  const bin = join(dir, "bin");
  mkdirSync(bin, { recursive: true });
  writeExecutable(bin, "gh", mockGhSource);
  const statePath = join(dir, "state.json"), output = join(dir, "github-output.txt"), summary = join(dir, "summary.txt");
  writeFileSync(statePath, JSON.stringify(state));
  writeFileSync(output, ""); writeFileSync(summary, "");
  const env = {
    PATH: `${bin}:${process.env.PATH}`, MOCK_GH_STATE: statePath, GH_TOKEN: SECRET,
    GITHUB_API_VERSION: "2026-03-10", GITHUB_REPOSITORY: "octo/example", GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: summary,
    SOURCE_SHA: SHA, RELEASE_TAG: TAG, RELEASE_ID: "11", CANDIDATE_RUN_ID: RUN_ID, CANDIDATE_RUN_ATTEMPT: ATTEMPT,
    CANDIDATE_ARTIFACT_ID: ARTIFACT_ID, CANDIDATE_ARTIFACT_NAME: ARTIFACT_NAME, CANDIDATE_ARTIFACT_DIGEST: candidate.zipDigest,
    CHECKSUMS_SIGNATURE: candidate.checksumsSignature,
    EXACT_WORKFLOW_SHA: SHA, DISPATCH_SHA: SHA, DISPATCH_REF: `refs/tags/${TAG}`, DISPATCH_REF_TYPE: "tag",
    FINALIZATION_RUN_ID: "501", FINALIZATION_RUN_ATTEMPT: "1", ...overrides,
  };
  const result = runScript(body, env, dir);
  return { result, state: JSON.parse(readFileSync(statePath, "utf8")), output: readFileSync(output, "utf8"), summary: readFileSync(summary, "utf8") };
}

export function mutationKinds(run) { return run.state.mutations.map((entry) => entry.kind); }
export function assertNoLeak(assert, run) {
  const text = `${run.result.stdout}${run.result.stderr}${JSON.stringify(run.state.requests)}${run.output}${run.summary}`;
  assert.doesNotMatch(text, new RegExp(SECRET));
}
