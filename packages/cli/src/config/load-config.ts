// Reads the two config files and hands them to the pure resolver.
//
// Validation is split so nothing is reported twice: ajv answers the one question
// per-field resolution cannot see — "is this key known at all?" — while types,
// enums, and destination hosts are checked by `checkValue`, which also decides
// what happens next (skip this layer, keep the rest). A broken config is always
// warnings plus defaults; it never ends the session.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv, { type ErrorObject } from "ajv";
import type { Config } from "./config-schema.js";
import { filterProjectLayer } from "./filter-project-layer.js";
import { buildJsonSchema } from "./json-schema.js";
import { resolveConfig } from "./resolve-config.js";

export const CONFIG_DIR = ".ariadnev";
export const CONFIG_FILE = "config.json";

export function userConfigPath(home: string): string {
  return join(home, CONFIG_DIR, CONFIG_FILE);
}

export function projectConfigPath(cwd: string): string {
  return join(cwd, CONFIG_DIR, CONFIG_FILE);
}

export interface LoadDeps {
  /** Read a config file; return null when it does not exist. */
  readFile(path: string): string | null;
}

export interface LoadOpts {
  readonly home: string;
  readonly cwd: string;
}

export interface LoadedConfig {
  readonly config: Config;
  readonly warnings: readonly string[];
  readonly sources: { readonly user: string | null; readonly project: string | null };
}

type Validator = ((data: unknown) => boolean) & { errors?: ErrorObject[] | null };

let validator: Validator | null = null;

function unknownKeyWarnings(data: unknown, sourcePath: string): string[] {
  validator ??= new Ajv({ allErrors: true, strict: false }).compile(buildJsonSchema()) as Validator;
  if (validator(data)) return [];
  return (validator.errors ?? [])
    .filter((error) => error.keyword === "additionalProperties")
    .map((error) => {
      const parent = error.instancePath.replace(/^\//, "").split("/").filter(Boolean).join(".");
      const key = (error.params as { additionalProperty: string }).additionalProperty;
      const path = parent ? `${parent}.${key}` : key;
      return `${path} is not a known ariadnev setting and was ignored in ${sourcePath}`;
    });
}

function readJson(path: string, deps: LoadDeps, warnings: string[]): { value: unknown; found: boolean } {
  let text: string | null;
  try {
    text = deps.readFile(path);
  } catch {
    // An unreadable config file is a warning, never a failed command.
    warnings.push(`${path} could not be read — using defaults`);
    return { value: undefined, found: false };
  }
  if (text === null) return { value: undefined, found: false };
  try {
    return { value: JSON.parse(text), found: true };
  } catch {
    warnings.push(`${path} is not valid JSON — the whole file was ignored`);
    return { value: undefined, found: false };
  }
}

export function loadConfig(opts: LoadOpts, deps: LoadDeps): LoadedConfig {
  const warnings: string[] = [];
  const userPath = userConfigPath(opts.home);
  const projectPath = projectConfigPath(opts.cwd);

  const user = readJson(userPath, deps, warnings);
  const project = readJson(projectPath, deps, warnings);

  if (user.found) warnings.push(...unknownKeyWarnings(user.value, userPath));

  const filtered = project.found ? filterProjectLayer(project.value, projectPath) : { layer: {}, warnings: [] as string[] };
  warnings.push(...filtered.warnings);

  const resolved = resolveConfig({ user: user.value, project: filtered.layer });
  warnings.push(...resolved.warnings);

  return {
    config: resolved.config,
    warnings,
    sources: { user: user.found ? userPath : null, project: project.found ? projectPath : null },
  };
}

export function realLoadDeps(): LoadDeps {
  return {
    readFile: (path) => {
      try {
        return readFileSync(path, "utf8");
      } catch {
        return null;
      }
    },
  };
}
