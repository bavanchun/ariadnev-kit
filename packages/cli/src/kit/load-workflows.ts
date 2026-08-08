import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { parseWorkflow } from "../graph/parse-workflow.js";
import type { Artifact, KitWorkflow } from "./kit-types.js";
import { KitValidationError } from "./kit-validation-error.js";

function readBoundedJson(path: string, label: string, maxBytes: number): string {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new KitValidationError(`${label}: must be a regular file`);
  }
  if (stat.size > maxBytes) {
    throw new KitValidationError(`${label}: exceeds ${maxBytes} byte limit`);
  }
  return readFileSync(path, "utf8");
}

function assertDirectory(path: string, label: string): void {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new KitValidationError(`${label}: must be a regular directory`);
  }
}

export function loadWorkflows(kitRoot: string, skills: Artifact[], agents: Artifact[]): KitWorkflow[] {
  const dir = join(kitRoot, "workflows");
  if (!existsSync(dir)) return [];
  assertDirectory(dir, "workflows");
  const files = readdirSync(dir).filter((entry) => entry !== "schema").sort();
  if (files.length === 0) return [];
  const schemaPath = join(dir, "schema", "workflow.schema.json");
  if (!existsSync(schemaPath)) throw new KitValidationError("workflows: missing schema/workflow.schema.json");
  assertDirectory(join(dir, "schema"), "workflow schema directory");
  const schema = readBoundedJson(schemaPath, "workflow schema", 100_000);
  const skillNames = new Set(skills.map((skill) => skill.name));
  const agentNames = new Set(agents.map((agent) => agent.name));
  const workflows: KitWorkflow[] = [];
  const ids = new Set<string>();

  for (const file of files) {
    if (!file.endsWith(".json")) throw new KitValidationError(`workflows: unexpected entry ${file}`);
    const path = join(dir, file);
    const name = basename(file, ".json");
    const raw = readBoundedJson(path, `workflow ${name}`, 256_000);
    let graph;
    try {
      graph = parseWorkflow(raw, file, schema);
    } catch (error) {
      throw new KitValidationError(String(error instanceof Error ? error.message : error));
    }
    if (graph.id !== name) throw new KitValidationError(`workflow ${name}: id must match filename`);
    if (ids.has(graph.id)) throw new KitValidationError(`duplicate workflow id: ${graph.id}`);
    ids.add(graph.id);
    for (const node of graph.nodes) {
      if (node.type === "skill" && !skillNames.has(node.handler.ref)) {
        throw new KitValidationError(`workflow ${name}: unknown skill handler ${node.handler.ref}`);
      }
      if (node.type === "agent" && !agentNames.has(node.handler.ref)) {
        throw new KitValidationError(`workflow ${name}: unknown agent handler ${node.handler.ref}`);
      }
    }
    workflows.push({ name, graph, raw, sourcePath: path });
  }
  return workflows;
}
