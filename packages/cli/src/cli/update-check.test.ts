import { describe, it, expect, vi } from "vitest";
import { maybeNudge, type NudgeDeps } from "./update-check.js";

const NOW = 1_000_000_000;

function deps(over: Partial<NudgeDeps>): NudgeDeps {
  return {
    now: () => NOW,
    currentVersion: "0.6.0",
    readCache: () => null,
    writeCache: () => {},
    fetchLatest: async () => null,
    ...over,
  };
}

describe("maybeNudge", () => {
  it("hints from a fresh cache with a newer version (no fetch)", async () => {
    const fetchLatest = vi.fn(async () => "9.9.9");
    const hint = await maybeNudge(deps({ readCache: () => ({ checkedAt: NOW - 1000, latest: "0.7.0" }), fetchLatest }));
    expect(hint).toMatch(/0\.7\.0 available/);
    expect(fetchLatest).not.toHaveBeenCalled(); // cache was fresh
  });

  it("refreshes a stale cache and writes it back", async () => {
    const writeCache = vi.fn();
    const hint = await maybeNudge(
      deps({ readCache: () => ({ checkedAt: NOW - 2 * 60 * 60 * 1000, latest: "0.5.0" }), fetchLatest: async () => "0.8.0", writeCache }),
    );
    expect(hint).toMatch(/0\.8\.0 available/);
    expect(writeCache).toHaveBeenCalledWith({ checkedAt: NOW, latest: "0.8.0" });
  });

  it("returns null when the fetch fails (offline)", async () => {
    const hint = await maybeNudge(deps({ fetchLatest: async () => null }));
    expect(hint).toBeNull();
  });

  it("returns null when the latest is not newer than current", async () => {
    const hint = await maybeNudge(deps({ readCache: () => ({ checkedAt: NOW, latest: "0.6.0" }) }));
    expect(hint).toBeNull();
  });
});
