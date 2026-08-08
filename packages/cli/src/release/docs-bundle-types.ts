import type { Command } from "commander";
import type { Kit } from "../kit/kit-types.js";
import type { MatrixData } from "../providers/provider-matrix.js";

export const DOCS_BUNDLE_SCHEMA_ID = "https://vcskill.dev/schemas/docs-bundle-manifest-v1.schema.json";
export const DOCS_BUNDLE_SCHEMA_VERSION = 1;
export const DOCS_BUNDLE_ARCHIVE_NAME = "docs-bundle.tar.gz";
export const DOCS_BUNDLE_MANIFEST_NAME = "docs-bundle.manifest.json";
export const DOCS_BUNDLE_SCHEMA_NAME = "docs-bundle-manifest-v1.schema.json";
export const DOCS_BUNDLE_SCHEMA_MEMBER = `schemas/${DOCS_BUNDLE_SCHEMA_NAME}`;
export const DOCS_BUNDLE_MANIFEST_MEMBER = "manifest.json";

export type DocsBundleMode = "final" | "provisional";
export type DocsBundleDigest = `sha256:${string}`;
export type ProofStatus = "pass" | "fail" | "incomplete";
export type ProofProducer = "harness" | "evaluator";
export type ProofKind = "artifact" | "decision" | "execution" | "external-state" | "outcome" | "source";

export interface DocsBundleFileEntry {
  path: string;
  content: Buffer;
}

export interface DocsBundleOptionRecord {
  flags: string;
  description: string;
  required: boolean;
  optionalValue: boolean;
  variadic: boolean;
  defaultValueShape: "boolean" | "number" | "string" | "array" | "null" | "undefined";
}

export interface DocsBundleArgumentRecord {
  name: string;
  required: boolean;
  variadic: boolean;
  description: string;
}

export interface DocsBundleCommandRecord {
  path: string;
  aliases: string[];
  description: string;
  arguments: DocsBundleArgumentRecord[];
  options: DocsBundleOptionRecord[];
}

export interface DocsBundleSkillRecord {
  id: string;
  name: string;
  description: string;
  whenToUse?: string;
  category?: string;
  argumentHint?: string;
  userInvocable?: boolean;
  keywords?: string[];
  metadata: Record<string, string | number | boolean | null | Array<string | number | boolean | null>>;
}

export interface DocsBundleWorkflowRecord {
  id: string;
  title: string;
  description: string;
  nodes: Array<{ id: string; type: string; handler: { kind: string; ref: string } }>;
  edges: Array<{ id: string; from: string; to: string; type: string }>;
}

export interface DocsBundleProviderRecord {
  id: string;
  artifacts: Array<{ artifact: string; verified: true; path: string }>;
}

export interface DocsBundleProofClaim {
  id: string;
  status: ProofStatus;
  summary: string;
}

export interface DocsBundleProofAttestation {
  id: string;
  producer: ProofProducer;
  proof: ProofKind;
  status: ProofStatus;
}

export interface DocsBundleProofInput {
  schemaVersion: 1;
  boundary: string;
  sourceDigests: Record<string, DocsBundleDigest>;
  claims: DocsBundleProofClaim[];
  attestations: DocsBundleProofAttestation[];
}

export interface DocsBundleProofSummary extends DocsBundleProofInput {}

export interface DocsBundleManifestPayloadEntry {
  path: string;
  bytes: number;
  digest: DocsBundleDigest;
}

export interface DocsBundleManifestV1 {
  schemaVersion: 1;
  schemaId: typeof DOCS_BUNDLE_SCHEMA_ID;
  bundle: "vcskill-docs-bundle";
  mode: DocsBundleMode;
  publishable: boolean;
  version: string;
  releaseTag: string | null;
  sourceSha: string;
  generatorSha: string;
  generatedAt: string;
  sourceDateEpoch: number;
  proofBoundary: string;
  fileCount: number;
  totalBytes: number;
  payload: DocsBundleManifestPayloadEntry[];
}

export interface PreviousSourceOptions {
  sourceTree: string;
  productSha: string;
  generatorSha: string;
  releaseTag: string;
}

export interface FinalConsumerLockInput {
  lockPath: string;
  digest: DocsBundleDigest;
}

export interface DocsBundleOptions {
  mode: DocsBundleMode;
  version: string;
  releaseTag: string | null;
  sourceSha: string;
  generatorSha: string;
  generatedAt: string;
  sourceDateEpoch: number;
  outputDir: string;
  workspaceRoot: string;
  cli: Command;
  kit: Kit;
  providers: MatrixData;
  proof: DocsBundleProofInput;
  changelog: string;
  finalConsumerLock?: FinalConsumerLockInput;
  previousSource?: PreviousSourceOptions;
}

export interface DocsBundleValidationResult {
  valid: boolean;
  errors: string[];
}

export interface DocsBundleResult {
  archivePath: string;
  manifestPath: string;
  schemaPath: string;
  archiveDigest: DocsBundleDigest;
  manifestDigest: DocsBundleDigest;
  schemaDigest: DocsBundleDigest;
  fileCount: number;
  totalBytes: number;
  payloadFiles: DocsBundleManifestPayloadEntry[];
  manifest: DocsBundleManifestV1;
}
