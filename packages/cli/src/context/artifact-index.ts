import { posix } from "node:path";
import {
  createSimpleContextIndex,
  type ContextDocumentV1,
  type ContextIndexStatsV1,
  type ContextIndexV1,
  type ContextResultV1,
} from "./context-query.js";
import { parseStrictJson } from "../eval/strict-json.js";

interface ArtifactEdgeV1 {
  readonly left: string;
  readonly right: string;
  readonly type: "document-link" | "scenario-subject" | "skill-reference" | "workflow-handler";
}

const RELATIONSHIP_TERMS = /\b(connected|contracts?|every|handler|invoked|linked|subjects?)\b/i;

export function createArtifactGraphIndex(initialDocuments: readonly ContextDocumentV1[]): ContextIndexV1 {
  let lexicalIndex = createSimpleContextIndex([]);
  let documents = new Map<string, ContextDocumentV1>();
  let adjacency = new Map<string, readonly ArtifactEdgeV1[]>();
  let edgeCount = 0;
  let privateDocumentsExcluded = 0;

  const refresh = (nextDocuments: readonly ContextDocumentV1[]): void => {
    const nextLexicalIndex = createSimpleContextIndex(nextDocuments);
    const nextPrivateDocumentsExcluded = nextLexicalIndex.stats().privateDocumentsExcluded;
    const publicPaths = new Set(
      nextDocuments.filter((entry) => entry.redaction === "public").map((entry) => entry.path),
    );
    const nextDocumentMap = new Map(
      nextDocuments
        .filter((entry) => publicPaths.has(entry.path))
        .map((entry) => [entry.path, entry]),
    );
    const edges = discoverArtifactEdges([...nextDocumentMap.values()]);
    const mutableAdjacency = new Map<string, ArtifactEdgeV1[]>();
    for (const edge of edges) {
      appendEdge(mutableAdjacency, edge.left, edge);
      appendEdge(mutableAdjacency, edge.right, edge);
    }
    const nextAdjacency = new Map([...mutableAdjacency].map(([path, pathEdges]) => [path, Object.freeze(pathEdges)]));
    lexicalIndex = nextLexicalIndex;
    privateDocumentsExcluded = nextPrivateDocumentsExcluded;
    documents = nextDocumentMap;
    edgeCount = edges.length;
    adjacency = nextAdjacency;
  };

  refresh(initialDocuments);
  return Object.freeze({
    query(query: string, limit: number): readonly ContextResultV1[] {
      const lexicalResults = lexicalIndex.query(query, Math.max(limit, documents.size));
      if (lexicalResults.length === 0) return Object.freeze([]);
      const maxLexicalScore = lexicalResults[0]?.score ?? 1;
      const scores = new Map<string, { score: number; reasons: Set<string> }>();
      for (const result of lexicalResults) {
        scores.set(result.path, {
          score: result.score / maxLexicalScore,
          reasons: new Set(result.reasons),
        });
      }

      const relationWeight = RELATIONSHIP_TERMS.test(query) ? 1.2 : 0.45;
      for (const seed of lexicalResults.slice(0, 4)) {
        const normalizedSeedScore = seed.score / maxLexicalScore;
        for (const edge of adjacency.get(seed.path) ?? []) {
          const neighborPath = edge.left === seed.path ? edge.right : edge.left;
          const neighbor = documents.get(neighborPath);
          if (!neighbor) continue;
          const graphScore = relationWeight * normalizedSeedScore;
          const current = scores.get(neighborPath) ?? { score: 0, reasons: new Set<string>() };
          current.score += graphScore;
          current.reasons.add(`graph:${edge.type}:${seed.path}`);
          scores.set(neighborPath, current);
        }
      }

      return Object.freeze(
        [...scores]
          .map(([path, score]) => {
            const document = documents.get(path);
            if (!document) throw new Error(`artifact graph index lost document provenance for ${path}`);
            return Object.freeze({
              path,
              kind: document.kind,
              digest: document.digest,
              score: Number(score.score.toFixed(9)),
              reasons: Object.freeze([...score.reasons].sort()),
              excerpt: boundedExcerpt(document.content),
            });
          })
          .sort((left, right) => right.score - left.score || left.path.localeCompare(right.path))
          .slice(0, limit),
      );
    },
    refresh,
    stats(): ContextIndexStatsV1 {
      return Object.freeze({
        documents: documents.size,
        privateDocumentsExcluded,
        indexBytes: lexicalIndex.stats().indexBytes + edgeCount * 96,
        edges: edgeCount,
      });
    },
  });
}

function discoverArtifactEdges(documents: readonly ContextDocumentV1[]): readonly ArtifactEdgeV1[] {
  const aliases = buildAliases(documents);
  const paths = new Set(documents.map((entry) => entry.path));
  const edges = new Map<string, ArtifactEdgeV1>();
  const add = (left: string, right: string | undefined, type: ArtifactEdgeV1["type"]): void => {
    if (!right || left === right || !paths.has(right)) return;
    const ordered = left.localeCompare(right) <= 0 ? [left, right] : [right, left];
    const edge = Object.freeze({ left: ordered[0]!, right: ordered[1]!, type });
    edges.set(`${edge.left}\0${edge.right}\0${type}`, edge);
  };

  for (const document of documents) {
    if (document.kind === "workflow") {
      const workflow = parseArtifactObject(document);
      const nodes = Array.isArray(workflow.nodes) ? workflow.nodes : [];
      for (const node of nodes) {
        const record = asObject(node);
        const handler = asObject(record?.handler);
        const kind = handler?.kind;
        const ref = handler?.ref;
        if ((kind === "skill" || kind === "agent") && typeof ref === "string") {
          add(document.path, aliases.get(`${kind}:${ref}`), "workflow-handler");
        }
      }
    }

    if (document.kind === "scenario") {
      const scenario = parseArtifactObject(document);
      const subjects = asObject(scenario.subjects);
      const skills = Array.isArray(subjects?.skills) ? subjects.skills : [];
      for (const skill of skills) {
        if (typeof skill === "string") add(document.path, aliases.get(`skill:${skill}`), "scenario-subject");
      }
    }

    if (document.kind === "skill" || document.kind === "agent" || document.kind === "architecture" || document.kind === "decision") {
      for (const reference of document.content.match(/\bvc:[a-z0-9]+(?:-[a-z0-9]+)*\b/g) ?? []) {
        add(document.path, aliases.get(`skill:${reference}`), "skill-reference");
      }
      for (const link of markdownLinks(document.content)) {
        const target = posix.normalize(posix.join(posix.dirname(document.path), link));
        if (!target.startsWith("../") && target !== "..") add(document.path, target, "document-link");
      }
    }
  }
  return Object.freeze([...edges.values()].sort(compareEdges));
}

function buildAliases(documents: readonly ContextDocumentV1[]): ReadonlyMap<string, string> {
  const aliases = new Map<string, string>();
  for (const document of documents) {
    const skillMatch = /^kit\/skills\/([^/]+)\/SKILL\.md$/.exec(document.path);
    if (skillMatch) {
      aliases.set(`skill:${skillMatch[1]}`, document.path);
      aliases.set(`skill:vc:${skillMatch[1]}`, document.path);
    }
    const agentMatch = /^kit\/agents\/([^/]+)\.md$/.exec(document.path);
    if (agentMatch) aliases.set(`agent:${agentMatch[1]}`, document.path);
  }
  return aliases;
}

function parseArtifactObject(document: ContextDocumentV1): Record<string, unknown> {
  const value = parseStrictJson(document.content, `artifact graph document ${document.path}`);
  const record = asObject(value);
  if (!record) throw new Error(`artifact graph document ${document.path}: must contain a JSON object`);
  return record;
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function markdownLinks(content: string): readonly string[] {
  const links: string[] = [];
  for (const match of content.matchAll(/\[[^\]]*\]\(([^)#?]+)(?:[)#?][^)]*)?\)/g)) {
    const link = match[1]?.trim();
    if (link && !link.includes(":") && !link.startsWith("/")) links.push(link);
  }
  return links;
}

function appendEdge(adjacency: Map<string, ArtifactEdgeV1[]>, path: string, edge: ArtifactEdgeV1): void {
  const current = adjacency.get(path) ?? [];
  current.push(edge);
  adjacency.set(path, current);
}

function compareEdges(left: ArtifactEdgeV1, right: ArtifactEdgeV1): number {
  return left.left.localeCompare(right.left) || left.right.localeCompare(right.right) || left.type.localeCompare(right.type);
}

function boundedExcerpt(content: string): string {
  const normalized = content.replace(/\s+/g, " ").trim();
  return normalized.length <= 360 ? normalized : `${normalized.slice(0, 357)}...`;
}
