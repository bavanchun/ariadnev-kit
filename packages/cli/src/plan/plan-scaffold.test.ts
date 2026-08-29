import { describe, expect, it } from "vitest";
import { checkPlanIntegrity } from "./plan-mutations.js";
import {
  appendPhaseRow,
  nextPhaseNumber,
  phaseFileName,
  phaseTableRow,
  planDirName,
  planStamp,
  renderPhaseMd,
  renderPlanMd,
  slugify,
} from "./plan-scaffold.js";

describe("slugs", () => {
  it("lowercases, strips punctuation and collapses separators", () => {
    expect(slugify("Add  the: WATCH daemon!")).toBe("add-the-watch-daemon");
  });

  it("folds accents rather than dropping the word", () => {
    expect(slugify("Cải tiến kế hoạch")).toBe("cai-tien-ke-hoach");
  });

  it("never ends in a separator, even after truncation", () => {
    expect(slugify("x".repeat(70))).toHaveLength(60);
    expect(slugify("a ".repeat(40)).endsWith("-")).toBe(false);
  });

  it("gives back nothing for a title with nothing usable in it", () => {
    expect(slugify("!!! ???")).toBe("");
  });
});

describe("directory and file names", () => {
  it("matches the shape every plan in this repository already uses", () => {
    expect(planDirName("260829-1420", "AK parity")).toBe("260829-1420-ak-parity");
    expect(phaseFileName(3, "Schema work")).toBe("phase-03-schema-work.md");
  });

  it("keeps a usable name when the title slugs to nothing", () => {
    expect(planDirName("260829-1420", "???")).toBe("260829-1420");
    expect(phaseFileName(7, "!!")).toBe("phase-07.md");
  });

  it("stamps two-digit year and no seconds, which is what is on disk", () => {
    expect(planStamp(new Date(2026, 7, 29, 14, 20, 55))).toBe("260829-1420");
  });
});

describe("choosing the next phase number", () => {
  it("takes max + 1, never the first gap", () => {
    // A plan whose phase 2 was deleted must not hand out 2 again and collide
    // with the phase 3 that still depends on it.
    expect(nextPhaseNumber(["plan.md", "phase-01-a.md", "phase-03-c.md"])).toBe(4);
  });

  it("starts at 1 for an empty plan and ignores unrelated files", () => {
    expect(nextPhaseNumber(["plan.md", "notes.md", "phase-notanumber.md"])).toBe(1);
  });
});

describe("the templates", () => {
  it("produce a plan its own validator accepts", () => {
    // The round trip that matters: a scaffold whose output `plan validate`
    // rejects teaches the user that the validator is noise.
    const files = {
      "plan.md": renderPlanMd({ title: "New plan", created: "260829" }),
      "phase-01-first.md": renderPhaseMd({ phase: 1, title: "First" }),
    };
    expect(checkPlanIntegrity(files)).toEqual([]);
  });

  it("escapes a title that would otherwise break the frontmatter", () => {
    const md = renderPlanMd({ title: 'A "quoted" plan', created: "260829" });
    expect(md).toContain('title: "A \\"quoted\\" plan"');
    expect(checkPlanIntegrity({ "plan.md": md })).toEqual([]);
  });

  it("writes the dependencies a phase was given", () => {
    expect(renderPhaseMd({ phase: 4, title: "T", dependencies: [1, 2] })).toContain("dependencies: [1, 2]");
    expect(renderPhaseMd({ phase: 1, title: "T" })).toContain("dependencies: []");
  });

  it("refuses a status the validator would reject", () => {
    expect(() => renderPlanMd({ title: "x", created: "260829", status: "wibble" as never })).toThrow(/not one of/);
  });
});

describe("appending a row to the phase table", () => {
  const plan = renderPlanMd({ title: "P", created: "260829" });

  it("lands inside the table, not at the end of the file", () => {
    // plan.md has sections after its table, and a row under "Open questions" is
    // not in the table at all.
    const updated = appendPhaseRow(plan, phaseTableRow(1, "First", "phase-01-first.md")) as string;
    const lines = updated.split("\n");
    const row = lines.findIndex((line) => line.includes("phase-01-first.md"));
    const openQuestions = lines.findIndex((line) => line.startsWith("## Open questions"));
    expect(row).toBeGreaterThan(-1);
    expect(row).toBeLessThan(openQuestions);
  });

  it("appends after an existing row rather than before it", () => {
    const one = appendPhaseRow(plan, phaseTableRow(1, "A", "phase-01-a.md")) as string;
    const two = appendPhaseRow(one, phaseTableRow(2, "B", "phase-02-b.md")) as string;
    expect(two.indexOf("phase-01-a.md")).toBeLessThan(two.indexOf("phase-02-b.md"));
  });

  it("declines rather than guessing when there is no table", () => {
    // Silently rewriting someone's index is worse than saying it could not.
    expect(appendPhaseRow("# Just prose\n\nNo table here.\n", "| 1 | x |")).toBeNull();
  });
});
