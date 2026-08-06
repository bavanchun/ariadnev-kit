import { describe, expect, it } from "vitest";
import { parseDistillRegistry } from "./distill-registry.js";

const valid = {
  schema_version: 1,
  skills: {
    demo: {
      upstream: "ak:demo",
      upstream_version: "1.0.0",
      upstream_digest: `sha256:${"a".repeat(64)}`,
      upstream_relation: "distill",
      pinned_at: "2026-08-06",
      claims: [{ id: "c001", text: "agents must verify output", status: "covered" }],
    },
  },
};

describe("parseDistillRegistry", () => {
  it("parses schema v1 entries and claims", () => {
    expect(parseDistillRegistry(JSON.stringify(valid))).toEqual(valid);
  });

  it("rejects malformed JSON and unsupported schema versions", () => {
    expect(() => parseDistillRegistry("{nope")).toThrow(/valid JSON/);
    expect(() => parseDistillRegistry(JSON.stringify({ ...valid, schema_version: 2 }))).toThrow(
      /schema_version must equal 1/,
    );
  });

  it("requires rejected claims to carry a non-empty reason", () => {
    const malformed = structuredClone(valid);
    malformed.skills.demo.claims[0] = {
      id: "c001",
      text: "drop provider-specific behavior",
      status: "rejected",
    } as (typeof malformed.skills.demo.claims)[number];
    expect(() => parseDistillRegistry(JSON.stringify(malformed))).toThrow(/rejected claim.*why/);
  });
});
