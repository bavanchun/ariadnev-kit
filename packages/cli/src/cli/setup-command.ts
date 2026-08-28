// `av setup` — the first-run wizard, and the `--step` surface that lets one
// field be changed without re-running the whole thing.
//
// IT WRITES NO CREDENTIALS, AND THAT IS ENFORCED RATHER THAN INTENDED. The
// captured surface has three steps that write API keys, plus an `--advanced`
// mode whose stated purpose is configuring provider keys. None are ported. But
// "we chose not to add those steps" is a promise that lasts until someone adds
// a step; `assertNoSecrets` makes it a property of the writer instead, checked
// against the schema's own `sensitive` marks. A future step that tried to
// collect a token would fail here rather than ship.
//
// THE STEP NAMES ARE THIS TOOL'S, NOT THE ORACLE'S. Upstream's remaining steps
// name a provider/model/telemetry system ariadnev does not have — `default_model`
// and `image_provider` have nothing here to set. Mapping them onto invented
// config keys would produce a wizard that writes settings nothing reads, which
// is worse than a smaller wizard that writes real ones. The steps below cover
// the fields this tool actually resolves.

import { existsSync, readFileSync } from "node:fs";
import { atomicWritePrivate } from "../install/fs-atomic.js";
import {
  CONFIG_FIELDS,
  getAtPath,
  setAtPath,
  specFor,
  type LeafValue,
} from "../config/config-schema.js";
import { projectConfigPath, userConfigPath } from "../config/load-config.js";
import { UsageError } from "./exit-codes.js";
import { jsonEnvelope } from "./json-envelope.js";

export const SETUP_SCHEMA_VERSION = 1;

/**
 * The wizard's steps, each naming the config paths it owns.
 *
 * A step is a group of related fields, not a single one: that is what makes
 * `--step` useful for "fix the thing I got wrong" without re-answering
 * everything else.
 */
export const SETUP_STEPS = {
  adapters: ["scripts.executionPolicy"],
  paths: ["paths.docs", "paths.plans", "docs.maxLoc"],
  plans: ["plan.namingFormat", "plan.dateFormat", "plan.issuePrefix", "plan.reportsDir"],
  project: ["project.type", "project.packageManager", "project.framework"],
  statusline: ["statusline.mode", "statusline.quota"],
  locale: ["locale.thinkingLanguage", "locale.responseLanguage"],
  privacy: ["privacyBlock", "trust.enabled"],
} as const satisfies Record<string, readonly string[]>;

export type SetupStep = keyof typeof SETUP_STEPS;

export const SETUP_STEP_NAMES = Object.keys(SETUP_STEPS) as SetupStep[];

/**
 * Every path any step may write. Derived from `SETUP_STEPS` rather than listed
 * again, so a step cannot gain a field this set does not know about.
 */
export function setupWritablePaths(): string[] {
  return [...new Set(Object.values(SETUP_STEPS).flat())];
}

/**
 * Refuse to write anything the schema marks sensitive.
 *
 * This is the whole "setup writes no auth material" rule, in a place that
 * cannot be forgotten. It reads the schema instead of a list of banned names,
 * so a credential field added later is covered on the day it is added.
 */
function assertNoSecrets(paths: readonly string[]): void {
  const secrets = paths.filter((path) => specFor(path)?.sensitive);
  if (secrets.length > 0) {
    throw new UsageError(
      `av setup does not write credentials, and these are marked sensitive: ${secrets.join(", ")}. ` +
        "Set them with an environment variable instead.",
    );
  }
}

export interface SetupOpts {
  readonly home: string;
  readonly cwd: string;
  /** Restrict the run to these steps; all of them when absent. */
  readonly steps?: readonly string[];
  /** Values to apply, keyed by config path. Required without a TTY. */
  readonly values?: Readonly<Record<string, LeafValue>>;
  /** A JSON file of the same shape, for `--no-interactive --config <path>`. */
  readonly configFile?: string;
  readonly interactive?: boolean;
  readonly json?: boolean;
}

export interface SetupResult {
  readonly summary: string;
  /** Paths actually written, by layer. */
  readonly written: Readonly<Record<"user" | "project", string[]>>;
}

function parseSteps(steps: readonly string[] | undefined): SetupStep[] {
  if (!steps || steps.length === 0) return SETUP_STEP_NAMES;
  const unknown = steps.filter((step) => !SETUP_STEP_NAMES.includes(step as SetupStep));
  if (unknown.length > 0) {
    throw new UsageError(
      `unknown --step value(s): ${unknown.join(", ")}. Available: ${SETUP_STEP_NAMES.join(", ")}`,
    );
  }
  return steps as SetupStep[];
}

function readConfigFile(path: string): Record<string, LeafValue> {
  if (!existsSync(path)) throw new UsageError(`no such config file: ${path}`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`${path} is not valid JSON`, { cause: error });
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new UsageError(`${path} must be a JSON object of "config.path": value pairs`);
  }
  return parsed as Record<string, LeafValue>;
}

/** Validate one value against its schema leaf, so a bad answer fails here. */
function validate(path: string, value: LeafValue): LeafValue {
  const spec = specFor(path);
  if (!spec) throw new UsageError(`unknown config path: ${path}`);
  if (value === null) {
    if (!spec.nullable) throw new UsageError(`${path} cannot be null`);
    return value;
  }
  if (spec.enum && !spec.enum.includes(String(value))) {
    throw new UsageError(`${path} must be one of: ${spec.enum.join(", ")}`);
  }
  const actual = Array.isArray(value) ? "string[]" : typeof value === "number" ? "integer" : typeof value;
  const expected = spec.type === "webhook" ? "string" : spec.type;
  if (actual !== expected) throw new UsageError(`${path} expects ${expected}, got ${actual}`);
  if (spec.type === "integer" && !Number.isInteger(value)) throw new UsageError(`${path} expects a whole number`);
  return value;
}

function mergeInto(path: string, values: Record<string, LeafValue>): string[] {
  const existing = existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>) : {};
  const written: string[] = [];
  for (const [key, value] of Object.entries(values)) {
    setAtPath(existing, key, value);
    written.push(key);
  }
  // 0600 and atomic. The user layer holds a person's preferences and the file
  // is small enough that rewriting it whole is simpler than patching it.
  atomicWritePrivate(path, `${JSON.stringify(existing, null, 2)}\n`);
  return written.sort();
}

export function runSetup(opts: SetupOpts): SetupResult {
  const steps = parseSteps(opts.steps);
  const allowed = new Set(steps.flatMap((step) => SETUP_STEPS[step] as readonly string[]));

  const supplied: Record<string, LeafValue> = {
    ...(opts.configFile ? readConfigFile(opts.configFile) : {}),
    ...(opts.values ?? {}),
  };

  if (opts.interactive === false && Object.keys(supplied).length === 0) {
    throw new UsageError(
      "av setup --no-interactive needs values: pass --config <file.json> with \"config.path\": value pairs",
    );
  }

  const offered = supplied;
  const unknown = Object.keys(offered).filter((path) => !allowed.has(path));
  if (unknown.length > 0) {
    // Named rather than ignored. A typo'd path that is silently dropped leaves
    // the user believing they configured something they did not.
    throw new UsageError(
      `these paths are not part of the selected step(s): ${unknown.join(", ")}. ` +
        `Selected steps cover: ${[...allowed].join(", ")}`,
    );
  }
  assertNoSecrets(Object.keys(offered));

  const byLayer: Record<"user" | "project", Record<string, LeafValue>> = { user: {}, project: {} };
  for (const [path, value] of Object.entries(offered)) {
    byLayer[specFor(path)!.layer][path] = validate(path, value);
  }

  const written: Record<"user" | "project", string[]> = { user: [], project: [] };
  if (Object.keys(byLayer.user).length > 0) {
    written.user = mergeInto(userConfigPath(opts.home), byLayer.user);
  }
  if (Object.keys(byLayer.project).length > 0) {
    written.project = mergeInto(projectConfigPath(opts.cwd), byLayer.project);
  }

  if (opts.json) {
    return { written, summary: jsonEnvelope(SETUP_SCHEMA_VERSION, "setup.run", { steps, written }) };
  }
  const lines = [`ariadnev setup — ${steps.join(", ")}`];
  if (written.user.length > 0) lines.push(`  ${userConfigPath(opts.home)}: ${written.user.join(", ")}`);
  if (written.project.length > 0) lines.push(`  ${projectConfigPath(opts.cwd)}: ${written.project.join(", ")}`);
  if (written.user.length === 0 && written.project.length === 0) lines.push("  nothing to write");
  return { written, summary: lines.join("\n") };
}

/** Current value of every field a step owns, for a wizard to show as a default. */
export function setupDefaults(steps: readonly SetupStep[], current: unknown): Record<string, LeafValue> {
  const out: Record<string, LeafValue> = {};
  for (const step of steps) {
    for (const path of SETUP_STEPS[step] as readonly string[]) {
      out[path] = (getAtPath(current, path) ?? specFor(path)!.default) as LeafValue;
    }
  }
  return out;
}

/** Every configurable path, for `--help` text and for the wizard's own listing. */
export function allConfigPaths(): string[] {
  return CONFIG_FIELDS.map((field) => field.path);
}
