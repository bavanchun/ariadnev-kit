// Decides whether the pushed commit should cut a release, and pins the exact
// source facts every downstream job reads.
//
// The invariant is "the current version has no tag yet". The previous shape
// compared the tip's version against its parent's, which silently cannot fire
// when the bump landed several commits earlier and sat unreleased — the state
// this repository was actually in. Tag-absence also refuses a second cut of the
// same version, which the version-diff shape never did.
//
// Extracted from the workflow so the invariant is testable. Shell inside YAML is
// not.

import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CURRENT_RELEASE_TAG } from "./release-tag-grammar.mjs";

/** Whether this version should be released, and why — the reason is logged. */
export function releaseDecision({ version, tags }) {
  if (!version) return { release: false, reason: "version could not be read from packages/cli/package.json" };
  const tag = `ariadnev@${version}`;
  if (!CURRENT_RELEASE_TAG.test(tag)) return { release: false, reason: `version ${version} is not a release version` };
  if (tags.includes(tag)) return { release: false, reason: `${tag} already exists — this version was released` };
  return { release: true, reason: `${tag} has no tag yet` };
}

/** Every output the candidate-build and candidate-publish jobs consume. */
export function releaseOutputs({ version, tags, sha, generatedAt, sourceDateEpoch, runId, runAttempt }) {
  return {
    release: String(releaseDecision({ version, tags }).release),
    version: version ?? "",
    source_sha: sha,
    generated_at: generatedAt,
    source_date_epoch: sourceDateEpoch,
    candidate_artifact_name: `ariadnev-candidate-${sha}-run-${runId}-attempt-${runAttempt}`,
  };
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const sha = process.env.SHA;
  if (!/^[a-f0-9]{40}$/.test(sha ?? "")) throw new Error("SHA must be a full lowercase commit SHA");

  let version = "";
  try {
    version = JSON.parse(git(["show", `${sha}:packages/cli/package.json`])).version ?? "";
  } catch {
    version = "";
  }

  const tags = git(["tag", "--list", "ariadnev@*"]).split("\n").filter(Boolean);
  const decision = releaseDecision({ version, tags });
  const outputs = releaseOutputs({
    version,
    tags,
    sha,
    generatedAt: git(["show", "-s", "--format=%cI", sha]),
    sourceDateEpoch: git(["show", "-s", "--format=%ct", sha]),
    runId: process.env.GITHUB_RUN_ID,
    runAttempt: process.env.GITHUB_RUN_ATTEMPT,
  });

  process.stdout.write(`release: ${decision.release} — ${decision.reason}\n`);
  appendFileSync(process.env.GITHUB_OUTPUT, `${Object.entries(outputs).map(([k, v]) => `${k}=${v}`).join("\n")}\n`);
}
