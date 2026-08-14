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
      claims: [claim("covered")],
      content: "Return a concise summary.",
    });
    expect(result.ok).toBe(false);
    expect(result.findings[0]).toMatchObject({ kind: "unmatched", claimId: "c001" });
  });

  it("passes a covered claim whose anchor substring is present in body", () => {
    // Anchor bypasses the 35% keyword-overlap check: the adjudicator quotes
    // a verbatim body sentence that operationalizes the claim under the
    // skill's own phrasing. Substring match on the anchor is the proof.
    const result = checkClaimCoverage({
      skill: "demo",
      claims: [
        {
          id: "c001",
          text: "do not start implementing anything",
          status: "covered",
          anchor: "This skill never edits code, config, or docs",
        },
      ],
      content:
        "# Ask\n\nExpert answer mode: analysis only. This skill never edits code, config, or docs.",
    });
    expect(result.ok).toBe(true);
    expect(result.covered).toBe(1);
  });

  it("fails a covered claim whose anchor is missing from body", () => {
    // Anchor guards against ledger rot: if a future body edit removes the
    // enforcing sentence, the ratchet fails immediately.
    const result = checkClaimCoverage({
      skill: "demo",
      claims: [
        {
          id: "c001",
          text: "do not start implementing anything",
          status: "covered",
          anchor: "This skill never edits code, config, or docs",
        },
      ],
      content: "# Ask\n\nExpert answer mode. Answer directly.",
    });
    expect(result.ok).toBe(false);
    expect(result.findings[0]).toMatchObject({ kind: "unmatched", claimId: "c001" });
    expect(result.findings[0].message).toContain("anchor");
  });

  it("skips a rejected claim with a reason", () => {
    const result = checkClaimCoverage({
      skill: "demo",
      claims: [claim("rejected", "provider-specific and unsupported")],
      content: "",
    });
    expect(result.ok).toBe(true);
    expect(result.rejected).toBe(1);
  });

  it("fails an unclassified claim and a rejection without a reason", () => {
    const unclassified = checkClaimCoverage({
      skill: "demo",
      claims: [claim("unclassified")],
      content: "agents must verify exact command output",
    });
    expect(unclassified.findings[0]).toMatchObject({ kind: "unclassified" });

    const invalid = checkClaimCoverage({
      skill: "demo",
      claims: [claim("rejected")],
      content: "",
    });
    expect(invalid.findings[0]).toMatchObject({ kind: "invalid-rejection" });
  });

  it("treats a skill without tracked claims as not applicable", () => {
    const result = checkClaimCoverage({
      skill: "demo",
      content: "",
    });
    expect(result).toMatchObject({ applicable: false, ok: true });
  });
});
