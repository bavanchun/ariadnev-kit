// Opt-out gate for anonymous telemetry. Pure. Precedence is conservative and,
// critically, telemetry is OFF unless an ingest URL is explicitly configured —
// so nothing is ever sent until the edge route ships and is wired.

export interface TelemetryConfig {
  /** Explicit user toggle; false forces off. */
  enabled?: boolean;
  /** Ingest endpoint. Absent → telemetry is off (safe default). */
  url?: string;
}

export interface ConsentResult {
  enabled: boolean;
  reason: string;
}

export function isEnabled(
  env: Record<string, string | undefined>,
  config: TelemetryConfig = {},
): ConsentResult {
  if (env.DO_NOT_TRACK) return { enabled: false, reason: "DO_NOT_TRACK is set" };
  if (env.ARIADNEV_TELEMETRY_DISABLED) return { enabled: false, reason: "ARIADNEV_TELEMETRY_DISABLED is set" };
  if (env.CI) return { enabled: false, reason: "running in CI" };
  if (config.enabled === false) return { enabled: false, reason: "disabled in config" };
  if (!config.url) return { enabled: false, reason: "no ingest endpoint configured" };
  return { enabled: true, reason: "enabled" };
}
