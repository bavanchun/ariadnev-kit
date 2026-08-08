import { createHash } from "node:crypto";
import {
  copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

function sha256(content) {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

function assertSimpleName(name) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._@+-]*$/.test(name)) throw new Error(`unsafe candidate file name: ${name}`);
}

export function stageReleaseCandidate({ assetDirectory, attestationPath, outputDirectory }) {
  const assetsRoot = resolve(assetDirectory);
  const outputRoot = resolve(outputDirectory);
  if (basename(assetsRoot) !== "release" || basename(outputRoot) !== "candidate-upload" || dirname(assetsRoot) !== dirname(outputRoot)) {
    throw new Error("candidate staging directories must be fixed siblings under dist");
  }
  if (lstatSync(assetsRoot).isSymbolicLink() || !lstatSync(assetsRoot).isDirectory()) {
    throw new Error("candidate release directory must be a real directory");
  }
  if (lstatSync(attestationPath).isSymbolicLink() || !lstatSync(attestationPath).isFile()) {
    throw new Error("candidate attestation must be a regular file");
  }
  if (existsSync(outputRoot) && lstatSync(outputRoot).isSymbolicLink()) throw new Error("candidate staging directory must not be a symbolic link");
  const attestation = JSON.parse(readFileSync(attestationPath, "utf8"));
  const expected = [...attestation.releaseAssets].sort((left, right) => left.name.localeCompare(right.name));
  const actualNames = readdirSync(assetsRoot).sort((left, right) => left.localeCompare(right));
  if (JSON.stringify(actualNames) !== JSON.stringify(expected.map((entry) => entry.name))) {
    throw new Error("candidate release asset inventory drift");
  }
  for (const asset of expected) {
    assertSimpleName(asset.name);
    const source = join(assetsRoot, asset.name);
    const stat = lstatSync(source);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`candidate release asset must be a regular file: ${asset.name}`);
    const content = readFileSync(source);
    if (stat.size !== asset.size || sha256(content) !== asset.digest) {
      throw new Error(`candidate release asset drift: ${asset.name}`);
    }
  }
  rmSync(outputRoot, { recursive: true, force: true });
  mkdirSync(outputRoot, { recursive: true });
  for (const asset of expected) copyFileSync(join(assetsRoot, asset.name), join(outputRoot, asset.name));
  copyFileSync(attestationPath, join(outputRoot, "release-artifact-attestation.json"));
  return ["release-artifact-attestation.json", ...expected.map((entry) => entry.name)].sort();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const [assetDirectory, attestationPath, outputDirectory] = process.argv.slice(2);
    stageReleaseCandidate({ assetDirectory, attestationPath, outputDirectory });
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
