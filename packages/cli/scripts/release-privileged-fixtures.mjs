import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { zipSync } from "fflate";

export const SHA = "a".repeat(40);
export const TAG = "ariadnev@1.2.3";
export const RUN_ID = "99";
export const ATTEMPT = "2";
export const ARTIFACT_ID = "7";
export const ARTIFACT_NAME = `ariadnev-candidate-${SHA}-run-${RUN_ID}-attempt-${ATTEMPT}`;
export const ASSET_NAMES = [
  "checksums.txt", "docs-bundle-manifest-v1.schema.json", "docs-bundle.manifest.json",
  "docs-bundle.tar.gz", "ariadnev-darwin-arm64", "ariadnev-darwin-x64",
  "ariadnev-linux-arm64", "ariadnev-linux-x64", "ariadnev-windows-x64.exe",
];

export const digest = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

export function createCandidate(dir) {
  const files = Object.fromEntries(ASSET_NAMES.map((name) => [name, Buffer.from(`${name}\n`)]));
  files["checksums.txt"] = Buffer.from(ASSET_NAMES.filter((name) => name !== "checksums.txt")
    .map((name) => `${digest(files[name]).slice(7)}  ${name}`).join("\n") + "\n");
  const source = {
    workflow: Buffer.from("release workflow\n"), generator: Buffer.from("generator\n"),
    lock: Buffer.from("consumer lock\n"), finalizer: Buffer.from("finalizer workflow\n"),
  };
  const attestation = {
    schemaVersion: 1, schema: "https://ariadnev.com/schemas/release-artifact-attestation.schema.json",
    artifactName: ARTIFACT_NAME,
    workflow: { runId: RUN_ID, runAttempt: ATTEMPT, path: ".github/workflows/release.yml", ref: "octo/example/.github/workflows/release.yml@refs/heads/main", digest: digest(source.workflow), sha: SHA },
    product: { sha: SHA, version: "1.2.3", tag: TAG },
    generator: { path: "packages/cli/scripts/generate-docs-bundle.ts", digest: digest(source.generator), sha: SHA },
    consumer: {
      repository: "bavanchun/ariadnev-web", commitSha: "b".repeat(40), lockPath: ".github/release/web-consumer-lock.json",
      lockDigest: digest(source.lock), contractDigest: digest("contract"), contractDigests: { "contract.json": digest("contract") },
      invocationDigest: digest("invocation"), resultDigest: digest("result"), outputDigest: digest("output"),
      previousDescriptorPath: "previous.json", previousDescriptorDigest: digest("previous"),
    },
    releaseAssets: ASSET_NAMES.map((name) => ({ name, size: files[name].length, digest: digest(files[name]) })),
  };
  const entries = { ...Object.fromEntries(Object.entries(files).map(([name, bytes]) => [name, new Uint8Array(bytes)])),
    "release-artifact-attestation.json": new TextEncoder().encode(`${JSON.stringify(attestation)}\n`) };
  const zip = Buffer.from(zipSync(entries, { level: 0 }));
  const zipPath = join(dir, "candidate.zip");
  writeFileSync(zipPath, zip);
  return { attestation, files, source, zip, zipPath, zipDigest: digest(zip) };
}

export function candidateEnvelope(candidate) {
  return {
    schemaVersion: 1, schema: "https://ariadnev.com/schemas/candidate-envelope.schema.json", repository: "octo/example",
    runId: RUN_ID, runAttempt: ATTEMPT, artifactId: ARTIFACT_ID, artifactName: ARTIFACT_NAME,
    artifactDigest: candidate.zipDigest, artifactSize: candidate.zip.length,
    createdAt: "2026-08-08T00:00:00Z", expiresAt: "2099-09-07T00:00:00Z",
    workflowPath: ".github/workflows/release.yml", headSha: SHA, rejectedArtifacts: [],
  };
}

export function baseState(candidate) {
  const envelope = candidateEnvelope(candidate);
  return {
    requests: [], mutations: [], nextAssetId: 100, immutable: { enabled: true },
    run: { id: 99, path: ".github/workflows/release.yml", event: "push", head_sha: SHA, run_attempt: 2, status: "completed", conclusion: "success" },
    artifact: { id: 7, name: ARTIFACT_NAME, digest: candidate.zipDigest, size_in_bytes: candidate.zip.length, expired: false,
      created_at: envelope.createdAt, expires_at: envelope.expiresAt, workflow_run: { id: 99, head_sha: SHA } },
    artifactHistory: [], artifactZip: candidate.zip.toString("base64"), sources: Object.fromEntries(Object.entries(candidate.source).map(([key, value]) => [key, value.toString("base64")])),
    tagRef: null, tagObject: null, release: null, latest: { id: 10, tag_name: "ariadnev@1.2.2" }, assetBytes: {},
  };
}

export function heldState(candidate) {
  const state = baseState(candidate), envelope = candidateEnvelope(candidate);
  state.tagRef = { object: { type: "tag", sha: "c".repeat(40) } };
  state.tagObject = { sha: "c".repeat(40), object: { type: "commit", sha: SHA }, message: `ariadnev-candidate-envelope-v1\n${JSON.stringify(envelope)}` };
  state.release = { id: 11, draft: true, immutable: false, tag_name: TAG, target_commitish: SHA, updated_at: "2026-08-08T01:00:00Z",
    assets: ASSET_NAMES.map((name, index) => ({ id: index + 1, name, size: candidate.files[name].length })) };
  state.assetBytes = Object.fromEntries(ASSET_NAMES.map((name, index) => [String(index + 1), candidate.files[name].toString("base64")]));
  return state;
}
