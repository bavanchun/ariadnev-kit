import { describe, it, expect } from "vitest";
import { runTelemetryStatus } from "./telemetry-command.js";

describe("runTelemetryStatus", () => {
  it("reports disabled + reason when no endpoint is configured (default)", () => {
    const s = runTelemetryStatus({}, {}, { color: false });
    expect(s).toContain("disabled");
    expect(s).toContain("no ingest endpoint");
    expect(s).toContain("VCSKILL_TELEMETRY_DISABLED=1");
    expect(s).not.toContain("\x1b[");
  });

  it("reports enabled when an endpoint is set and nothing opts out", () => {
    const s = runTelemetryStatus({}, { url: "https://edge/t", enabled: true }, { color: false });
    expect(s).toContain("enabled");
  });

  it("reports the opt-out reason", () => {
    expect(runTelemetryStatus({ DO_NOT_TRACK: "1" }, { url: "x" })).toContain("DO_NOT_TRACK");
  });
});
