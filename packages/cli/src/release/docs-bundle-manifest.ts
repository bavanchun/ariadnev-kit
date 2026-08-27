import { createHash } from "node:crypto";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import manifestSchema from "../../schemas/docs-bundle-manifest-v1.schema.json";
import { readValidatedArchive } from "./docs-bundle-archive-reader.js";
import {
  DOCS_BUNDLE_MANIFEST_MEMBER,
  DOCS_BUNDLE_SCHEMA_ID,
  type DocsBundleDigest,
  type DocsBundleManifestPayloadEntry,
  type DocsBundleManifestV1,
  type DocsBundleValidationResult,
} from "./docs-bundle-types.js";

function sha256(content: Buffer | string): DocsBundleDigest {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

export function stableJson(value: unknown): string {
  return `${JSON.stringify(value, (_key, candidate) => {
    if (Array.isArray(candidate)) return candidate;
    if (!candidate || typeof candidate !== "object") return candidate;
    return Object.fromEntries(Object.entries(candidate as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)));
  }, 2)}\n`;
}

export function payloadEntry(path: string, content: Buffer): DocsBundleManifestPayloadEntry {
  return { path, bytes: content.byteLength, digest: sha256(content) };
}

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validate = ajv.compile(manifestSchema);
// Accepts stable and SemVer-2.0 prereleases (`1.2.1-beta.0`) so phase 11's
// beta channel can produce a valid manifest. The `releaseTag` check below still
// enforces the tag/version identity, so a manifest can never claim a stable
// tag for a prerelease version or vice versa.
const RELEASE_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const REQUIRED_PAYLOAD_PATHS = [
  "proof/release-summary.json",
  "reference/cli/commands.json",
  "reference/providers/providers.json",
  "reference/skills/skills.json",
  "reference/workflows/workflows.json",
  "release-notes.md",
  "schemas/docs-bundle-manifest-v1.schema.json",
] as const;
const PREVIOUS_STABLE_PAYLOAD_PATH = "reference/previous-stable/bootstrap.json";
const ALLOWED_PAYLOAD_PATHS = new Set<string>([
  ...REQUIRED_PAYLOAD_PATHS,
  PREVIOUS_STABLE_PAYLOAD_PATH,
]);

export function validateDocsBundleManifest(value: unknown): DocsBundleValidationResult {
  const errors: string[] = [];
  const manifest = value as Partial<DocsBundleManifestV1> | null;
  if (!manifest || typeof manifest !== "object") return { valid: false, errors: ["/ must be an object"] };
  const valid = validate(value);
  if (!valid) errors.push(...(validate.errors ?? []).map((error) => `${error.instancePath || "/"} ${error.message ?? "is invalid"}`));
  if (!valid) return { valid: false, errors };
  const complete = manifest as DocsBundleManifestV1;
  if (!RELEASE_VERSION.test(complete.version)) errors.push("version must be a semantic version");
  if (complete.mode === "final" && complete.releaseTag !== `ariadnev@${complete.version}`) {
    errors.push("releaseTag must match version identity");
  }
  if (complete.mode === "provisional" && complete.releaseTag !== null) errors.push("provisional releaseTag must be null");
  if (complete.mode === "final" && complete.publishable !== true) errors.push("final manifest must be publishable");
  if (complete.mode === "provisional" && complete.publishable !== false) errors.push("provisional manifest must not be publishable");
  if (complete.sourceSha !== complete.generatorSha) errors.push("generatorSha must equal the bundle sourceSha");
  if (Date.parse(complete.generatedAt) / 1000 !== complete.sourceDateEpoch) errors.push("generatedAt must equal sourceDateEpoch");
  if (complete.proofBoundary !== "allowlist:v1") errors.push("proofBoundary must equal allowlist:v1");
  const seen = new Set<string>();
  let totalBytes = 0;
  for (const entry of complete.payload) {
    if (seen.has(entry.path)) errors.push(`duplicate payload path: ${entry.path}`);
    seen.add(entry.path);
    totalBytes += entry.bytes;
  }
  const paths = complete.payload.map((entry) => entry.path);
  if (paths.join("\0") !== [...paths].sort((left, right) => left.localeCompare(right)).join("\0")) errors.push("payload paths must be sorted");
  if (seen.has(DOCS_BUNDLE_MANIFEST_MEMBER)) errors.push("manifest must not recursively list itself as payload");
  for (const path of REQUIRED_PAYLOAD_PATHS) if (!seen.has(path)) errors.push(`required payload path missing: ${path}`);
  for (const path of seen) if (!ALLOWED_PAYLOAD_PATHS.has(path)) errors.push(`unexpected payload path: ${path}`);
  if (complete.mode === "final" && !seen.has(PREVIOUS_STABLE_PAYLOAD_PATH)) {
    errors.push(`required final payload path missing: ${PREVIOUS_STABLE_PAYLOAD_PATH}`);
  }
  if (complete.fileCount !== complete.payload.length) errors.push("fileCount must equal payload length");
  if (complete.totalBytes !== totalBytes) errors.push("totalBytes must equal payload byte sum");
  if (complete.schemaId !== DOCS_BUNDLE_SCHEMA_ID) errors.push("schemaId must match bundle manifest schema");
  return { valid: errors.length === 0, errors };
}

export function verifyArchiveManifestInventory(archive: Buffer, manifest: DocsBundleManifestV1): void {
  const validation = validateDocsBundleManifest(manifest);
  if (!validation.valid) throw new Error(`invalid archive manifest: ${validation.errors.join("; ")}`);
  const entries = readValidatedArchive(archive);
  const manifestEntry = entries.find((entry) => entry.path === DOCS_BUNDLE_MANIFEST_MEMBER);
  if (!manifestEntry?.content.equals(Buffer.from(stableJson(manifest), "utf8"))) throw new Error("archive manifest member drift detected");
  const actual = entries.filter((entry) => entry.path !== DOCS_BUNDLE_MANIFEST_MEMBER);
  if (actual.length !== manifest.payload.length) throw new Error("archive payload inventory drift detected");
  const expected = new Map(manifest.payload.map((entry) => [entry.path, entry]));
  for (const entry of actual) {
    const target = expected.get(entry.path);
    if (!target) throw new Error(`unexpected archive member: ${entry.path}`);
    if (target.bytes !== entry.content.byteLength) throw new Error(`archive payload byte drift: ${entry.path}`);
    if (target.digest !== entry.digest) throw new Error(`archive payload digest drift: ${entry.path}`);
    expected.delete(entry.path);
  }
  if (expected.size > 0) throw new Error(`archive payload missing member: ${expected.keys().next().value as string}`);
}
