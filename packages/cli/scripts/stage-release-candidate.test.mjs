import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { stageReleaseCandidate } from "./stage-release-candidate.mjs";

function digest(content) {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

test("candidate staging emits one exact flat inventory and rejects drift", () => {
  const root = mkdtempSync(join(tmpdir(), "ariadnev-candidate-stage-"));
  const dist = join(root, "dist");
  const release = join(dist, "release");
  const output = join(dist, "candidate-upload");
  const attestationPath = join(dist, "release-artifact-attestation.json");
  try {
    mkdirSync(release, { recursive: true });
    const content = Buffer.from("asset\n");
    writeFileSync(join(release, "checksums.txt"), content);
    writeFileSync(attestationPath, `${JSON.stringify({ releaseAssets: [{ name: "checksums.txt", size: content.length, digest: digest(content) }] })}\n`);
    assert.deepEqual(stageReleaseCandidate({ assetDirectory: release, attestationPath, outputDirectory: output }), ["checksums.txt", "release-artifact-attestation.json"]);
    assert.deepEqual(readdirSync(output).sort(), ["checksums.txt", "release-artifact-attestation.json"]);
    assert.deepEqual(readFileSync(join(output, "checksums.txt")), content);
    const linkedDist = join(root, "linked-dist");
    mkdirSync(linkedDist);
    symlinkSync(release, join(linkedDist, "release"), "dir");
    assert.throws(() => stageReleaseCandidate({ assetDirectory: join(linkedDist, "release"), attestationPath, outputDirectory: join(linkedDist, "candidate-upload") }), /real directory/);
    const linkedAttestation = join(dist, "linked-attestation.json");
    symlinkSync(attestationPath, linkedAttestation);
    assert.throws(() => stageReleaseCandidate({ assetDirectory: release, attestationPath: linkedAttestation, outputDirectory: output }), /regular file/);
    writeFileSync(join(release, "unexpected.txt"), "drift\n");
    assert.throws(() => stageReleaseCandidate({ assetDirectory: release, attestationPath, outputDirectory: output }), /inventory drift/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
