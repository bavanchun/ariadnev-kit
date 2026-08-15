import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateReleaseJson } from "./validate-release-json.mjs";

const schemaUrl = "https://ariadnev.com/schemas/release-artifact-attestation.schema.json";

function stable(value) {
  return `${JSON.stringify(value, (_key, current) => {
    if (!current || typeof current !== "object" || Array.isArray(current)) return current;
    return Object.fromEntries(Object.entries(current).sort(([a], [b]) => a.localeCompare(b)));
  }, 2)}\n`;
}

function sha256(buffer) {
  return `sha256:${createHash("sha256").update(buffer).digest("hex")}`;
}

function simpleName(name) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._@+-]*$/.test(name)) throw new Error(`unsafe asset name: ${name}`);
  return name;
}

export function createReleaseAttestation({
  assetDir, outputPath, schemaPath,
  workflowPath, generatorPath,
}) {
  const releaseAssets = readdirSync(assetDir).sort((a, b) => a.localeCompare(b)).map((name) => {
    const file = join(assetDir, simpleName(name));
    const stat = lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`release asset must be a regular file: ${name}`);
    return { name, size: stat.size, digest: sha256(readFileSync(file)) };
  });
  const payload = {
    // 2 drops the `consumer` block. Version 1 attestations were never published,
    // but the bump is what keeps "the gate never existed" from reading as "the
    // gate was silently dropped" to anything that meets both shapes.
    schemaVersion: 2,
    schema: schemaUrl,
    artifactName: process.env.CANDIDATE_ARTIFACT_NAME,
    workflow: {
      runId: process.env.GITHUB_RUN_ID,
      runAttempt: process.env.GITHUB_RUN_ATTEMPT,
      path: workflowPath,
      ref: process.env.GITHUB_WORKFLOW_REF,
      digest: sha256(readFileSync(workflowPath)),
      sha: process.env.GITHUB_WORKFLOW_SHA,
    },
    product: {
      sha: process.env.SOURCE_SHA,
      version: process.env.RELEASE_VERSION,
      tag: process.env.RELEASE_TAG,
    },
    generator: {
      path: generatorPath,
      digest: sha256(readFileSync(generatorPath)),
      sha: process.env.SOURCE_SHA,
    },
    releaseAssets,
  };
  writeFileSync(outputPath, stable(payload));
  validateReleaseJson({ schemaPath, jsonPath: outputPath });
  return payload;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const [assetDir, outputPath, schemaPath] = process.argv.slice(2);
    createReleaseAttestation({
      assetDir,
      outputPath,
      schemaPath,
      workflowPath: ".github/workflows/release.yml",
      generatorPath: "packages/cli/scripts/generate-docs-bundle.ts",
    });
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
