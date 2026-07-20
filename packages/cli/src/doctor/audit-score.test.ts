import { describe, it, expect } from "vitest";
import { scoreAudit } from "./audit-score.js";
import type { ProviderFinding } from "./diagnose.js";

const pass = (): ProviderFinding => ({ providerId: "claude-code", level: "pass", message: "ok" });
const fail = (weight: number): ProviderFinding => ({ providerId: "x", level: "fail", message: "bad", weight });
const warn = (weight: number): ProviderFinding => ({ providerId: "x", level: "warning", message: "meh", weight });

describe("scoreAudit — informational health score", () => {
  it("is 100 for a clean run (only pass/skip rows carry no weight)", () => {
    expect(scoreAudit([pass(), pass()]).score).toBe(100);
    expect(scoreAudit([]).score).toBe(100);
  });

  it("deducts each finding's weight from 100", () => {
    expect(scoreAudit([fail(10)]).score).toBe(90);
    expect(scoreAudit([fail(10), warn(5)]).score).toBe(85);
  });

  it("floors at 0, never negative", () => {
    expect(scoreAudit([fail(80), fail(50)]).score).toBe(0);
  });

  it("is monotone: adding a weighted finding never raises the score", () => {
    const base = scoreAudit([fail(10)]).score;
    const more = scoreAudit([fail(10), warn(5)]).score;
    expect(more).toBeLessThanOrEqual(base);
  });
});
