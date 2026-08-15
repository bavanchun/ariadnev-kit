// Pure cascade: defaults < user < project. No fs, no env — the caller supplies
// the layers, so every rule here is testable without a filesystem.
//
// Two properties this function guarantees on its own, independent of callers:
//   - a user-only key is never taken from the project layer, even if the caller
//     forgot to filter it (`filter-project-layer.ts` is the first line, this is
//     the last);
//   - one bad value never costs the user the rest of their config — it is
//     reported and skipped, and the next layer down still applies.

import {
  CONFIG_FIELDS,
  defaults,
  getAtPath,
  NOTIFICATION_HOSTS,
  setAtPath,
  type Config,
  type LeafSpec,
  type LeafValue,
} from "./config-schema.js";

export interface ResolveInput {
  /** Parsed user config (`~/.ariadnev/config.json`). */
  readonly user?: unknown;
  /** Parsed project config, already filtered by `filterProjectLayer`. */
  readonly project?: unknown;
}

export interface ResolveResult {
  readonly config: Config;
  readonly warnings: readonly string[];
}

type Check = { ok: true; value: LeafValue } | { ok: false; reason: string };

function hostAllowed(hostname: string): boolean {
  return NOTIFICATION_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`));
}

/** Validates one raw value against a leaf spec. Never throws. */
export function checkValue(spec: LeafSpec, raw: unknown): Check {
  if (raw === null) {
    if (spec.nullable) return { ok: true, value: null };
    return { ok: false, reason: `expected ${spec.type}, got null` };
  }
  switch (spec.type) {
    case "boolean":
      return typeof raw === "boolean" ? { ok: true, value: raw } : { ok: false, reason: `expected boolean, got ${typeof raw}` };
    case "integer":
      return typeof raw === "number" && Number.isInteger(raw)
        ? { ok: true, value: raw }
        : { ok: false, reason: `expected integer, got ${typeof raw}` };
    case "string[]":
      if (!Array.isArray(raw)) return { ok: false, reason: `expected an array of strings, got ${typeof raw}` };
      if (!raw.every((item) => typeof item === "string")) return { ok: false, reason: "expected every array item to be a string" };
      return { ok: true, value: [...(raw as string[])] };
    case "string": {
      if (typeof raw !== "string") return { ok: false, reason: `expected string, got ${typeof raw}` };
      if (spec.enum && !spec.enum.includes(raw)) return { ok: false, reason: `expected one of ${spec.enum.join(", ")}` };
      return { ok: true, value: raw };
    }
    case "webhook": {
      if (typeof raw !== "string") return { ok: false, reason: `expected an https URL, got ${typeof raw}` };
      let url: URL;
      try {
        url = new URL(raw);
      } catch {
        return { ok: false, reason: "expected a valid https URL" };
      }
      if (url.protocol !== "https:") return { ok: false, reason: "expected an https URL" };
      // The reason text never quotes the value: a rejected destination is still
      // a destination somebody chose, and warnings end up in logs.
      if (!hostAllowed(url.hostname)) return { ok: false, reason: `host is not one of ${NOTIFICATION_HOSTS.join(", ")}` };
      return { ok: true, value: raw };
    }
  }
}

export function resolveConfig(input: ResolveInput): ResolveResult {
  const config = defaults() as unknown as Record<string, unknown>;
  const warnings: string[] = [];

  for (const { path, spec } of CONFIG_FIELDS) {
    // A user-only key is only ever read from the user layer.
    const layers: { name: string; source: unknown }[] =
      spec.layer === "user"
        ? [{ name: "user", source: input.user }]
        : [
            { name: "project", source: input.project },
            { name: "user", source: input.user },
          ];

    for (const layer of layers) {
      const raw = getAtPath(layer.source, path);
      if (raw === undefined) continue;
      const checked = checkValue(spec, raw);
      if (!checked.ok) {
        warnings.push(`${path} in ${layer.name} config: ${checked.reason} — ignored, using the value below it`);
        continue;
      }
      setAtPath(config, path, checked.value);
      break;
    }
  }

  return { config: config as unknown as Config, warnings };
}
