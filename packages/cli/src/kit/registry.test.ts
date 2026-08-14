import { describe, expect, it } from "vitest";
import { parseRegistry } from "./registry.js";

const valid = {
  schema_version: 1,
  skills: {
    demo: {
      pinned_at: "2026-08-06",
      claims: [{ id: "c001", text: "agents must verify output", status: "covered" }],
    },
  },
};

describe("parseRegistry", () => {
  it("parses schema v1 entries and claims", () => {
    expect(parseRegistry(JSON.stringify(valid))).toEqual(valid);
  });

  it("rejects malformed JSON and unsupported schema versions", () => {
    expect(() => parseRegistry("{nope")).toThrow(/valid JSON/);
    expect(() => parseRegistry(JSON.stringify({ ...valid, schema_version: 2 }))).toThrow(
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
    expect(() => parseRegistry(JSON.stringify(malformed))).toThrow(/rejected claim.*why/);
  });

  it("parses an anchor on a covered claim", () => {
    const withAnchor = structuredClone(valid);
    withAnchor.skills.demo.claims[0] = {
      id: "c001",
      text: "agents must verify output",
      status: "covered",
      anchor: "verify exact command output",
    } as (typeof withAnchor.skills.demo.claims)[number];
    const parsed = parseRegistry(JSON.stringify(withAnchor));
    expect(parsed.skills.demo.claims?.[0]).toMatchObject({
      status: "covered",
      anchor: "verify exact command output",
    });
  });

  it("rejects an empty anchor and an anchor on a non-covered claim", () => {
    const emptyAnchor = structuredClone(valid);
    emptyAnchor.skills.demo.claims[0] = {
      id: "c001",
      text: "x",
      status: "covered",
      anchor: "   ",
    } as (typeof emptyAnchor.skills.demo.claims)[number];
    expect(() => parseRegistry(JSON.stringify(emptyAnchor))).toThrow(/anchor.*non-empty/);

    const anchorOnRejected = structuredClone(valid);
    anchorOnRejected.skills.demo.claims[0] = {
      id: "c001",
      text: "x",
      status: "rejected",
      why: "dropped",
      anchor: "some quote",
    } as (typeof anchorOnRejected.skills.demo.claims)[number];
    expect(() => parseRegistry(JSON.stringify(anchorOnRejected))).toThrow(
      /anchor.*only meaningful on covered/,
    );
  });
});
