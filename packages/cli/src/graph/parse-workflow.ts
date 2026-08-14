import Ajv2020, { type ErrorObject } from "ajv/dist/2020.js";
import { parseStrictJson } from "../eval/strict-json.js";
import type { GraphIRV1, GraphNodeV1 } from "./graph-types.js";

export class WorkflowValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowValidationError";
  }
}

function fail(source: string, message: string): never {
  throw new WorkflowValidationError(`${source}: ${message}`);
}

function schemaErrors(errors: ErrorObject[] | null | undefined): string {
  return (errors ?? [])
    .map((error) => `${error.instancePath || "/"} ${error.message ?? error.keyword}`)
    .join("; ");
}

type WorkflowValidator = ReturnType<Ajv2020["compile"]>;
let cachedSchema: { input: string; validate: WorkflowValidator } | undefined;

function validatorFor(schemaInput: string): WorkflowValidator {
  if (cachedSchema?.input === schemaInput) return cachedSchema.validate;
  let schema: object;
  try {
    schema = parseStrictJson(schemaInput, "workflow.schema.json") as object;
  } catch (error) {
    throw new WorkflowValidationError(String(error instanceof Error ? error.message : error));
  }
  try {
    const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
    cachedSchema = { input: schemaInput, validate };
    return validate;
  } catch (error) {
    fail("workflow.schema.json", `invalid schema (${String(error)})`);
  }
}

function unique(values: string[], label: string, source: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) fail(source, `duplicate ${label}: ${value}`);
    seen.add(value);
  }
}

function validateAuthority(node: GraphNodeV1, source: string): void {
  const authority = node.authority;
  if (authority.effect !== "none") {
    if (authority.idempotency !== "required" || !authority.idempotencyKey) {
      fail(source, `side-effect node ${node.id} requires idempotencyKey`);
    }
    const capability = authority.effect === "workspace" ? "workspace:write" : "external:mutate";
    if (!authority.capabilities.includes(capability)) {
      fail(source, `side-effect node ${node.id} lacks ${capability} authority`);
    }
  } else if (authority.idempotencyKey) {
    fail(source, `node ${node.id} cannot declare idempotencyKey without an effect`);
  }
}

function validateSemantics(graph: GraphIRV1, source: string): void {
  unique(graph.nodes.map((node) => node.id), "node id", source);
  unique(graph.edges.map((edge) => edge.id), "edge id", source);
  unique(graph.state.fields.map((field) => field.name), "state field", source);

  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const fields = new Set(graph.state.fields.map((field) => field.name));
  if (!nodes.has(graph.entry)) fail(source, `entry node does not resolve: ${graph.entry}`);

  for (const field of graph.state.fields) {
    if (!nodes.has(field.owner)) fail(source, `state owner does not resolve: ${field.owner}`);
    if (["provider", "runtime", "model"].includes(field.name)) {
      fail(source, `provider details are outside Graph IR: ${field.name}`);
    }
  }

  for (const node of graph.nodes) {
    if (node.handler.kind !== node.type) fail(source, `handler kind must match node type: ${node.id}`);
    for (const field of [...node.state.reads, ...node.state.writes]) {
      if (!fields.has(field)) fail(source, `node ${node.id} references unknown state field: ${field}`);
    }
    validateAuthority(node, source);
  }

  for (const edge of graph.edges) {
    if (!nodes.has(edge.from)) fail(source, `edge ${edge.id} source does not resolve: ${edge.from}`);
    if (!nodes.has(edge.to)) fail(source, `edge ${edge.id} target does not resolve: ${edge.to}`);
    if (edge.condition && !fields.has(edge.condition.field)) {
      fail(source, `edge ${edge.id} references unknown state field: ${edge.condition.field}`);
    }
  }

  for (const node of graph.nodes) {
    if (!node.routing) continue;
    unique(node.routing.allowedTargets, `routing target on ${node.id}`, source);
    const outgoing = new Set(graph.edges.filter((edge) => edge.from === node.id).map((edge) => edge.to));
    for (const target of node.routing.allowedTargets) {
      if (!nodes.has(target) || !outgoing.has(target)) fail(source, `routing target does not resolve from ${node.id}: ${target}`);
    }
    if (!node.routing.allowedTargets.includes(node.routing.fallback)) {
      fail(source, `routing fallback must be an allowed target on ${node.id}`);
    }
  }
}

export function parseWorkflow(input: string, source: string, schemaInput: string): GraphIRV1 {
  let document: unknown;
  try {
    document = parseStrictJson(input, source);
  } catch (error) {
    if (error instanceof WorkflowValidationError) throw error;
    throw new WorkflowValidationError(String(error instanceof Error ? error.message : error));
  }

  const validate = validatorFor(schemaInput);
  if (!validate(document)) fail(source, `schema validation failed: ${schemaErrors(validate.errors)}`);
  const graph = document as GraphIRV1;
  validateSemantics(graph, source);
  return graph;
}
