import { describe, it, expect, vi } from "vitest";
import { isEnabled } from "./consent.js";
import { classifyError, categorizeProvider, buildEvent } from "./event.js";
import { capture, captureIfEnabled, type ConsentDeps } from "./client.js";

const ON = { url: "https://edge.example/t", enabled: true };

describe("isEnabled — opt-out precedence", () => {
  it("is off for DO_NOT_TRACK / ARIADNEV_TELEMETRY_DISABLED / CI", () => {
    expect(isEnabled({ DO_NOT_TRACK: "1" }, ON).enabled).toBe(false);
    expect(isEnabled({ ARIADNEV_TELEMETRY_DISABLED: "1" }, ON).enabled).toBe(false);
    expect(isEnabled({ CI: "true" }, ON).enabled).toBe(false);
  });

  it("is off when disabled in config or when no endpoint is configured (safe default)", () => {
    expect(isEnabled({}, { url: "x", enabled: false }).enabled).toBe(false);
    expect(isEnabled({}, {}).enabled).toBe(false); // no url → off
    expect(isEnabled({}, { url: undefined }).reason).toContain("no ingest endpoint");
  });

  it("is on only when an endpoint is set and nothing opts out", () => {
    expect(isEnabled({}, ON).enabled).toBe(true);
  });
});

describe("event — categorical only, invariants on every payload", () => {
  it("classifyError returns a fixed enum, never the raw message", () => {
    expect(classifyError({ code: "ENOENT" })).toBe("filesystem");
    expect(classifyError({ code: "EACCES" })).toBe("permission");
    expect(classifyError(new Error("network fetch failed ECONNREFUSED"))).toBe("network");
    expect(classifyError(new Error("Unexpected token in JSON"))).toBe("parse");
    expect(classifyError("weird")).toBe("unknown");
  });

  it("collapses an unknown provider to 'custom'", () => {
    expect(categorizeProvider("codex")).toBe("codex");
    expect(categorizeProvider("my-secret-provider")).toBe("custom");
  });

  it("applies invariants and drops any non-scalar (PII-risk) field", () => {
    const e = buildEvent("vc_started", { provider: "codex", leak: { token: "ghp_x" }, arr: [1, 2] } as never);
    expect(e).toMatchObject({ event: "vc_started", provider: "codex", $ip: "", $process_person_profile: false, schema: 1 });
    expect(JSON.stringify(e)).not.toContain("ghp_x");
    expect(JSON.stringify(e)).not.toContain("leak");
    expect(JSON.stringify(e)).not.toContain("arr");
  });
});

function consentDeps(over: Partial<ConsentDeps> = {}): ConsentDeps {
  return {
    hasConsentStamp: () => true,
    writeConsentStamp: vi.fn(),
    notice: vi.fn(),
    ...over,
  };
}

describe("captureIfEnabled — consent gate + off-by-default", () => {
  it("sends nothing when telemetry is disabled", () => {
    const fetchImpl = vi.fn();
    captureIfEnabled({ CI: "true" }, ON, buildEvent("vc_started"), consentDeps({ fetchImpl }));
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("on first enabled run: shows the notice, writes the stamp, and sends NOTHING", () => {
    const fetchImpl = vi.fn();
    const notice = vi.fn();
    const writeConsentStamp = vi.fn();
    captureIfEnabled({}, ON, buildEvent("vc_started"), consentDeps({ fetchImpl, notice, writeConsentStamp, hasConsentStamp: () => false }));
    expect(notice).toHaveBeenCalledOnce();
    expect(writeConsentStamp).toHaveBeenCalledOnce();
    expect(fetchImpl).not.toHaveBeenCalled(); // consent-before-send
  });

  it("sends once the stamp exists", () => {
    const fetchImpl = vi.fn(() => Promise.resolve(new Response("ok")));
    captureIfEnabled({}, ON, buildEvent("vc_started"), consentDeps({ fetchImpl }));
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});

describe("capture — silent + non-blocking", () => {
  it("never throws when the fetch rejects or hangs", async () => {
    const reject = vi.fn(() => Promise.reject(new Error("captive portal")));
    await expect(capture("https://x/t", buildEvent("e"), { fetchImpl: reject, timeoutMs: 10 })).resolves.toBeUndefined();
  });

  it("aborts a hanging request via the timeout without throwing", async () => {
    const hang = vi.fn(
      (_url: string, init?: { signal?: AbortSignal }) =>
        new Promise<Response>((_res, rej) => {
          init?.signal?.addEventListener("abort", () => rej(new Error("aborted")));
        }),
    );
    await expect(capture("https://x/t", buildEvent("e"), { fetchImpl: hang as never, timeoutMs: 10 })).resolves.toBeUndefined();
  });
});
