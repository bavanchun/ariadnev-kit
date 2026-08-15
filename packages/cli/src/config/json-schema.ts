// JSON Schema for editors, derived from the TypeScript definition rather than
// written beside it. A hand-kept second copy drifts; here the only way to change
// the schema is to change the definition and regenerate, and a test compares the
// checked-in file with the generator output.
//
// Host allowlisting for notification destinations is NOT expressed here — it
// lives in `checkValue` so there is one rule, not a regex and a function that
// can disagree. The description says so, and the exported schema stays an aid
// rather than a second authority.

import { SCHEMA, type LeafSpec, type SchemaBranch, type SchemaNode } from "./config-schema.js";

/** Where the generated schema is checked in, relative to the repo root. */
export const SCHEMA_FILE_RELATIVE = "schemas/av-config.schema.json";

export const SCHEMA_ID = "https://ariadnev.com/schemas/av-config.schema.json";

function isLeaf(node: SchemaNode): node is LeafSpec {
  return (node as LeafSpec).kind === "leaf";
}

function leafSchema(spec: LeafSpec): Record<string, unknown> {
  const base = spec.type === "integer" ? "integer" : spec.type === "boolean" ? "boolean" : spec.type === "string[]" ? "array" : "string";
  const out: Record<string, unknown> = {
    type: spec.nullable ? [base, "null"] : base,
    description: spec.type === "webhook" ? `${spec.describe} Must be an https URL on an allowlisted host.` : spec.describe,
    default: spec.default,
    "x-ariadnev-layer": spec.layer,
  };
  if (spec.type === "string[]") out.items = { type: "string" };
  if (spec.enum) out.enum = [...spec.enum];
  if (spec.sensitive) out["x-ariadnev-sensitive"] = true;
  return out;
}

function branchSchema(node: SchemaBranch): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(node)) {
    properties[key] = isLeaf(child) ? leafSchema(child) : branchSchema(child);
  }
  return { type: "object", additionalProperties: false, properties };
}

export function buildJsonSchema(): Record<string, unknown> {
  return {
    $schema: "http://json-schema.org/draft-07/schema#",
    $id: SCHEMA_ID,
    title: "ariadnev configuration",
    description:
      "Settings for the ariadnev CLI. Keys marked x-ariadnev-layer: user are ignored when set by a project config file.",
    ...branchSchema(SCHEMA),
  };
}
