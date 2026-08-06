import { describe, expect, it } from "vitest";
import { checkClaimCoverage, keywordOverlap } from "./claim-coverage.js";

const claim = (status: "covered" | "rejected" | "unclassified", why?: string) => ({
  id: "c001",
  text: "agents must verify exact command output",
  status,
  ...(why ? { why } : {}),
});

describe("checkClaimCoverage", () => {
  it("returns zero overlap when a claim has no meaningful keywords", () => {
    expect(keywordOverlap("", "anything")).toBe(0);
  });

  it("passes a covered claim with a content anchor", () => {
    const result = checkClaimCoverage({
      skill: "demo",
      relation: "distill",
      claims: [claim("covered")],
      content: "Always verify exact command output before reporting success.",
    });
    expect(result.ok).toBe(true);
    expect(result.findings).toEqual([]);
    expect(result.covered).toBe(1);
  });

  it("reports an unmatched covered claim", () => {
    const result = checkClaimCoverage({
      skill: "demo",
      relation: "distill",
      claims: [claim("covered")],
      content: "Return a concise summary.",
    });
    expect(result.ok).toBe(false);
    expect(result.findings[0]).toMatchObject({ kind: "unmatched", claimId: "c001" });
  });

  it("skips a rejected claim with a reason", () => {
    const result = checkClaimCoverage({
      skill: "demo",
      relation: "distill",
      claims: [claim("rejected", "provider-specific and unsupported")],
      content: "",
    });
    expect(result.ok).toBe(true);
    expect(result.rejected).toBe(1);
  });

  it("fails an unclassified claim and a rejection without a reason", () => {
    const unclassified = checkClaimCoverage({
      skill: "demo",
      relation: "distill",
      claims: [claim("unclassified")],
      content: "agents must verify exact command output",
    });
    expect(unclassified.findings[0]).toMatchObject({ kind: "unclassified" });

    const invalid = checkClaimCoverage({
      skill: "demo",
      relation: "distill",
      claims: [claim("rejected")],
      content: "",
    });
    expect(invalid.findings[0]).toMatchObject({ kind: "invalid-rejection" });
  });

  it.each(["fork", "none"] as const)("exempts %s relations", (relation) => {
    const result = checkClaimCoverage({
      skill: "demo",
      relation,
      claims: [claim("unclassified")],
      content: "",
    });
    expect(result).toMatchObject({ applicable: false, ok: true, findings: [] });
  });

  it("treats a distillation without tracked claims as not applicable", () => {
    const result = checkClaimCoverage({
      skill: "demo",
      relation: "distill",
      content: "",
    });
    expect(result).toMatchObject({ applicable: false, ok: true });
  });
});
