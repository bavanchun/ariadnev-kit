import { describe, expect, it } from "vitest";
import { findUnresolvedSkillReferences } from "./skill-crossrefs.js";

describe("findUnresolvedSkillReferences", () => {
  it("resolves references against the complete supplied inventory", () => {
    const result = findUnresolvedSkillReferences(
      [
        { source: "foo/SKILL.md", content: "Use vc:bar before vc:baz-qux." },
        { source: "foo/references/more.md", content: "Related: vc:foo." },
      ],
      ["foo", "bar", "baz-qux"],
    );
    expect(result).toEqual([]);
  });

  it("returns each unresolved reference with its source file", () => {
    const result = findUnresolvedSkillReferences(
      [
        { source: "foo/SKILL.md", content: "Use vc:missing." },
        { source: "foo/references/more.md", content: "Then vc:also-missing." },
      ],
      ["foo"],
    );
    expect(result).toEqual([
      { source: "foo/SKILL.md", reference: "vc:missing" },
      { source: "foo/references/more.md", reference: "vc:also-missing" },
    ]);
  });

  it("does not match embedded or partial vc-like tokens", () => {
    const result = findUnresolvedSkillReferences(
      [{ source: "foo/SKILL.md", content: "not-vc:missing and vc:missing_suffix" }],
      ["foo"],
    );
    expect(result).toEqual([]);
  });

  it("deduplicates repeated references within one source", () => {
    const result = findUnresolvedSkillReferences(
      [{ source: "foo/SKILL.md", content: "vc:missing, then vc:missing again" }],
      ["foo"],
    );
    expect(result).toEqual([{ source: "foo/SKILL.md", reference: "vc:missing" }]);
  });
});
