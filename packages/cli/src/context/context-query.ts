import { createHash } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { parseStrictJson } from "../eval/strict-json.js";

export type ContextRedactionV1 = "public" | "private";

export interface ContextDocumentV1 {
  readonly path: string;
  readonly kind: string;
  readonly redaction: ContextRedactionV1;
  readonly content: string;
  readonly digest: string;
}

export interface ContextCorpusManifestV1 {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly frozenAt: string;
  readonly seed: number;
  readonly cacheStates: readonly ["cold", "warm"];
  readonly entries: readonly ContextCorpusEntryV1[];
}

export interface ContextCorpusEntryV1 {
  readonly path: string;
  readonly kind: string;
  readonly redaction: ContextRedactionV1;
}

export interface ContextQueryCaseV1 {
  readonly id: string;
  readonly kind: "direct" | "relationship";
  readonly query: string;
  readonly relevance: readonly ContextRelevanceV1[];
  readonly requiredPaths: readonly string[];
}

export interface ContextRelevanceV1 {
  readonly path: string;
  readonly grade: 1 | 2 | 3;
}

export interface ContextQueryManifestV1 {
  readonly schemaVersion: 1;
  readonly corpusId: string;
  readonly seed: number;
  readonly topK: number;
  readonly cases: readonly ContextQueryCaseV1[];
}

export interface ContextResultV1 {
  readonly path: string;
  readonly kind: string;
  readonly digest: string;
  readonly score: number;
  readonly reasons: readonly string[];
  readonly excerpt: string;
}

export interface ContextIndexStatsV1 {
  readonly documents: number;
  readonly privateDocumentsExcluded: number;
  readonly indexBytes: number;
  readonly edges?: number;
}

export interface ContextIndexV1 {
  query(query: string, limit: number): readonly ContextResultV1[];
  refresh(documents: readonly ContextDocumentV1[]): void;
  stats(): ContextIndexStatsV1;
}

export interface ContextEvaluationV1 {
  readonly queryCount: number;
  readonly retrievalQuality: number;
  readonly taskSuccessRate: number;
  readonly provenanceRate: number;
  readonly meanContextTokens: number;
  readonly perQuery: readonly {
    readonly id: string;
    readonly retrievalQuality: number;
    readonly taskSucceeded: boolean;
    readonly contextTokens: number;
    readonly resultPaths: readonly string[];
  }[];
}

interface RankedDocument {
  readonly document: ContextDocumentV1;
  readonly score: number;
  readonly reasons: readonly string[];
}

interface LexicalDocument {
  readonly document: ContextDocumentV1;
  readonly contentTokens: ReadonlyMap<string, number>;
  readonly pathTokens: ReadonlySet<string>;
  readonly normalizedContent: string;
  readonly normalizedPath: string;
}

const STOP_WORDS = new Set([
  "a", "all", "and", "as", "be", "by", "connected", "contract", "contracts", "every",
  "for", "from", "in", "into", "invoked", "linked", "of", "on", "or", "retrieve",
  "the", "to", "with",
]);
const MAX_CORPUS_ENTRIES = 10_000;
const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024;
const MAX_QUERY_CASES = 10_000;

export function contextDigest(content: string): string {
  return `sha256:${createHash("sha256").update(content, "utf8").digest("hex")}`;
}

export function loadContextCorpus(options: {
  readonly root: string;
  readonly manifestPath: string;
}): {
  readonly manifest: ContextCorpusManifestV1;
  readonly documents: readonly ContextDocumentV1[];
  readonly corpusDigest: string;
} {
  const manifestFile = resolveSafeRegularFile(options.root, options.manifestPath, "context corpus manifest");
  const manifest = parseCorpusManifest(readFileSync(manifestFile, "utf8"), options.manifestPath);
  const documents = manifest.entries.map((entry) => {
    const file = resolveSafeRegularFile(options.root, entry.path, `context corpus entry ${entry.path}`);
    const stat = lstatSync(file);
    if (stat.size > MAX_DOCUMENT_BYTES) {
      throw new Error(`context corpus entry ${entry.path}: exceeds ${MAX_DOCUMENT_BYTES} bytes`);
    }
    const content = readFileSync(file, "utf8");
    return Object.freeze({ ...entry, content, digest: contextDigest(content) });
  });
  const corpusDigest = contextDigest(
    documents.map((entry) => `${entry.path}\0${entry.kind}\0${entry.redaction}\0${entry.digest}`).join("\n"),
  );
  return Object.freeze({ manifest, documents: Object.freeze(documents), corpusDigest });
}

export function loadContextQueries(options: {
  readonly root: string;
  readonly queriesPath: string;
  readonly corpusId: string;
  readonly corpusPaths: readonly string[];
}): {
  readonly manifest: ContextQueryManifestV1;
  readonly cases: readonly ContextQueryCaseV1[];
  readonly queryDigest: string;
} {
  const queryFile = resolveSafeRegularFile(options.root, options.queriesPath, "context query manifest");
  const source = readFileSync(queryFile, "utf8");
  const manifest = parseQueryManifest(source, options.queriesPath, options.corpusId, new Set(options.corpusPaths));
  return Object.freeze({ manifest, cases: manifest.cases, queryDigest: contextDigest(source) });
}

export function createSimpleContextIndex(initialDocuments: readonly ContextDocumentV1[]): ContextIndexV1 {
  let documents: readonly LexicalDocument[] = [];
  let privateDocumentsExcluded = 0;

  const refresh = (nextDocuments: readonly ContextDocumentV1[]): void => {
    const publicDocuments = validateIndexDocuments(nextDocuments);
    privateDocumentsExcluded = nextDocuments.length - publicDocuments.length;
    documents = Object.freeze(publicDocuments.map(toLexicalDocument));
  };

  refresh(initialDocuments);
  return Object.freeze({
    query(query: string, limit: number): readonly ContextResultV1[] {
      return lexicalQuery(documents, query, limit).map(toContextResult);
    },
    refresh,
    stats(): ContextIndexStatsV1 {
      return Object.freeze({
        documents: documents.length,
        privateDocumentsExcluded,
        indexBytes: documents.reduce((total, entry) => total + Buffer.byteLength(entry.document.content, "utf8"), 0),
      });
    },
  });
}

export function evaluateContextQueries(
  index: ContextIndexV1,
  cases: readonly ContextQueryCaseV1[],
  topK: number,
): ContextEvaluationV1 {
  assertInteger(topK, "topK", 1, 100);
  if (cases.length === 0) throw new Error("context evaluation requires at least one query case");
  let provenanceResults = 0;
  let totalResults = 0;
  const perQuery = cases.map((testCase) => {
    const results = index.query(testCase.query, topK);
    const grades = new Map(testCase.relevance.map((entry) => [entry.path, entry.grade]));
    const quality = normalizedDiscountedCumulativeGain(results, grades, topK);
    const resultPaths = results.map((entry) => entry.path);
    const resultPathSet = new Set(resultPaths);
    const taskSucceeded = testCase.requiredPaths.every((path) => resultPathSet.has(path));
    const contextTokens = results.reduce((total, entry) => total + estimateTokens(entry.excerpt), 0);
    totalResults += results.length;
    provenanceResults += results.filter(
      (entry) => isSafeRelativePath(entry.path) && /^sha256:[a-f0-9]{64}$/.test(entry.digest),
    ).length;
    return Object.freeze({
      id: testCase.id,
      retrievalQuality: quality,
      taskSucceeded,
      contextTokens,
      resultPaths: Object.freeze(resultPaths),
    });
  });

  return Object.freeze({
    queryCount: cases.length,
    retrievalQuality: mean(perQuery.map((entry) => entry.retrievalQuality)),
    taskSuccessRate: mean(perQuery.map((entry) => Number(entry.taskSucceeded))),
    provenanceRate: totalResults === 0 ? 0 : provenanceResults / totalResults,
    meanContextTokens: mean(perQuery.map((entry) => entry.contextTokens)),
    perQuery: Object.freeze(perQuery),
  });
}

function parseCorpusManifest(source: string, sourceName: string): ContextCorpusManifestV1 {
  const value = expectObject(parseStrictJson(source, sourceName), sourceName);
  assertExactKeys(value, ["schemaVersion", "id", "frozenAt", "seed", "cacheStates", "entries"], sourceName);
  if (value.schemaVersion !== 1) throw new Error(`${sourceName}: schemaVersion must be 1`);
  const id = expectIdentifier(value.id, `${sourceName}.id`);
  const frozenAt = expectCanonicalTimestamp(value.frozenAt, `${sourceName}.frozenAt`);
  const seed = expectInteger(value.seed, `${sourceName}.seed`, 0, Number.MAX_SAFE_INTEGER);
  const cacheStates = expectStringArray(value.cacheStates, `${sourceName}.cacheStates`);
  if (cacheStates.length !== 2 || cacheStates[0] !== "cold" || cacheStates[1] !== "warm") {
    throw new Error(`${sourceName}.cacheStates: must be exactly ["cold", "warm"]`);
  }
  if (!Array.isArray(value.entries) || value.entries.length === 0 || value.entries.length > MAX_CORPUS_ENTRIES) {
    throw new Error(`${sourceName}.entries: must contain 1-${MAX_CORPUS_ENTRIES} entries`);
  }
  const paths = new Set<string>();
  const entries = value.entries.map((candidate, index) => {
    const entryName = `${sourceName}.entries[${index}]`;
    const entry = expectObject(candidate, entryName);
    assertExactKeys(entry, ["path", "kind", "redaction"], entryName);
    const path = expectSafeRelativePath(entry.path, `${entryName}.path`);
    if (paths.has(path)) throw new Error(`${entryName}.path: duplicate path ${path}`);
    paths.add(path);
    const kind = expectIdentifier(entry.kind, `${entryName}.kind`);
    if (entry.redaction !== "public" && entry.redaction !== "private") {
      throw new Error(`${entryName}.redaction: must be public or private`);
    }
    return Object.freeze({ path, kind, redaction: entry.redaction });
  });
  return Object.freeze({
    schemaVersion: 1,
    id,
    frozenAt,
    seed,
    cacheStates: Object.freeze(["cold", "warm"] as const),
    entries: Object.freeze(entries),
  });
}

function parseQueryManifest(
  source: string,
  sourceName: string,
  corpusId: string,
  corpusPaths: ReadonlySet<string>,
): ContextQueryManifestV1 {
  const value = expectObject(parseStrictJson(source, sourceName), sourceName);
  assertExactKeys(value, ["schemaVersion", "corpusId", "seed", "topK", "cases"], sourceName);
  if (value.schemaVersion !== 1) throw new Error(`${sourceName}: schemaVersion must be 1`);
  if (value.corpusId !== corpusId) throw new Error(`${sourceName}.corpusId: expected ${corpusId}`);
  const seed = expectInteger(value.seed, `${sourceName}.seed`, 0, Number.MAX_SAFE_INTEGER);
  const topK = expectInteger(value.topK, `${sourceName}.topK`, 1, 100);
  if (!Array.isArray(value.cases) || value.cases.length === 0 || value.cases.length > MAX_QUERY_CASES) {
    throw new Error(`${sourceName}.cases: must contain 1-${MAX_QUERY_CASES} cases`);
  }
  const ids = new Set<string>();
  const cases = value.cases.map((candidate, index) => {
    const caseName = `${sourceName}.cases[${index}]`;
    const testCase = expectObject(candidate, caseName);
    assertExactKeys(testCase, ["id", "kind", "query", "relevance", "requiredPaths"], caseName);
    const id = expectIdentifier(testCase.id, `${caseName}.id`, true);
    if (ids.has(id)) throw new Error(`${caseName}.id: duplicate id ${id}`);
    ids.add(id);
    if (testCase.kind !== "direct" && testCase.kind !== "relationship") {
      throw new Error(`${caseName}.kind: must be direct or relationship`);
    }
    const query = expectNonEmptyString(testCase.query, `${caseName}.query`, 500);
    if (!Array.isArray(testCase.relevance) || testCase.relevance.length === 0) {
      throw new Error(`${caseName}.relevance: must not be empty`);
    }
    const relevancePaths = new Set<string>();
    const relevance = testCase.relevance.map((relevanceCandidate, relevanceIndex) => {
      const relevanceName = `${caseName}.relevance[${relevanceIndex}]`;
      const entry = expectObject(relevanceCandidate, relevanceName);
      assertExactKeys(entry, ["path", "grade"], relevanceName);
      const path = expectCorpusPath(entry.path, `${relevanceName}.path`, corpusPaths);
      if (relevancePaths.has(path)) throw new Error(`${relevanceName}.path: duplicate path ${path}`);
      relevancePaths.add(path);
      const grade = expectInteger(entry.grade, `${relevanceName}.grade`, 1, 3) as 1 | 2 | 3;
      return Object.freeze({ path, grade });
    });
    const requiredPaths = expectStringArray(testCase.requiredPaths, `${caseName}.requiredPaths`).map((path, pathIndex) => {
      const corpusPath = expectCorpusPath(path, `${caseName}.requiredPaths[${pathIndex}]`, corpusPaths);
      if (!relevancePaths.has(corpusPath)) {
        throw new Error(`${caseName}.requiredPaths[${pathIndex}]: must also have a relevance label`);
      }
      return corpusPath;
    });
    if (requiredPaths.length === 0 || new Set(requiredPaths).size !== requiredPaths.length) {
      throw new Error(`${caseName}.requiredPaths: must be non-empty and unique`);
    }
    return Object.freeze({ id, kind: testCase.kind, query, relevance: Object.freeze(relevance), requiredPaths: Object.freeze(requiredPaths) });
  });
  return Object.freeze({ schemaVersion: 1, corpusId, seed, topK, cases: Object.freeze(cases) });
}

function validateIndexDocuments(documents: readonly ContextDocumentV1[]): readonly ContextDocumentV1[] {
  const paths = new Set<string>();
  return documents.filter((document, index) => {
    const name = `context documents[${index}]`;
    expectSafeRelativePath(document.path, `${name}.path`);
    expectIdentifier(document.kind, `${name}.kind`);
    if (document.redaction !== "public" && document.redaction !== "private") {
      throw new Error(`${name}.redaction: must be public or private`);
    }
    if (paths.has(document.path)) throw new Error(`${name}.path: duplicate path ${document.path}`);
    paths.add(document.path);
    if (contextDigest(document.content) !== document.digest) throw new Error(`${name}.digest: content digest mismatch`);
    return document.redaction === "public";
  });
}

function toLexicalDocument(document: ContextDocumentV1): LexicalDocument {
  const contentTokens = tokenCounts(`${document.kind} ${document.content}`);
  const pathTokens = new Set(tokenize(document.path));
  return Object.freeze({
    document,
    contentTokens,
    pathTokens,
    normalizedContent: normalizeText(document.content),
    normalizedPath: normalizeText(document.path),
  });
}

function lexicalQuery(documents: readonly LexicalDocument[], query: string, limit: number): readonly RankedDocument[] {
  assertInteger(limit, "context query limit", 1, 1000);
  const normalizedQuery = normalizeText(expectNonEmptyString(query, "context query", 2_000));
  const queryTokens = [...new Set(tokenize(query).filter((token) => !STOP_WORDS.has(token)))];
  if (queryTokens.length === 0) return Object.freeze([]);
  const documentFrequency = new Map<string, number>();
  for (const token of queryTokens) {
    documentFrequency.set(token, documents.filter((entry) => entry.contentTokens.has(token) || entry.pathTokens.has(token)).length);
  }
  const ranked = documents.flatMap((entry): RankedDocument[] => {
    let score = 0;
    const reasons: string[] = [];
    for (const token of queryTokens) {
      const frequency = entry.contentTokens.get(token) ?? 0;
      const pathHit = entry.pathTokens.has(token);
      if (frequency === 0 && !pathHit) continue;
      const inverseFrequency = Math.log(1 + (documents.length + 1) / ((documentFrequency.get(token) ?? 0) + 1));
      if (frequency > 0) {
        score += inverseFrequency * (1 + Math.log(frequency));
        reasons.push(`content:${token}`);
      }
      if (pathHit) {
        score += inverseFrequency * 2.5;
        reasons.push(`path:${token}`);
      }
    }
    if (normalizedQuery.length >= 8 && entry.normalizedContent.includes(normalizedQuery)) {
      score += 4;
      reasons.push("content:phrase");
    }
    if (normalizedQuery.length >= 4 && entry.normalizedPath.includes(normalizedQuery.replaceAll(" ", "-"))) {
      score += 6;
      reasons.push("path:phrase");
    }
    return score === 0 ? [] : [Object.freeze({ document: entry.document, score, reasons: Object.freeze(reasons) })];
  });
  return Object.freeze(ranked.sort(compareRankedDocuments).slice(0, limit));
}

function toContextResult(entry: RankedDocument): ContextResultV1 {
  return Object.freeze({
    path: entry.document.path,
    kind: entry.document.kind,
    digest: entry.document.digest,
    score: Number(entry.score.toFixed(9)),
    reasons: entry.reasons,
    excerpt: boundedExcerpt(entry.document.content),
  });
}

function compareRankedDocuments(left: RankedDocument, right: RankedDocument): number {
  return right.score - left.score || left.document.path.localeCompare(right.document.path);
}

function normalizedDiscountedCumulativeGain(
  results: readonly ContextResultV1[],
  grades: ReadonlyMap<string, number>,
  topK: number,
): number {
  const dcg = results.slice(0, topK).reduce((total, result, index) => {
    const grade = grades.get(result.path) ?? 0;
    return total + (2 ** grade - 1) / Math.log2(index + 2);
  }, 0);
  const ideal = [...grades.values()].sort((left, right) => right - left).slice(0, topK).reduce(
    (total, grade, index) => total + (2 ** grade - 1) / Math.log2(index + 2),
    0,
  );
  return ideal === 0 ? 0 : dcg / ideal;
}

function boundedExcerpt(content: string): string {
  const normalized = content.replace(/\s+/g, " ").trim();
  return normalized.length <= 360 ? normalized : `${normalized.slice(0, 357)}...`;
}

function estimateTokens(content: string): number {
  return Math.max(1, Math.ceil(content.length / 4));
}

function tokenCounts(content: string): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const token of tokenize(content)) counts.set(token, (counts.get(token) ?? 0) + 1);
  return counts;
}

function tokenize(content: string): readonly string[] {
  return normalizeText(content).match(/[\p{L}\p{N}]+/gu) ?? [];
}

function normalizeText(content: string): string {
  return content.normalize("NFKC").toLocaleLowerCase("en-US");
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function resolveSafeRegularFile(root: string, requestedPath: string, label: string): string {
  const safePath = expectSafeRelativePath(requestedPath, label);
  const absoluteRoot = resolve(root);
  const target = resolve(absoluteRoot, safePath);
  const relativeTarget = relative(absoluteRoot, target);
  if (relativeTarget.startsWith("..") || isAbsolute(relativeTarget)) throw new Error(`${label}: escapes the corpus root`);
  let current = absoluteRoot;
  for (const component of safePath.split("/")) {
    current = join(current, component);
    let componentStat;
    try {
      componentStat = lstatSync(current);
    } catch {
      throw new Error(`${label}: ${safePath} is missing or unavailable`);
    }
    if (componentStat.isSymbolicLink()) throw new Error(`${label}: ${safePath} traverses a symbolic link`);
  }
  if (!lstatSync(target).isFile()) throw new Error(`${label}: ${safePath} must be a regular file`);
  return target;
}

function isSafeRelativePath(value: string): boolean {
  return value.length > 0
    && value.length <= 1_000
    && !isAbsolute(value)
    && !value.includes("\\")
    && !value.includes("\0")
    && value.split("/").every((part) => part !== "" && part !== "." && part !== "..");
}

function expectSafeRelativePath(value: unknown, label: string): string {
  if (typeof value !== "string" || !isSafeRelativePath(value)) throw new Error(`${label}: must be a safe relative path`);
  return value;
}

function expectCorpusPath(value: unknown, label: string, corpusPaths: ReadonlySet<string>): string {
  const path = expectSafeRelativePath(value, label);
  if (!corpusPaths.has(path)) throw new Error(`${label}: ${path} is not in the frozen corpus`);
  return path;
}

function expectObject(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label}: must be an object`);
  return value as Record<string, unknown>;
}

function assertExactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  const expectedKeys = new Set(expected);
  const unknown = Object.keys(value).filter((key) => !expectedKeys.has(key));
  const missing = expected.filter((key) => !(key in value));
  if (unknown.length > 0 || missing.length > 0) {
    throw new Error(`${label}: keys mismatch (missing: ${missing.join(", ") || "none"}; unknown: ${unknown.join(", ") || "none"})`);
  }
}

function expectIdentifier(value: unknown, label: string, allowDot = false): string {
  const pattern = allowDot ? /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/ : /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  if (typeof value !== "string" || value.length > 200 || !pattern.test(value)) {
    throw new Error(`${label}: must be a lowercase identifier`);
  }
  return value;
}

function expectNonEmptyString(value: unknown, label: string, maximumLength: number): string {
  if (typeof value !== "string" || value.trim() === "" || value.length > maximumLength) {
    throw new Error(`${label}: must be a non-empty string up to ${maximumLength} characters`);
  }
  return value;
}

function expectStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
    throw new Error(`${label}: must be a string array`);
  }
  return value;
}

function expectInteger(value: unknown, label: string, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new Error(`${label}: must be an integer between ${minimum} and ${maximum}`);
  }
  return value as number;
}

function assertInteger(value: unknown, label: string, minimum: number, maximum: number): asserts value is number {
  expectInteger(value, label, minimum, maximum);
}

function expectCanonicalTimestamp(value: unknown, label: string): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value)) || new Date(value).toISOString() !== value) {
    throw new Error(`${label}: must be a canonical ISO-8601 timestamp`);
  }
  return value;
}
