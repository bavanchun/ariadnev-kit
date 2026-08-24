// `av telemetry status` — show whether anonymous telemetry is on and why. No
// `reset` command: telemetry is stateless (no device id to rotate).

import { isEnabled, type TelemetryConfig } from "../telemetry/consent.js";
import { jsonEnvelope } from "./json-envelope.js";
import { coral, teal, faint, type StyleOpts } from "../ui/style.js";

export const TELEMETRY_SCHEMA_VERSION = 1;

export function runTelemetryStatus(
  env: Record<string, string | undefined>,
  config: TelemetryConfig = {},
  opts: StyleOpts & { json?: boolean } = { color: false },
): string {
  const { enabled, reason } = isEnabled(env, config);
  if (opts.json) {
    return jsonEnvelope(TELEMETRY_SCHEMA_VERSION, "telemetry.status", { enabled, reason, stateless: true });
  }
  return [
    `${coral("ariadnev", opts)} telemetry — ${enabled ? teal("enabled", opts) : "disabled"}`,
    faint(`  reason: ${reason}`, opts),
    faint("  stateless · categorical-only · no PII or identifiers", opts),
    faint("  opt out: ARIADNEV_TELEMETRY_DISABLED=1  or  DO_NOT_TRACK=1", opts),
  ].join("\n");
}
