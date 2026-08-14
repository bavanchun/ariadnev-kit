import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { ZodError } from "zod";
import { scenarioSchemaV1, type ScenarioV1 } from "./scenario-types.js";
import { parseStrictJson } from "./strict-json.js";

const MAX_SCENARIO_BYTES = 256 * 1024;

export function parseScenario(input: string, source = "scenario"): ScenarioV1 {
  if (Buffer.byteLength(input, "utf8") > MAX_SCENARIO_BYTES) {
    throw new Error(`${source}: scenario exceeds ${MAX_SCENARIO_BYTES} bytes`);
  }
  const value = parseStrictJson(input, `${source}: scenario`);
  try {
    return scenarioSchemaV1.parse(value);
  } catch (error) {
    if (!(error instanceof ZodError)) throw error;
    const details = error.issues
      .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
      .join("; ");
    throw new Error(`${source}: ${details}`);
  }
}

export function loadScenarioFile(path: string): ScenarioV1 {
  if (!statSync(path).isFile()) throw new Error(`${path}: scenario path must be a file`);
  return parseScenario(readFileSync(path, "utf8"), path);
}

export function loadScenarioDirectory(directory: string): ScenarioV1[] {
  const scenarios = readdirSync(directory)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => loadScenarioFile(join(directory, name)));
  const ids = scenarios.map((scenario) => scenario.id);
  if (new Set(ids).size !== ids.length) throw new Error(`${directory}: scenario ids must be unique`);
  return scenarios;
}
