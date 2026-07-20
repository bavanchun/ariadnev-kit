// Fire-and-forget telemetry sender. Never throws, never prints, bounded by a
// short timeout, and the timer is unref'd so a pending request can never keep
// the process alive (a captive-network hang must not freeze the CLI).

import { isEnabled, type TelemetryConfig } from "./consent.js";
import type { TelemetryEvent } from "./event.js";

export interface CaptureDeps {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export async function capture(url: string, event: TelemetryEvent, deps: CaptureDeps = {}): Promise<void> {
  const f = deps.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? 1500);
  const t = timer as { unref?: () => void };
  if (typeof t.unref === "function") t.unref();
  try {
    await f(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(event),
      signal: controller.signal,
    });
  } catch {
    // Silent by contract — a telemetry failure must never surface or block.
  } finally {
    clearTimeout(timer);
  }
}

export interface ConsentDeps extends CaptureDeps {
  /** True once the user has seen the first-run notice. */
  hasConsentStamp(): boolean;
  /** Persist that the notice has been shown. */
  writeConsentStamp(): void;
  /** Where the one-time first-run notice is printed. */
  notice(text: string): void;
}

const FIRST_RUN_NOTICE =
  "vcskill collects anonymous, categorical usage counts (no PII, no identifiers). " +
  "Opt out any time with VCSKILL_TELEMETRY_DISABLED=1 or DO_NOT_TRACK=1.";

/** Guarded, non-awaited entry for command sites. Sends nothing unless telemetry
 * is enabled; and on the very first enabled run it shows the notice and sends
 * NOTHING that run (consent-before-send). */
export function captureIfEnabled(
  env: Record<string, string | undefined>,
  config: TelemetryConfig,
  event: TelemetryEvent,
  deps: ConsentDeps,
): void {
  if (!isEnabled(env, config).enabled) return;
  if (!deps.hasConsentStamp()) {
    deps.notice(FIRST_RUN_NOTICE);
    deps.writeConsentStamp();
    return; // run 1 sends nothing
  }
  void capture(config.url as string, event, deps);
}
