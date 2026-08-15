// Strips everything a project file may not decide, before resolution ever sees
// it. Filtering is structural: `resolveConfig` receives a project layer that
// physically has no user-only keys in it, rather than merging first and policing
// afterwards. A merge-then-check design leaks the moment a new key is added and
// nobody remembers to add the check.

import { CONFIG_FIELDS, specFor, type FlatField } from "./config-schema.js";

export interface DroppedKey {
  readonly path: string;
  readonly reason: string;
}

export interface FilterResult {
  /** The project layer with only project-overridable keys left. */
  readonly layer: Record<string, unknown>;
  readonly dropped: readonly DroppedKey[];
  readonly warnings: readonly string[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Every dotted path present in `raw`, stopping at any leaf the schema knows. */
function presentPaths(raw: Record<string, unknown>, prefix: string, out: string[]): void {
  for (const [key, value] of Object.entries(raw)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (isPlainObject(value) && !specFor(path)) presentPaths(value, path, out);
    else out.push(path);
  }
}

function setPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".");
  let node = target;
  for (const part of parts.slice(0, -1)) {
    if (!isPlainObject(node[part])) node[part] = {};
    node = node[part] as Record<string, unknown>;
  }
  node[parts[parts.length - 1]] = value;
}

function readPath(raw: Record<string, unknown>, path: string): unknown {
  let node: unknown = raw;
  for (const part of path.split(".")) {
    if (!isPlainObject(node)) return undefined;
    node = node[part];
  }
  return node;
}

const PROJECT_PATHS = new Set<string>(CONFIG_FIELDS.filter((f: FlatField) => f.spec.layer === "project").map((f) => f.path));

export function filterProjectLayer(raw: unknown, sourcePath: string): FilterResult {
  if (raw === null || raw === undefined) return { layer: {}, dropped: [], warnings: [] };
  if (!isPlainObject(raw)) {
    return {
      layer: {},
      dropped: [],
      warnings: [`${sourcePath} does not contain a JSON object — the whole project layer was ignored`],
    };
  }

  const paths: string[] = [];
  presentPaths(raw, "", paths);

  const layer: Record<string, unknown> = {};
  const dropped: DroppedKey[] = [];
  const warnings: string[] = [];

  for (const path of paths) {
    if (PROJECT_PATHS.has(path)) {
      setPath(layer, path, readPath(raw, path));
      continue;
    }
    const spec = specFor(path);
    if (spec) {
      dropped.push({ path, reason: "user-only key" });
      warnings.push(
        `${path} is a user-only setting and was ignored in ${sourcePath} — set it in your user config instead`,
      );
      continue;
    }
    dropped.push({ path, reason: "unknown key" });
    warnings.push(`${path} is not a known ariadnev setting and was ignored in ${sourcePath}`);
  }

  return { layer, dropped, warnings };
}
