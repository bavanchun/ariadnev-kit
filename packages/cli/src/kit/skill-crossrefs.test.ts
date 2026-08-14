import { describe, expect, it } from "vitest";
import { findUnresolvedSkillReferences } from "./skill-crossrefs.js";

describe("findUnresolvedSkillReferences", () => {
  it("resolves references against the complete supplied inventory", () => {
    const result = findUnresolvedSkillReferences(
      [
        { source: "foo/SKILL.md", content: "Use av:bar before av:baz-qux." },
        { source: "foo/references/more.md", content: "Related: av:foo." },
      ],
      ["foo", "bar", "baz-qux"],
    );
    expect(result).toEqual([]);
  });

  it("returns each unresolved reference with its source file", () => {
    const result = findUnresolvedSkillReferences(
      [
        { source: "foo/SKILL.md", content: "Use av:missing." },
        { source: "foo/references/more.md", content: "Then av:also-missing." },
      ],
      ["foo"],
    );
    expect(result).toEqual([
      { source: "foo/SKILL.md", reference: "av:missing" },
      { source: "foo/references/more.md", reference: "av:also-missing" },
    ]);
  });

  it("does not match embedded or partial av-like tokens", () => {
    const result = findUnresolvedSkillReferences(
      [{ source: "foo/SKILL.md", content: "not-vc:missing and av:missing_suffix" }],
      ["foo"],
    );
    expect(result).toEqual([]);
  });

  it("deduplicates repeated references within one source", () => {
    const result = findUnresolvedSkillReferences(
      [{ source: "foo/SKILL.md", content: "av:missing, then av:missing again" }],
      ["foo"],
    );
    expect(result).toEqual([{ source: "foo/SKILL.md", reference: "av:missing" }]);
  });
});
