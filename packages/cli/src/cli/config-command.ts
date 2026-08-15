// `ariadnev config prefs resolve` — show what the CLI actually decided after
// both config layers were applied, and why.
//
// The output is redacted: a notification destination is a secret in its path, so
// a set one prints as `<redacted>` while an unset one prints as `null`. "Not
// configured" and "configured but hidden" must never look the same, or the user
// cannot tell whether their webhook took effect.

import { CONFIG_FIELDS, getAtPath, redactConfig } from "../config/config-schema.js";
import { loadConfig, type LoadDeps, type LoadOpts } from "../config/load-config.js";

export interface ConfigResolveOpts extends LoadOpts {
  json?: boolean;
}

export interface ConfigResolveResult {
  output: string;
  exitCode: 0 | 1;
}

// Bump when the `--json` envelope changes incompatibly. Hooks read this.
export const CONFIG_ENVELOPE_VERSION = 1;

export function runConfigResolve(opts: ConfigResolveOpts, deps: LoadDeps): ConfigResolveResult {
  const { config, warnings, sources } = loadConfig({ home: opts.home, cwd: opts.cwd }, deps);
  const shown = redactConfig(config);

  if (opts.json) {
    return {
      output: JSON.stringify({ schemaVersion: CONFIG_ENVELOPE_VERSION, sources, warnings, config: shown }, null, 2),
      exitCode: 0,
    };
  }

  const lines = ["ariadnev config"];
  lines.push(`  user config:    ${sources.user ?? "(none)"}`);
  lines.push(`  project config: ${sources.project ?? "(none)"}`);
  lines.push("");
  const width = Math.max(...CONFIG_FIELDS.map((f) => f.path.length));
  for (const { path, spec } of CONFIG_FIELDS) {
    const value = getAtPath(shown, path);
    lines.push(`  ${path.padEnd(width)}  ${JSON.stringify(value)}  ${spec.layer === "user" ? "(user-only)" : ""}`.trimEnd());
  }
  for (const warning of warnings) lines.push(`  warning: ${warning}`);
  return { output: lines.join("\n"), exitCode: 0 };
}
