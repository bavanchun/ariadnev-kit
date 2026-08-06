import { describe, expect, it } from "vitest";
import { validateSkillProvenance } from "./skill-provenance.js";

const VALID = {
  upstream: "ak:demo",
  upstream_version: "1.0.0",
  upstream_digest: `sha256:${"a".repeat(64)}`,
  upstream_relation: "distill",
};

const validate = (overrides: Record<string, unknown> = {}) =>
  validateSkillProvenance({ ...VALID, ...overrides }, 'skill "demo"');

describe("validateSkillProvenance", () => {
  it("rejects malformed digests and non-string values", () => {
    expect(validate({ upstream_digest: "sha256:nope" }).some((e) => e.includes("upstream_digest"))).toBe(true);
    expect(validate({ upstream_version: 1 }).some((e) => e.includes("upstream_version"))).toBe(true);
  });

  it("requires a consistent all-none sentinel", () => {
    const errors = validate({
      upstream: "none",
      upstream_version: "none",
      upstream_digest: "none",
    });

    expect(errors.some((error) => error.includes('all equal "none"'))).toBe(true);
  });

  it("accepts the all-none sentinel and a valid fork", () => {
    expect(validateSkillProvenance({
      upstream: "none",
      upstream_version: "none",
      upstream_digest: "none",
      upstream_relation: "none",
    }, 'skill "demo"')).toEqual([]);
    expect(validate({ upstream_relation: "fork" })).toEqual([]);
  });

  it("rejects unknown upstream relations", () => {
    expect(validate({ upstream_relation: "copy" }).some((e) => e.includes("upstream_relation"))).toBe(true);
  });

  it("accepts complete SemVer and rejects numeric identifiers with leading zeroes", () => {
    expect(validate({ upstream_version: "1.2.3-alpha.1+build.5" })).toEqual([]);
    expect(validate({ upstream_version: "01.2.3" }).some((e) => e.includes("upstream_version"))).toBe(true);
  });
});
