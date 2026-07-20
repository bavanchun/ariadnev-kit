// `vc telemetry status` — show whether anonymous telemetry is on and why. No
// `reset` command: telemetry is stateless (no device id to rotate).

import { isEnabled, type TelemetryConfig } from "../telemetry/consent.js";
import { coral, teal, faint, type StyleOpts } from "../ui/style.js";

export function runTelemetryStatus(
  env: Record<string, string | undefined>,
  config: TelemetryConfig = {},
  opts: StyleOpts = { color: false },
): string {
  const { enabled, reason } = isEnabled(env, config);
  return [
    `${coral("vcskill", opts)} telemetry — ${enabled ? teal("enabled", opts) : "disabled"}`,
    faint(`  reason: ${reason}`, opts),
    faint("  stateless · categorical-only · no PII or identifiers", opts),
    faint("  opt out: VCSKILL_TELEMETRY_DISABLED=1  or  DO_NOT_TRACK=1", opts),
  ].join("\n");
}
