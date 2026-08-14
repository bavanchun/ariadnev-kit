import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { performance } from "node:perf_hooks";
import { createArtifactGraphIndex } from "../src/context/artifact-index.ts";
import {
  contextDigest,
  createSimpleContextIndex,
  evaluateContextQueries,
  loadContextCorpus,
  loadContextQueries,
} from "../src/context/context-query.ts";

const WARMUPS = 10;
const COLD_REPEATS = 30;
const WARM_REPEATS = 100;
const root = process.cwd();
const corpus = loadContextCorpus({ root, manifestPath: "evals/context/corpus-manifest.json" });
const queries = loadContextQueries({
  root,
  queriesPath: "evals/context/queries.json",
  corpusId: corpus.manifest.id,
  corpusPaths: corpus.documents.map((entry) => entry.path),
});

const strategies = {
  baseline: () => createSimpleContextIndex(corpus.documents),
  candidate: () => createArtifactGraphIndex(corpus.documents),
};

function percentile(samples, quantile) {
  const sorted = [...samples].sort((left, right) => left - right);
  return sorted[Math.floor((sorted.length - 1) * quantile)] ?? 0;
}

function distribution(samples) {
  return {
    samples: samples.length,
    p50Ms: Number(percentile(samples, 0.5).toFixed(6)),
    p95Ms: Number(percentile(samples, 0.95).toFixed(6)),
    maxMs: Number(Math.max(...samples).toFixed(6)),
  };
}

function benchmark(factory) {
  for (let repeat = 0; repeat < WARMUPS; repeat += 1) {
    const index = factory();
    for (const testCase of queries.cases) index.query(testCase.query, queries.manifest.topK);
  }

  const coldBuildSamples = [];
  const coldQuerySamples = [];
  for (let repeat = 0; repeat < COLD_REPEATS; repeat += 1) {
    const buildStarted = performance.now();
    const index = factory();
    coldBuildSamples.push(performance.now() - buildStarted);
    for (const testCase of queries.cases) {
      const queryStarted = performance.now();
      index.query(testCase.query, queries.manifest.topK);
      coldQuerySamples.push(performance.now() - queryStarted);
    }
  }

  const warmIndex = factory();
  const warmQuerySamples = [];
  for (let repeat = 0; repeat < WARM_REPEATS; repeat += 1) {
    for (const testCase of queries.cases) {
      const queryStarted = performance.now();
      warmIndex.query(testCase.query, queries.manifest.topK);
      warmQuerySamples.push(performance.now() - queryStarted);
    }
  }
  return {
    cold: { indexBuild: distribution(coldBuildSamples), query: distribution(coldQuerySamples) },
    warm: { query: distribution(warmQuerySamples) },
  };
}

function fixture(path, content, redaction = "public") {
  return { path, kind: "fixture", redaction, content, digest: contextDigest(content) };
}

function verifyInvalidation() {
  const first = fixture("docs/first.md", "alpha owns the router");
  const linked = fixture("docs/linked.md", "See vc:first for routing context");
  const secret = fixture("private/secret.md", "alpha private credential", "private");
  const index = createArtifactGraphIndex([first, linked, secret]);
  const privateExcluded = !index.query("private credential", 10).some((entry) => entry.path === secret.path);
  const originalProvenance = index.query("alpha router", 10).some(
    (entry) => entry.path === first.path && entry.digest === first.digest,
  );

  const updated = fixture(first.path, "beta owns the parser");
  index.refresh([updated, linked, secret]);
  const freshness = !index.query("alpha router", 10).some((entry) => entry.path === first.path)
    && index.query("beta parser", 10).some((entry) => entry.path === first.path && entry.digest === updated.digest);
  index.refresh([linked, secret]);
  const deletion = !index.query("beta parser", 10).some((entry) => entry.path === first.path)
    && index.stats().documents === 1;
  return { privateExcluded, originalProvenance, freshness, deletion };
}

const baselineIndex = strategies.baseline();
const candidateIndex = strategies.candidate();
const baselineEvaluation = evaluateContextQueries(baselineIndex, queries.cases, queries.manifest.topK);
const candidateEvaluation = evaluateContextQueries(candidateIndex, queries.cases, queries.manifest.topK);
const baselineLatency = benchmark(strategies.baseline);
const candidateLatency = benchmark(strategies.candidate);
const invalidation = verifyInvalidation();
const qualityGain = candidateEvaluation.retrievalQuality - baselineEvaluation.retrievalQuality;
const taskGain = candidateEvaluation.taskSuccessRate - baselineEvaluation.taskSuccessRate;
const gates = {
  materialGain: qualityGain >= 0.1 || taskGain >= 0.05,
  noTaskSuccessRegression: candidateEvaluation.taskSuccessRate >= baselineEvaluation.taskSuccessRate,
  provenance: candidateEvaluation.provenanceRate === 1 && invalidation.originalProvenance,
  freshness: invalidation.freshness,
  deletion: invalidation.deletion,
  privacy: invalidation.privateExcluded,
  candidateP95Under500Ms: candidateLatency.cold.query.p95Ms < 500 && candidateLatency.warm.query.p95Ms < 500,
};
const passed = Object.values(gates).every(Boolean);
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  environment: {
    platform: process.platform,
    arch: process.arch,
    runtime: process.versions.bun ? `bun-${process.versions.bun}` : `node-${process.version}`,
    providerVariance: {
      applicable: false,
      reason: "Retrieval and deterministic required-path tasks run locally without a model provider.",
    },
  },
  frozenInputs: {
    corpusId: corpus.manifest.id,
    corpusDigest: corpus.corpusDigest,
    queryDigest: queries.queryDigest,
    frozenAt: corpus.manifest.frozenAt,
    seed: corpus.manifest.seed,
    documents: corpus.documents.length,
    queries: queries.cases.length,
    topK: queries.manifest.topK,
    cacheStates: corpus.manifest.cacheStates,
    warmups: WARMUPS,
    coldRepeats: COLD_REPEATS,
    warmRepeats: WARM_REPEATS,
  },
  implementation: {
    simpleIndexDigest: contextDigest(readFileSync(join(root, "packages/cli/src/context/context-query.ts"), "utf8")),
    artifactGraphDigest: contextDigest(readFileSync(join(root, "packages/cli/src/context/artifact-index.ts"), "utf8")),
    benchmarkDigest: contextDigest(readFileSync(join(root, "packages/cli/scripts/benchmark-context.mjs"), "utf8")),
  },
  strategies: {
    baseline: {
      name: "local lexical metadata index",
      evaluation: baselineEvaluation,
      latency: baselineLatency,
      index: baselineIndex.stats(),
      externalDependencies: [],
    },
    candidate: {
      name: "deterministic artifact relationship graph plus lexical index",
      evaluation: candidateEvaluation,
      latency: candidateLatency,
      index: candidateIndex.stats(),
      externalDependencies: [],
    },
  },
  comparison: {
    retrievalQualityGainPoints: Number((qualityGain * 100).toFixed(4)),
    taskSuccessGainPoints: Number((taskGain * 100).toFixed(4)),
    meanContextTokenDelta: Number((candidateEvaluation.meanContextTokens - baselineEvaluation.meanContextTokens).toFixed(4)),
    candidateIndexByteDelta: candidateIndex.stats().indexBytes - baselineIndex.stats().indexBytes,
    invalidation,
  },
  semanticPrototype: passed
    ? { status: "not-run", reason: "The dependency-free artifact graph cleared the material-gain gate." }
    : { status: "not-run", reason: "No semantic store was added without a separate privacy, purge, and complexity case." },
  gates: { ...gates, passed },
  decision: passed ? "adopt-deterministic-artifact-graph" : "retain-simple-index",
  rollback: "Remove the artifact graph layer and instantiate the retained local lexical metadata index against the same corpus contract.",
};

const output = `${JSON.stringify(report, null, 2)}\n`;
if (process.argv.includes("--write")) {
  const outputPath = join(root, "evals/reports/context-graph-benchmark.json");
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, output, { encoding: "utf8", mode: 0o644 });
}
process.stdout.write(output);
if (!passed) process.exitCode = 1;
