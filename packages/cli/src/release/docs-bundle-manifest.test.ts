import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { DocsBundleManifestV1 } from "./docs-bundle-types.js";
import { validateDocsBundleManifest } from "./docs-bundle-manifest.js";

const paths = [
  "proof/release-summary.json",
  "reference/cli/commands.json",
  "reference/previous-stable/bootstrap.json",
  "reference/providers/providers.json",
  "reference/skills/skills.json",
  "reference/workflows/workflows.json",
  "release-notes.md",
  "schemas/docs-bundle-manifest-v1.schema.json",
];
const digest = `sha256:${createHash("sha256").update("x").digest("hex")}` as const;
const generatedAt = "2026-08-08T00:00:00.000Z";

function manifest(): DocsBundleManifestV1 {
  return {
    schemaVersion: 1,
    schemaId: "https://ariadnev.com/schemas/docs-bundle-manifest-v1.schema.json",
    bundle: "ariadnev-docs-bundle",
    mode: "final",
    publishable: true,
    version: "1.2.3",
    releaseTag: "ariadnev@1.2.3",
    sourceSha: "a".repeat(40),
    generatorSha: "a".repeat(40),
    generatedAt,
    sourceDateEpoch: Date.parse(generatedAt) / 1000,
    proofBoundary: "allowlist:v1",
    fileCount: paths.length,
    totalBytes: paths.length,
    payload: paths.map((path) => ({ path, bytes: 1, digest })),
  };
}

function errors(value: unknown): string {
  return validateDocsBundleManifest(value).errors.join("; ");
}

describe("docs bundle manifest semantics", () => {
  it("accepts the exact sorted public payload and coupled release identity", () => {
    expect(validateDocsBundleManifest(manifest())).toEqual({ valid: true, errors: [] });
  });

  it("rejects duplicate, unsorted, recursive, incomplete, or unexpected payload inventories", () => {
    const duplicate = manifest();
    duplicate.payload[1]!.path = duplicate.payload[0]!.path;
    expect(errors(duplicate)).toMatch(/duplicate payload path/i);
    const unsorted = manifest();
    [unsorted.payload[0], unsorted.payload[1]] = [unsorted.payload[1]!, unsorted.payload[0]!];
    expect(errors(unsorted)).toMatch(/paths must be sorted/i);
    const recursive = manifest();
    recursive.payload[0]!.path = "manifest.json";
    expect(errors(recursive)).toMatch(/must not recursively list itself/i);
    const incomplete = manifest();
    incomplete.payload.shift();
    incomplete.fileCount -= 1;
    incomplete.totalBytes -= 1;
    expect(errors(incomplete)).toMatch(/required payload path missing/i);
    const unexpected = manifest();
    unexpected.payload.push({ path: "reference/private/leak.json", bytes: 1, digest });
    unexpected.payload.sort((left, right) => left.path.localeCompare(right.path));
    unexpected.fileCount += 1;
    unexpected.totalBytes += 1;
    expect(errors(unexpected)).toMatch(/unexpected payload path/i);
  });

  it("rejects count, byte, version, source, timestamp, and proof-boundary drift", () => {
    const cases: Array<[DocsBundleManifestV1, RegExp]> = [];
    const count = manifest(); count.fileCount += 1; cases.push([count, /fileCount/i]);
    const bytes = manifest(); bytes.totalBytes += 1; cases.push([bytes, /totalBytes/i]);
    const version = manifest(); version.version = "next"; cases.push([version, /stable semantic version/i]);
    const tag = manifest(); tag.releaseTag = "ariadnev@1.2.4"; cases.push([tag, /tag must match version/i]);
    const source = manifest(); source.generatorSha = "b".repeat(40); cases.push([source, /generatorSha/i]);
    const time = manifest(); time.sourceDateEpoch += 1; cases.push([time, /generatedAt/i]);
    const boundary = manifest(); boundary.proofBoundary = "allowlist:v2"; cases.push([boundary, /proofBoundary/i]);
    for (const [value, expected] of cases) expect(errors(value)).toMatch(expected);
  });

  it("returns schema errors instead of throwing for malformed payload values", () => {
    const malformed = manifest() as unknown as { payload: unknown[] };
    malformed.payload = [null];
    expect(() => validateDocsBundleManifest(malformed)).not.toThrow();
    expect(validateDocsBundleManifest(malformed).valid).toBe(false);
  });
});
