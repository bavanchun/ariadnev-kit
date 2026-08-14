import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseWorkflow, WorkflowValidationError } from "./parse-workflow.js";

const here = dirname(fileURLToPath(import.meta.url));
const workflowRoot = join(here, "..", "..", "..", "..", "kit", "workflows");
const schema = readFileSync(join(workflowRoot, "schema", "workflow.schema.json"), "utf8");
const names = ["read-only-delivery", "bugfix-delivery", "safe-change-delivery"] as const;

function raw(name: (typeof names)[number]): string {
  return readFileSync(join(workflowRoot, `${name}.json`), "utf8");
}

function document(name: (typeof names)[number]): Record<string, unknown> {
  return JSON.parse(raw(name)) as Record<string, unknown>;
}

function parseDocument(value: Record<string, unknown>, source = "fixture.json") {
  return parseWorkflow(JSON.stringify(value), source, schema);
}

describe("parseWorkflow", () => {
  it("parses all canonical workflows into provider-neutral V1 graphs", () => {
    for (const name of names) {
      const graph = parseWorkflow(raw(name), `${name}.json`, schema);
      expect(graph.schemaVersion).toBe(1);
      expect(graph.id).toBe(name);
      expect(graph.nodes.length).toBeGreaterThan(2);
      expect(graph.edges.length).toBeGreaterThan(1);
      expect(JSON.stringify(graph)).not.toMatch(/"(?:provider|runtime|model)"\s*:/);
      expect(graph.versions).toEqual({
        graph: "1.0.0",
        skills: "1.0.0",
        policy: "1.0.0",
        evaluator: "behavioral-v1",
      });
    }
  });

  it("rejects unknown fields and unsupported schema versions", () => {
    const graph = document("read-only-delivery");
    expect(() => parseDocument({ ...graph, provider: "codex" })).toThrow(/additional properties/i);
    expect(() => parseDocument({ ...graph, schemaVersion: 2 })).toThrow(/schemaVersion/);
  });

  it("rejects duplicate JSON keys and duplicate stable IDs", () => {
    expect(() => parseWorkflow('{"schemaVersion":1,"schemaVersion":1}', "duplicate.json", schema)).toThrow(
      /duplicate JSON object key: schemaVersion/,
    );
    const graph = document("read-only-delivery") as { nodes: Array<Record<string, unknown>> };
    graph.nodes[1].id = graph.nodes[0].id;
    expect(() => parseDocument(graph)).toThrow(/duplicate node id/);
  });

  it("requires state ownership and redaction on every field", () => {
    const graph = document("read-only-delivery") as {
      state: { fields: Array<Record<string, unknown>> };
    };
    delete graph.state.fields[0].redaction;
    expect(() => parseDocument(graph)).toThrow(/redaction/);
  });

  it("requires explicit authority and idempotency on side effects", () => {
    const graph = document("safe-change-delivery") as {
      nodes: Array<{ authority?: Record<string, unknown> }>;
    };
    const sideEffect = graph.nodes.find((node) => node.authority?.effect === "workspace");
    expect(sideEffect).toBeDefined();
    delete sideEffect?.authority?.idempotencyKey;
    expect(() => parseDocument(graph)).toThrow(/idempotencyKey/);

    const authorityGraph = document("safe-change-delivery") as {
      nodes: Array<{ authority: { effect: string; capabilities: string[] } }>;
    };
    const writeNode = authorityGraph.nodes.find((node) => node.authority.effect === "workspace")!;
    writeNode.authority.capabilities = writeNode.authority.capabilities.filter((item) => item !== "workspace:write");
    expect(() => parseDocument(authorityGraph)).toThrow(/lacks workspace:write authority/);
  });

  it("requires model-routed targets and fallback to resolve to outgoing edges", () => {
    const graph = document("safe-change-delivery") as {
      nodes: Array<{ routing?: Record<string, unknown> }>;
    };
    const routed = graph.nodes.find((node) => node.routing?.strategy === "model");
    expect(routed).toBeDefined();
    delete routed?.routing?.fallback;
    expect(() => parseDocument(graph)).toThrow(/fallback/);

    const targetGraph = document("safe-change-delivery") as {
      nodes: Array<{ routing?: { allowedTargets: string[]; fallback: string } }>;
    };
    const targetRoute = targetGraph.nodes.find((node) => node.routing)!;
    targetRoute.routing!.allowedTargets[0] = "missing-node";
    targetRoute.routing!.fallback = "missing-node";
    expect(() => parseDocument(targetGraph)).toThrow(/routing target does not resolve/);
  });

  it("rejects edge references, state owners, and handler kinds that do not resolve", () => {
    const graph = document("read-only-delivery") as {
      edges: Array<Record<string, unknown>>;
      state: { fields: Array<Record<string, unknown>> };
      nodes: Array<{ handler: Record<string, unknown> }>;
    };
    graph.edges[0].to = "missing-node";
    expect(() => parseDocument(graph)).toThrow(WorkflowValidationError);

    const ownerGraph = document("read-only-delivery") as {
      state: { fields: Array<Record<string, unknown>> };
    };
    ownerGraph.state.fields[0].owner = "missing-node";
    expect(() => parseDocument(ownerGraph)).toThrow(/state owner/);

    const handlerGraph = document("read-only-delivery") as {
      nodes: Array<{ type: string; handler: Record<string, unknown> }>;
    };
    handlerGraph.nodes[0].handler.kind = "tool";
    expect(() => parseDocument(handlerGraph)).toThrow(/handler kind/);
  });
});
