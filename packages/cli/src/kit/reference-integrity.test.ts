import { describe, it, expect } from "vitest";
import { checkReferenceIntegrity } from "./reference-integrity.js";

describe("checkReferenceIntegrity", () => {
  it("is clean when every reference file is linked and present", () => {
    const body = "See `references/foo.md` and [bar](references/bar.md).";
    const result = checkReferenceIntegrity(body, ["references/foo.md", "references/bar.md"]);
    expect(result).toEqual({ dangling: [], orphans: [] });
  });

  it("flags a linked-but-missing reference as dangling", () => {
    const body = "Read references/gone.md for details.";
    const result = checkReferenceIntegrity(body, []);
    expect(result.dangling).toEqual(["references/gone.md"]);
    expect(result.orphans).toEqual([]);
  });

  it("flags an existing-but-unlinked reference as orphan", () => {
    const body = "No links here.";
    const result = checkReferenceIntegrity(body, ["references/orphan.md"]);
    expect(result.orphans).toEqual(["references/orphan.md"]);
    expect(result.dangling).toEqual([]);
  });

  it("detects dangling and orphan together", () => {
    const body = "Uses references/linked.md and references/missing.md.";
    const result = checkReferenceIntegrity(body, ["references/linked.md", "references/unused.md"]);
    expect(result.dangling).toEqual(["references/missing.md"]);
    expect(result.orphans).toEqual(["references/unused.md"]);
  });

  it("ignores a cross-skill reference (../<other>/references/x.md)", () => {
    // A mention of another skill's reference is not this skill's file, so it is
    // neither dangling here nor does it satisfy a local orphan.
    const body = "See ../cook/references/risk-lanes.md for the lane table.";
    const result = checkReferenceIntegrity(body, []);
    expect(result).toEqual({ dangling: [], orphans: [] });
  });

  it("counts a backticked mention as a link", () => {
    const body = "Load `references/deep.md` when needed.";
    const result = checkReferenceIntegrity(body, ["references/deep.md"]);
    expect(result.orphans).toEqual([]);
  });

  it("returns empty for a skill with no references and no mentions", () => {
    expect(checkReferenceIntegrity("plain body", [])).toEqual({ dangling: [], orphans: [] });
  });

  it("sorts findings deterministically", () => {
    const body = "references/zeta.md references/alpha.md";
    const result = checkReferenceIntegrity(body, []);
    expect(result.dangling).toEqual(["references/alpha.md", "references/zeta.md"]);
  });

  it("de-duplicates a reference mentioned multiple times", () => {
    const body = "references/x.md again references/x.md";
    const result = checkReferenceIntegrity(body, []);
    expect(result.dangling).toEqual(["references/x.md"]);
  });
});

describe("reference mention forms", () => {
  const files = ["references/alpha.md", "references/beta.md"];

  it("counts an explicitly relative mention as a mention", () => {
    // The form the ported corpus uses throughout: `./references/x.md` inside a
    // code span. Treating it as unmentioned reported 43 files that the skill
    // lists by name as orphans.
    const body = "See `./references/alpha.md` and also references/beta.md for detail.";
    expect(checkReferenceIntegrity(body, files)).toEqual({ dangling: [], orphans: [] });
  });

  it("still ignores a reference that belongs to another skill", () => {
    const body = "Borrow the table from ../cook/references/alpha.md if useful.";
    const result = checkReferenceIntegrity(body, files);
    expect(result.dangling).toEqual([]);
    expect(result.orphans).toEqual(["references/alpha.md", "references/beta.md"]);
  });

  it("still reports a mention with no file behind it", () => {
    const result = checkReferenceIntegrity("Read `./references/missing.md`.", files);
    expect(result.dangling).toEqual(["references/missing.md"]);
  });
});
