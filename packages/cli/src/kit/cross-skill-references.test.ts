import { describe, expect, it } from "vitest";
import { buildSkillIndex, checkCrossSkillReferences } from "./cross-skill-references.js";

/** Two skills, each with a SKILL.md and one reference file. */
const index = buildSkillIndex([
  { name: "cook", files: ["SKILL.md", "references/workflow-routing.md"] },
  { name: "plan", files: ["SKILL.md", "references/phases.md", "scripts/render.mjs"] },
]);

const at = (source: string, content: string) => [{ source, content }];

describe("checkCrossSkillReferences", () => {
  it("passes a prefixed link that resolves", () => {
    const found = checkCrossSkillReferences(
      at("cook/SKILL.md", "see `../av-plan/references/phases.md` for detail"),
      index,
      [],
    );
    expect(found).toEqual([]);
  });

  it("flags an unprefixed link even when the target exists", () => {
    // The whole point of the shape rule. Resolving by name with `av-` stripped
    // would call this fine, and it breaks the moment installed dirs get the
    // prefix.
    const found = checkCrossSkillReferences(
      at("cook/SKILL.md", "see `../plan/references/phases.md`"),
      index,
      [],
    );
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ reason: "bad-shape", targetSkill: "plan" });
  });

  it("flags a stale kits/core/skills root", () => {
    const found = checkCrossSkillReferences(
      at("ship/SKILL.md", "see `kits/core/skills/plan/references/phases.md`"),
      index,
      [],
    );
    expect(found).toHaveLength(1);
    expect(found[0]!.reason).toBe("bad-shape");
  });

  it("does not double the av- prefix when the stale root already carries it", () => {
    // The corpus shape: the rename updated the slug but left the old root, so a
    // naive suggestion reads av-av-plan.
    const found = checkCrossSkillReferences(
      at("ship/SKILL.md", "see `kits/core/skills/av-plan/references/phases.md`"),
      index,
      [],
    );
    expect(found).toHaveLength(1);
    expect(found[0]!.detail).toContain("../av-plan/references/phases.md");
    expect(found[0]!.detail).not.toContain("av-av-");
    expect(found[0]!.targetSkill).toBe("plan");
  });

  it("flags an unknown skill", () => {
    const found = checkCrossSkillReferences(
      at("cook/SKILL.md", "see `../av-nope/references/x.md`"),
      index,
      [],
    );
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ reason: "unknown-skill", targetSkill: "nope" });
  });

  it("flags a known skill with a missing file", () => {
    const found = checkCrossSkillReferences(
      at("cook/SKILL.md", "see `../av-plan/references/ghost.md`"),
      index,
      [],
    );
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ reason: "unknown-file", targetFile: "references/ghost.md" });
  });

  it("skips a skill whose port has not landed yet", () => {
    const found = checkCrossSkillReferences(
      at("cook/SKILL.md", "see `../av-later/references/x.md`"),
      index,
      ["later"],
    );
    expect(found).toEqual([]);
  });

  it("catches a link written inside a reference file", () => {
    const found = checkCrossSkillReferences(
      at("cook/references/workflow-routing.md", "see `../../av-plan/references/ghost.md`"),
      index,
      [],
    );
    expect(found).toHaveLength(1);
    expect(found[0]!.reason).toBe("unknown-file");
  });

  it("does not flag bare av:<slug> prose", () => {
    const found = checkCrossSkillReferences(
      at("cook/SKILL.md", "hand off to av:plan when the design is settled"),
      index,
      [],
    );
    expect(found).toEqual([]);
  });

  it("does not flag a skill's own local references", () => {
    const found = checkCrossSkillReferences(
      at("cook/SKILL.md", "see `references/workflow-routing.md` and `./references/workflow-routing.md`"),
      index,
      [],
    );
    expect(found).toEqual([]);
  });

  it("passes a self-reference written in the cross-skill form", () => {
    const found = checkCrossSkillReferences(
      at("cook/SKILL.md", "see `../av-cook/references/workflow-routing.md`"),
      index,
      [],
    );
    expect(found).toEqual([]);
  });

  it("resolves SKILL.md and scripts targets, not only references", () => {
    const found = checkCrossSkillReferences(
      at("cook/SKILL.md", "`../av-plan/SKILL.md` and `../av-plan/scripts/render.mjs`"),
      index,
      [],
    );
    expect(found).toEqual([]);
  });

  it("flags a link whose ../ depth cannot reach the skills root", () => {
    // From inside references/ the sibling skill is two levels up. One level up
    // resolves to a file that exists by name, so nothing but depth catches this.
    const found = checkCrossSkillReferences(
      at("cook/references/workflow-routing.md", "see `../av-plan/references/phases.md`"),
      index,
      [],
    );
    expect(found).toHaveLength(1);
    expect(found[0]!.reason).toBe("bad-shape");
  });

  it("reports each distinct path once per source", () => {
    const found = checkCrossSkillReferences(
      at("cook/SKILL.md", "`../av-nope/references/x.md` twice: `../av-nope/references/x.md`"),
      index,
      [],
    );
    expect(found).toHaveLength(1);
  });
});

describe("buildSkillIndex", () => {
  it("indexes files per skill", () => {
    expect(index.get("cook")?.has("references/workflow-routing.md")).toBe(true);
    expect(index.get("cook")?.has("references/phases.md")).toBe(false);
  });
});
