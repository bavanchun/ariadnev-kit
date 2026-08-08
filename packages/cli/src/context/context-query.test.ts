import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createArtifactGraphIndex } from "./artifact-index.js";
import {
  contextDigest,
  createSimpleContextIndex,
  evaluateContextQueries,
  loadContextCorpus,
  loadContextQueries,
  type ContextDocumentV1,
} from "./context-query.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function document(path: string, content: string, redaction: "public" | "private" = "public"): ContextDocumentV1 {
  return Object.freeze({
    path,
    kind: "fixture",
    redaction,
    content,
    digest: contextDigest(content),
  });
}

describe("context retrieval benchmark contract", () => {
  it("loads one frozen public corpus and validates every relevance label", () => {
    const root = process.cwd();
    const corpus = loadContextCorpus({ root, manifestPath: "evals/context/corpus-manifest.json" });
    const queries = loadContextQueries({
      root,
      queriesPath: "evals/context/queries.json",
      corpusId: corpus.manifest.id,
      corpusPaths: corpus.documents.map((entry) => entry.path),
    });
    expect(corpus.documents).toHaveLength(26);
    expect(corpus.documents.every((entry) => entry.redaction === "public" && entry.digest.startsWith("sha256:"))).toBe(true);
    expect(queries.cases).toHaveLength(13);
    expect(queries.manifest.seed).toBe(corpus.manifest.seed);
  });

  it("improves relational retrieval materially without regressing deterministic task success", () => {
    const root = process.cwd();
    const corpus = loadContextCorpus({ root, manifestPath: "evals/context/corpus-manifest.json" });
    const queries = loadContextQueries({
      root,
      queriesPath: "evals/context/queries.json",
      corpusId: corpus.manifest.id,
      corpusPaths: corpus.documents.map((entry) => entry.path),
    });
    const baseline = evaluateContextQueries(createSimpleContextIndex(corpus.documents), queries.cases, queries.manifest.topK);
    const candidate = evaluateContextQueries(createArtifactGraphIndex(corpus.documents), queries.cases, queries.manifest.topK);
    const qualityGain = candidate.retrievalQuality - baseline.retrievalQuality;
    const taskGain = candidate.taskSuccessRate - baseline.taskSuccessRate;
    expect(qualityGain >= 0.1 || taskGain >= 0.05).toBe(true);
    expect(candidate.taskSuccessRate).toBeGreaterThanOrEqual(baseline.taskSuccessRate);
    expect(candidate.provenanceRate).toBe(1);
    expect(candidate.perQuery.every((entry) => entry.resultPaths.length <= queries.manifest.topK)).toBe(true);
  });

  it("refreshes changed content, purges deletion, excludes private input, and preserves provenance", () => {
    const first = document("docs/first.md", "alpha owns the router");
    const linked = document("docs/linked.md", "See vc:first for routing context");
    const privateDocument = document("private/secret.md", "alpha private credential", "private");
    const index = createArtifactGraphIndex([first, linked, privateDocument]);
    const initial = index.query("alpha router", 5);
    expect(initial.some((entry) => entry.path === first.path && entry.digest === first.digest)).toBe(true);
    expect(initial.some((entry) => entry.path === privateDocument.path)).toBe(false);

    const updated = document(first.path, "beta owns the parser");
    index.refresh([updated, linked, privateDocument]);
    expect(index.query("alpha router", 5).some((entry) => entry.path === first.path)).toBe(false);
    expect(index.query("beta parser", 5)).toContainEqual(expect.objectContaining({ path: first.path, digest: updated.digest }));

    index.refresh([linked, privateDocument]);
    expect(index.query("beta parser", 5).some((entry) => entry.path === first.path)).toBe(false);
    expect(index.stats()).toMatchObject({ documents: 1, privateDocumentsExcluded: 1 });
  });

  it("fails closed when a frozen corpus entry is deleted instead of serving stale bytes", () => {
    const root = mkdtempSync(join(tmpdir(), "vcskill-context-corpus-"));
    roots.push(root);
    writeFileSync(join(root, "manifest.json"), JSON.stringify({
      schemaVersion: 1,
      id: "deleted-corpus",
      frozenAt: "2026-08-08T14:30:00.000Z",
      seed: 1,
      cacheStates: ["cold", "warm"],
      entries: [{ path: "missing.md", kind: "fixture", redaction: "public" }],
    }));
    expect(() => loadContextCorpus({ root, manifestPath: "manifest.json" })).toThrow(/missing|available|regular/i);
  });

  it("binds the checked benchmark decision to the frozen corpus and query digests", () => {
    const root = process.cwd();
    const corpus = loadContextCorpus({ root, manifestPath: "evals/context/corpus-manifest.json" });
    const queries = loadContextQueries({
      root,
      queriesPath: "evals/context/queries.json",
      corpusId: corpus.manifest.id,
      corpusPaths: corpus.documents.map((entry) => entry.path),
    });
    const report = JSON.parse(readFileSync(join(root, "evals/reports/context-graph-benchmark.json"), "utf8")) as {
      decision: string;
      frozenInputs: { corpusDigest: string; queryDigest: string };
      implementation: { simpleIndexDigest: string; artifactGraphDigest: string; benchmarkDigest: string };
      gates: Record<string, boolean>;
    };
    expect(report.frozenInputs).toEqual(expect.objectContaining({
      corpusDigest: corpus.corpusDigest,
      queryDigest: queries.queryDigest,
    }));
    expect(report.implementation).toEqual({
      simpleIndexDigest: contextDigest(readFileSync(join(root, "packages/cli/src/context/context-query.ts"), "utf8")),
      artifactGraphDigest: contextDigest(readFileSync(join(root, "packages/cli/src/context/artifact-index.ts"), "utf8")),
      benchmarkDigest: contextDigest(readFileSync(join(root, "packages/cli/scripts/benchmark-context.mjs"), "utf8")),
    });
    expect(report.decision).toBe("adopt-deterministic-artifact-graph");
    expect(Object.values(report.gates).every(Boolean)).toBe(true);
  });

  it("rejects malformed corpus and query manifests at the trust boundary", () => {
    const root = mkdtempSync(join(tmpdir(), "vcskill-context-validation-"));
    roots.push(root);
    const validCorpus = {
      schemaVersion: 1,
      id: "fixture-corpus",
      frozenAt: "2026-08-08T14:30:00.000Z",
      seed: 1,
      cacheStates: ["cold", "warm"],
      entries: [{ path: "a.md", kind: "fixture", redaction: "public" }],
    };
    const invalidCorpora = [
      { ...validCorpus, schemaVersion: 2 },
      { ...validCorpus, cacheStates: ["warm", "cold"] },
      { ...validCorpus, entries: [] },
      { ...validCorpus, entries: [...validCorpus.entries, ...validCorpus.entries] },
      { ...validCorpus, entries: [{ ...validCorpus.entries[0], redaction: "secret" }] },
      { ...validCorpus, id: "INVALID" },
      { ...validCorpus, frozenAt: "2026-08-08" },
      { ...validCorpus, seed: -1 },
      { ...validCorpus, entries: [{ ...validCorpus.entries[0], path: "../a.md" }] },
      { ...validCorpus, unknown: true },
    ];
    for (const manifest of invalidCorpora) {
      writeFileSync(join(root, "manifest.json"), JSON.stringify(manifest));
      expect(() => loadContextCorpus({ root, manifestPath: "manifest.json" })).toThrow();
    }

    const validCase = {
      id: "direct.fixture",
      kind: "direct",
      query: "alpha",
      relevance: [{ path: "a.md", grade: 3 }],
      requiredPaths: ["a.md"],
    };
    const validQueries = { schemaVersion: 1, corpusId: "fixture-corpus", seed: 1, topK: 1, cases: [validCase] };
    const invalidQueries = [
      { ...validQueries, schemaVersion: 2 },
      { ...validQueries, corpusId: "wrong-corpus" },
      { ...validQueries, cases: [] },
      { ...validQueries, cases: [{ ...validCase, kind: "unknown" }] },
      { ...validQueries, cases: [{ ...validCase, relevance: [] }] },
      { ...validQueries, cases: [{ ...validCase, requiredPaths: [] }] },
      { ...validQueries, cases: [{ ...validCase, requiredPaths: ["missing.md"] }] },
      { ...validQueries, cases: [{ ...validCase, relevance: [{ path: "a.md", grade: 3 }, { path: "a.md", grade: 2 }] }] },
      { ...validQueries, cases: [validCase, validCase] },
    ];
    for (const manifest of invalidQueries) {
      writeFileSync(join(root, "queries.json"), JSON.stringify(manifest));
      expect(() => loadContextQueries({
        root,
        queriesPath: "queries.json",
        corpusId: "fixture-corpus",
        corpusPaths: ["a.md"],
      })).toThrow();
    }
  });

  it("rejects invalid index documents and structured graph artifacts", () => {
    const valid = document("docs/alpha-router.md", "alpha router exact phrase");
    expect(() => createSimpleContextIndex([{ ...valid, digest: contextDigest("different") }])).toThrow(/digest/i);
    expect(() => createSimpleContextIndex([valid, valid])).toThrow(/duplicate/i);
    expect(() => createSimpleContextIndex([{ ...valid, redaction: "secret" } as unknown as ContextDocumentV1])).toThrow(/redaction/i);
    expect(createSimpleContextIndex([valid]).query("the and every", 5)).toEqual([]);
    expect(createSimpleContextIndex([valid]).query("alpha router", 5)[0]?.reasons).toEqual(expect.arrayContaining([
      "content:phrase",
      "path:phrase",
    ]));
    const malformedWorkflow = { ...document("workflow.json", "{"), kind: "workflow" };
    expect(() => createArtifactGraphIndex([malformedWorkflow])).toThrow(/valid JSON/i);
    const arrayWorkflow = { ...document("workflow.json", "[]"), kind: "workflow" };
    expect(() => createArtifactGraphIndex([arrayWorkflow])).toThrow(/JSON object/i);
    const duplicateKeyWorkflow = { ...document("workflow.json", '{"nodes":[],"nodes":[]}'), kind: "workflow" };
    expect(() => createArtifactGraphIndex([duplicateKeyWorkflow])).toThrow(/duplicate JSON object key/i);
    expect(() => evaluateContextQueries(createSimpleContextIndex([valid]), [], 5)).toThrow(/at least one/i);
  });

  it("keeps the previous graph atomically when a refresh candidate is invalid", () => {
    const original = document("docs/original.md", "alpha router");
    const index = createArtifactGraphIndex([original]);
    const malformedWorkflow = { ...document("workflow.json", "{"), kind: "workflow" };
    expect(() => index.refresh([malformedWorkflow])).toThrow(/valid JSON/i);
    expect(index.query("alpha router", 5)).toContainEqual(expect.objectContaining({
      path: original.path,
      digest: original.digest,
    }));
    expect(index.stats()).toMatchObject({ documents: 1, edges: 0 });
  });

  it("rejects a corpus path that traverses a symlinked directory", () => {
    const root = mkdtempSync(join(tmpdir(), "vcskill-context-symlink-root-"));
    const outside = mkdtempSync(join(tmpdir(), "vcskill-context-symlink-outside-"));
    roots.push(root, outside);
    writeFileSync(join(outside, "artifact.md"), "private outside bytes");
    mkdirSync(join(root, "corpus"));
    symlinkSync(outside, join(root, "corpus", "linked"), "dir");
    writeFileSync(join(root, "manifest.json"), JSON.stringify({
      schemaVersion: 1,
      id: "symlink-corpus",
      frozenAt: "2026-08-08T14:30:00.000Z",
      seed: 1,
      cacheStates: ["cold", "warm"],
      entries: [{ path: "corpus/linked/artifact.md", kind: "fixture", redaction: "public" }],
    }));
    expect(() => loadContextCorpus({ root, manifestPath: "manifest.json" })).toThrow(/symbolic link|regular file/i);
  });
});
