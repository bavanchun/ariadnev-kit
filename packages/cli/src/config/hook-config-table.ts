// The config table the hook processes read.
//
// Hooks are separate `node` processes with no dependencies and no way to import
// this TypeScript, so they need their own copy of the field table — which is
// exactly how two sources of truth are born. It is generated from the same
// SCHEMA instead, and a test compares the checked-in file with this generator,
// so the copy cannot quietly disagree about which keys a project file may set.

import { CONFIG_FIELDS, NOTIFICATION_HOSTS } from "./config-schema.js";

/** Where the generated table is checked in, relative to the repo root. */
export const HOOK_TABLE_FILE_RELATIVE = "kit/hooks/_lib/config-fields.generated.cjs";

export function buildHookConfigTable(): string {
  const fields: Record<string, { layer: string; type: string; default: unknown; enum?: string[] }> = {};
  for (const { path, spec } of CONFIG_FIELDS) {
    fields[path] = {
      layer: spec.layer,
      type: spec.type,
      default: spec.default,
      ...(spec.enum ? { enum: [...spec.enum] } : {}),
    };
  }
  const body = {
    schemaVersion: 1,
    notificationHosts: [...NOTIFICATION_HOSTS],
    fields,
  };
  return [
    "// GENERATED FILE — do not edit.",
    "// Source: packages/cli/src/config/config-schema.ts",
    "// Regenerate: pnpm --filter @ariadnev/cli generate:config-schema",
    "//",
    "// Which config keys exist, what type each holds, and — the part that matters —",
    "// which layer may set it. A project file may set a `project` key; a `user` key",
    "// is read from the user's own config only, so a cloned repository cannot turn",
    "// off privacy blocking or redirect a notification.",
    "'use strict';",
    "",
    `module.exports = ${JSON.stringify(body, null, 2)};`,
    "",
  ].join("\n");
}
