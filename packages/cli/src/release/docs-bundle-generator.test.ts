import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { buildProgram } from "../index.js";
import { loadKit, resolveKitRoot } from "../kit/load-kit.js";
import { buildProviderMatrix } from "../providers/provider-matrix.js";
import { cleanupTemps, sha256File, tempDir } from "./docs-bundle-generator-test-helpers.js";
import { generateDocsBundle, readArchiveMember, validateDocsBundleManifest } from "./docs-bundle-generator.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", "..", "..");
const generatedAt = "2026-08-08T00:00:00.000Z";
const sourceDateEpoch = Date.parse(generatedAt) / 1000;

afterEach(() => {
  cleanupTemps();
});

describe("docs bundle generator", () => {
  it("generates deterministic final sidecars and archive members from exact immutable inputs", async () => {
    const first = tempDir("vcskill-docs-bundle-a-");
    const second = tempDir("vcskill-docs-bundle-b-");
    const previousSourceTree = tempDir("vcskill-docs-previous-");
    execFileSync("git", ["clone", "--quiet", "--no-checkout", repoRoot, "."], { cwd: previousSourceTree });
    execFileSync("git", ["checkout", "--quiet", "--detach", "vcskill@0.7.0"], { cwd: previousSourceTree });
    const previousProductSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: previousSourceTree, encoding: "utf8" }).trim();
    const lockPath = join(first, "web-consumer-lock.json");
    writeFileSync(lockPath, JSON.stringify({ schemaVersion: 1 }, null, 2));
    const common = {
      mode: "final" as const,
      version: "0.12.0",
      releaseTag: "vcskill@0.12.0",
      sourceSha: "a".repeat(40),
      generatorSha: "a".repeat(40),
      generatedAt,
      sourceDateEpoch,
      workspaceRoot: repoRoot,
      cli: buildProgram(),
      kit: loadKit(resolveKitRoot(process.cwd())),
      providers: buildProviderMatrix(),
      proof: {
        schemaVersion: 1 as const,
        boundary: "allowlist:v1",
        sourceDigests: { report: `sha256:${"c".repeat(64)}` as `sha256:${string}` },
        claims: [{ id: "bundle.determinism", status: "pass" as const, summary: "matched" }],
        attestations: [{ id: "att-1", producer: "evaluator" as const, proof: "outcome" as const, status: "pass" as const }],
      },
      changelog: "# Changelog\n\n## 0.12.0\nDeterministic docs bundle.\n",
      finalConsumerLock: { lockPath, digest: sha256File(lockPath) },
      previousSource: {
        sourceTree: previousSourceTree,
        releaseTag: "vcskill@0.7.0",
        productSha: previousProductSha,
        generatorSha: "a".repeat(40),
      },
    };

    const one = await generateDocsBundle({ ...common, outputDir: first });
    const two = await generateDocsBundle({ ...common, outputDir: second });

    expect(one.archiveDigest).toBe(two.archiveDigest);
    expect(readFileSync(one.archivePath).equals(readFileSync(two.archivePath))).toBe(true);
    expect(readFileSync(one.manifestPath, "utf8")).toBe(readArchiveMember(readFileSync(one.archivePath), "manifest.json").toString("utf8"));
    expect(readFileSync(one.schemaPath, "utf8")).toBe(readArchiveMember(readFileSync(one.archivePath), "schemas/docs-bundle-manifest-v1.schema.json").toString("utf8"));
    expect(validateDocsBundleManifest(JSON.parse(readFileSync(one.manifestPath, "utf8"))).valid).toBe(true);
    const archive = readFileSync(one.archivePath);
    const projectedPayload = one.manifest.payload.map((entry) => readArchiveMember(archive, entry.path).toString("utf8")).join("\n");
    expect(projectedPayload).not.toContain(process.cwd());
    expect(projectedPayload).not.toContain("/Users/");
    expect(projectedPayload).not.toContain("ghp_");
    expect(JSON.stringify(one.manifest)).not.toContain(process.cwd());
    expect(JSON.stringify(one.manifest)).not.toContain("/Users/");
    expect(JSON.stringify(one.manifest)).not.toContain("ghp_");
    const bootstrap = JSON.parse(readArchiveMember(archive, "reference/previous-stable/bootstrap.json").toString("utf8"));
    expect(bootstrap).toMatchObject({ releaseTag: "vcskill@0.7.0", productSha: previousProductSha, generatorSha: "a".repeat(40) });
    await expect(generateDocsBundle({
      ...common,
      outputDir: tempDir("vcskill-docs-generator-drift-"),
      previousSource: { ...common.previousSource, generatorSha: "b".repeat(40) },
    })).rejects.toThrow(/generator SHA must match/i);
  });

  it("rejects final generation without the exact consumer lock and manifest identity drift", async () => {
    await expect(generateDocsBundle({
      mode: "final",
      version: "0.12.0",
      releaseTag: "vcskill@0.12.0",
      sourceSha: "d".repeat(40),
      generatorSha: "d".repeat(40),
      generatedAt,
      sourceDateEpoch,
      outputDir: tempDir("vcskill-docs-final-missing-"),
      workspaceRoot: repoRoot,
      cli: buildProgram(),
      kit: loadKit(resolveKitRoot(process.cwd())),
      providers: buildProviderMatrix(),
      proof: { schemaVersion: 1, boundary: "allowlist:v1", sourceDigests: {}, claims: [], attestations: [] },
      changelog: "# Changelog\n\n## 0.12.0\nCandidate\n",
    })).rejects.toThrow(/web-consumer lock/i);

    const lockDirectory = tempDir("vcskill-docs-final-lock-");
    const lockPath = join(lockDirectory, "web-consumer-lock.json");
    writeFileSync(lockPath, "{}\n");
    await expect(generateDocsBundle({
      mode: "final",
      version: "0.12.0",
      releaseTag: "vcskill@0.12.0",
      sourceSha: "d".repeat(40),
      generatorSha: "d".repeat(40),
      generatedAt,
      sourceDateEpoch,
      outputDir: tempDir("vcskill-docs-final-no-previous-"),
      workspaceRoot: repoRoot,
      cli: buildProgram(),
      kit: loadKit(resolveKitRoot(process.cwd())),
      providers: buildProviderMatrix(),
      proof: { schemaVersion: 1, boundary: "allowlist:v1", sourceDigests: {}, claims: [], attestations: [] },
      changelog: "# Changelog\n\n## 0.12.0\nCandidate\n",
      finalConsumerLock: { lockPath, digest: sha256File(lockPath) },
    })).rejects.toThrow(/previous stable source/i);

    expect(validateDocsBundleManifest({
      schemaVersion: 1,
      schemaId: "https://vcskill.dev/schemas/docs-bundle-manifest-v1.schema.json",
      bundle: "vcskill-docs-bundle",
      mode: "final",
      publishable: true,
      version: "0.12.0",
      releaseTag: "vcskill@0.11.1",
      sourceSha: "a".repeat(40),
      generatorSha: "b".repeat(40),
      generatedAt: "2026-08-08T00:00:00.000Z",
      sourceDateEpoch: 1,
      proofBoundary: "allowlist:v1",
      fileCount: 2,
      totalBytes: 5,
      payload: [
        { path: "reference/a.json", bytes: 2, digest: `sha256:${"c".repeat(64)}` },
        { path: "reference/a.json", bytes: 2, digest: `sha256:${"d".repeat(64)}` },
      ],
    }).valid).toBe(false);
  });

});
