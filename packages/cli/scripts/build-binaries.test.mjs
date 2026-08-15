import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { TARGETS } from "./binary-targets.mjs";
import { validateReleaseOutputDirectory } from "./release-output-directory.mjs";
import { resolvePreviousStable } from "./resolve-previous-stable.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const pkgDir = join(here, "..");
const repoRoot = join(pkgDir, "..", "..");
const docsAssets = ["docs-bundle.tar.gz", "docs-bundle.manifest.json", "docs-bundle-manifest-v1.schema.json"];

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

test("build-binaries writes a fresh release tree with exact assets and checksum coverage", () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "ariadnev-build-binaries-"));
  const outputDir = join(tempRoot, "release");
  try {
    writeFileSync(join(tempRoot, "stale.txt"), "ignore\n");
    mkdirSync(outputDir, { recursive: true });
    writeFileSync(join(outputDir, "stale.txt"), "stale\n");

    const sourceSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim();
    const generatedAt = execFileSync("git", ["show", "-s", "--format=%cI", sourceSha], { cwd: repoRoot, encoding: "utf8" }).trim();
    const sourceDateEpoch = execFileSync("git", ["show", "-s", "--format=%ct", sourceSha], { cwd: repoRoot, encoding: "utf8" }).trim();
    const version = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8")).version;
    const previous = resolvePreviousStable({ repositoryRoot: repoRoot, currentVersion: version });
    const previousSourceTree = join(tempRoot, "previous-stable");
    execFileSync("git", ["clone", "--quiet", "--no-checkout", repoRoot, previousSourceTree]);
    execFileSync("git", ["checkout", "--quiet", "--detach", previous.productSha], { cwd: previousSourceTree });

    execFileSync("node", [
      join(pkgDir, "scripts", "build-binaries.mjs"),
      "--source-sha", sourceSha,
      "--generated-at", generatedAt,
      "--source-date-epoch", sourceDateEpoch,
      "--previous-source-tree", previousSourceTree,
      "--previous-source-tag", previous.releaseTag,
      "--previous-source-sha", previous.productSha,
      "--output-dir", outputDir,
    ], { cwd: repoRoot, stdio: "inherit" });

    const expectedAssets = [...TARGETS.map(({ asset }) => asset), ...docsAssets, "checksums.txt"].sort();
    assert.deepEqual(readdirSync(outputDir).sort(), expectedAssets);
    assert.equal(readdirSync(outputDir).includes("stale.txt"), false);

    const checksumLines = readFileSync(join(outputDir, "checksums.txt"), "utf8").trim().split("\n");
    const checksumAssets = checksumLines.map((line) => line.split(/\s{2}/)[1]);
    assert.deepEqual([...checksumAssets].sort(), [...TARGETS.map(({ asset }) => asset), ...docsAssets].sort());
    assert.equal(new Set(checksumAssets).size, checksumAssets.length);
    for (const line of checksumLines) {
      const [digest, asset] = line.split(/\s{2}/);
      assert.equal(digest, sha256(join(outputDir, asset)));
    }
    const manifest = JSON.parse(readFileSync(join(outputDir, "docs-bundle.manifest.json"), "utf8"));
    assert.ok(manifest.payload.some(({ path }) => path === "reference/previous-stable/bootstrap.json"));

    execFileSync("bun", [
      join(pkgDir, "scripts", "verify-docs-bundle-sidecars.ts"),
      join(outputDir, "docs-bundle.tar.gz"),
      join(outputDir, "docs-bundle.manifest.json"),
      join(outputDir, "docs-bundle-manifest-v1.schema.json"),
    ], { cwd: repoRoot, stdio: "inherit" });
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("release output cleanup is restricted to the canonical directory or a temporary release leaf", () => {
  const canonical = join(pkgDir, "dist", "release");
  const tempRoot = mkdtempSync(join(tmpdir(), "ariadnev-release-output-"));
  try {
    assert.equal(validateReleaseOutputDirectory(canonical, canonical), canonical);
    assert.equal(validateReleaseOutputDirectory(join(tempRoot, "release"), canonical), join(tempRoot, "release"));
    assert.throws(() => validateReleaseOutputDirectory(repoRoot, canonical), /release leaf|temporary directory/);
    assert.throws(() => validateReleaseOutputDirectory(join(tempRoot, "not-release"), canonical), /release leaf/);
    const linkedParent = join(tempRoot, "linked-dist");
    const linkedCanonical = join(linkedParent, "release");
    symlinkSync(tempRoot, linkedParent, "dir");
    assert.throws(() => validateReleaseOutputDirectory(linkedCanonical, linkedCanonical), /parent.*symbolic link/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
