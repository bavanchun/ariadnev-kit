import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";
import { CONFIG_FIELDS, defaults, getAtPath } from "./config-schema.js";
import { buildJsonSchema, SCHEMA_FILE_RELATIVE } from "./json-schema.js";

const repoRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..", "..");

describe("config JSON Schema", () => {
  it("derives every field from the TypeScript definition", () => {
    const schema = buildJsonSchema() as Record<string, unknown>;
    for (const { path, spec } of CONFIG_FIELDS) {
      const node = getAtPath(schema, path.split(".").join(".properties.").replace(/^/, "properties.")) as
        | Record<string, unknown>
        | undefined;
      expect(node, `${path} missing from the JSON Schema`).toBeDefined();
      expect(node?.description).toContain(spec.describe);
      // A destination field must tell an editor the rule the CLI will enforce.
      if (spec.type === "webhook") expect(node?.description).toMatch(/https URL on an allowlisted host/);
      expect(node?.default).toEqual(spec.default);
      if (spec.enum) expect(node?.enum).toEqual([...spec.enum]);
      expect(node?.["x-ariadnev-layer"]).toBe(spec.layer);
    }
  });

  it("closes every object so an unknown key is an error, not a silent no-op", () => {
    const seen: string[] = [];
    const walk = (node: Record<string, unknown>, path: string): void => {
      if (node.type !== "object") return;
      seen.push(path || "(root)");
      expect(node.additionalProperties, `${path || "(root)"} accepts unknown keys`).toBe(false);
      for (const [key, child] of Object.entries((node.properties ?? {}) as Record<string, Record<string, unknown>>)) {
        walk(child, path ? `${path}.${key}` : key);
      }
    };
    walk(buildJsonSchema() as Record<string, unknown>, "");
    expect(seen.length).toBeGreaterThan(5);
  });

  it("compiles under ajv, accepts the defaults, and rejects an unknown key", () => {
    const validate = new Ajv({ allErrors: true, strict: false }).compile(buildJsonSchema());
    expect(validate(defaults())).toBe(true);
    expect(validate({ paths: { docs: "d" } })).toBe(true);
    expect(validate({ watch: { pollIntervalMs: 1 } })).toBe(false);
    expect(validate({ docs: { maxLoc: "many" } })).toBe(false);
  });

  it("ships a checked-in schema file that matches the generator", () => {
    // The file exists for editors. It is generated, so drift means somebody
    // changed the definition without regenerating — the test says so instead of
    // letting the two quietly disagree.
    const onDisk = JSON.parse(readFileSync(join(repoRoot, SCHEMA_FILE_RELATIVE), "utf8"));
    expect(onDisk).toEqual(buildJsonSchema());
  });
});
