import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import manifestSchema from "../../schemas/docs-bundle-manifest-v1.schema.json";
import { createDeterministicArchive, extractArchiveMember } from "./docs-bundle-archive.js";
import { projectHistoricalSource } from "./docs-bundle-historical.js";
import { payloadEntry, stableJson, validateDocsBundleManifest, verifyArchiveManifestInventory } from "./docs-bundle-manifest.js";
import { normalizeReleaseNotes, projectCli, projectKit, projectProof, projectProviders } from "./docs-bundle-projector.js";
import {
  DOCS_BUNDLE_ARCHIVE_NAME,
  DOCS_BUNDLE_MANIFEST_MEMBER,
  DOCS_BUNDLE_MANIFEST_NAME,
  DOCS_BUNDLE_SCHEMA_ID,
  DOCS_BUNDLE_SCHEMA_MEMBER,
  DOCS_BUNDLE_SCHEMA_NAME,
  type DocsBundleDigest,
  type DocsBundleFileEntry,
  type DocsBundleManifestV1,
  type DocsBundleOptions,
  type DocsBundleResult,
} from "./docs-bundle-types.js";

const SHA40 = /^[a-f0-9]{40}$/;

function sha256(content: Buffer | string): DocsBundleDigest {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

function assertSha(value: string, label: string): void {
  if (!SHA40.test(value)) throw new Error(`${label} must be a full lowercase SHA`);
}

function validateIdentity(options: DocsBundleOptions): void {
  assertSha(options.sourceSha, "sourceSha");
  assertSha(options.generatorSha, "generatorSha");
  if (options.mode === "final") {
    if (options.releaseTag !== `ariadnev@${options.version}`) throw new Error("final docs bundle requires releaseTag to match package version");
    if (!options.finalConsumerLock) throw new Error("final docs bundle requires the exact Phase 9 web-consumer lock");
    if (!options.previousSource) throw new Error("final docs bundle requires the immediate previous stable source");
    if (!existsSync(options.finalConsumerLock.lockPath)) throw new Error(`final consumer lock not found: ${options.finalConsumerLock.lockPath}`);
    const actual = sha256(readFileSync(options.finalConsumerLock.lockPath));
    if (actual !== options.finalConsumerLock.digest) throw new Error("final consumer lock digest drift detected");
  } else if (options.releaseTag !== null) {
    throw new Error("provisional docs bundle must not claim a publishable release tag");
  }
  if (options.previousSource && options.previousSource.generatorSha !== options.generatorSha) {
    throw new Error("previous stable projection generator SHA must match the current generator SHA");
  }
}

function normalizedPayloadFiles(options: DocsBundleOptions): DocsBundleFileEntry[] {
  const projectedKit = projectKit(options.kit);
  const files: DocsBundleFileEntry[] = [
    { path: "reference/cli/commands.json", content: Buffer.from(stableJson(projectCli(options.cli)), "utf8") },
    { path: "reference/skills/skills.json", content: Buffer.from(stableJson(projectedKit.skills), "utf8") },
    { path: "reference/workflows/workflows.json", content: Buffer.from(stableJson(projectedKit.workflows), "utf8") },
    { path: "reference/providers/providers.json", content: Buffer.from(stableJson(projectProviders(options.providers)), "utf8") },
    { path: "proof/release-summary.json", content: Buffer.from(stableJson(projectProof(options.proof)), "utf8") },
    { path: "release-notes.md", content: Buffer.from(normalizeReleaseNotes({ version: options.version, changelog: options.changelog, workspaceRoot: options.workspaceRoot }), "utf8") },
    { path: DOCS_BUNDLE_SCHEMA_MEMBER, content: Buffer.from(stableJson(manifestSchema), "utf8") },
  ];
  if (options.previousSource) {
    files.push({
      path: "reference/previous-stable/bootstrap.json",
      content: Buffer.from(stableJson({
        releaseTag: options.previousSource.releaseTag,
        productSha: options.previousSource.productSha,
        generatorSha: options.previousSource.generatorSha,
        historicalProjection: projectHistoricalSource(options.previousSource, options.workspaceRoot),
      }), "utf8"),
    });
  }
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

function manifestFromPayload(options: DocsBundleOptions, payload: DocsBundleFileEntry[]): DocsBundleManifestV1 {
  const entries = payload.map((entry) => payloadEntry(entry.path, entry.content));
  return {
    schemaVersion: 1,
    schemaId: DOCS_BUNDLE_SCHEMA_ID,
    bundle: "ariadnev-docs-bundle",
    mode: options.mode,
    publishable: options.mode === "final",
    version: options.version,
    releaseTag: options.releaseTag,
    sourceSha: options.sourceSha,
    generatorSha: options.generatorSha,
    generatedAt: options.generatedAt,
    sourceDateEpoch: options.sourceDateEpoch,
    proofBoundary: options.proof.boundary,
    fileCount: entries.length,
    totalBytes: entries.reduce((sum, entry) => sum + entry.bytes, 0),
    payload: entries,
  };
}

export function readArchiveMember(archive: Buffer, path: string): Buffer {
  return extractArchiveMember(archive, path);
}

export { validateDocsBundleManifest };

export async function generateDocsBundle(options: DocsBundleOptions): Promise<DocsBundleResult> {
  validateIdentity(options);
  const payloadFiles = normalizedPayloadFiles(options);
  const manifest = manifestFromPayload(options, payloadFiles);
  const validation = validateDocsBundleManifest(manifest);
  if (!validation.valid) throw new Error(`docs bundle manifest is invalid: ${validation.errors.join("; ")}`);
  const manifestBytes = Buffer.from(stableJson(manifest), "utf8");
  const archive = createDeterministicArchive(
    [{ path: DOCS_BUNDLE_MANIFEST_MEMBER, content: manifestBytes }, ...payloadFiles],
    { gzipMtime: options.sourceDateEpoch, tarMtime: options.sourceDateEpoch },
  );
  verifyArchiveManifestInventory(archive.archive, manifest);
  const manifestMember = extractArchiveMember(archive.archive, DOCS_BUNDLE_MANIFEST_MEMBER);
  if (!manifestMember.equals(manifestBytes)) throw new Error("manifest sidecar drifted from archive member");
  const schemaMember = extractArchiveMember(archive.archive, DOCS_BUNDLE_SCHEMA_MEMBER);
  const schemaBytes = payloadFiles.find((entry) => entry.path === DOCS_BUNDLE_SCHEMA_MEMBER)?.content;
  if (!schemaBytes || !schemaMember.equals(schemaBytes)) throw new Error("schema sidecar drifted from archive member");
  mkdirSync(options.outputDir, { recursive: true });
  const archivePath = join(options.outputDir, DOCS_BUNDLE_ARCHIVE_NAME);
  const manifestPath = join(options.outputDir, DOCS_BUNDLE_MANIFEST_NAME);
  const schemaPath = join(options.outputDir, DOCS_BUNDLE_SCHEMA_NAME);
  writeFileSync(archivePath, archive.archive);
  writeFileSync(manifestPath, manifestBytes);
  writeFileSync(schemaPath, schemaBytes);
  return {
    archivePath,
    manifestPath,
    schemaPath,
    archiveDigest: archive.digest,
    manifestDigest: sha256(manifestBytes),
    schemaDigest: sha256(schemaBytes),
    fileCount: archive.fileCount,
    totalBytes: archive.totalBytes,
    payloadFiles: manifest.payload,
    manifest,
  };
}
