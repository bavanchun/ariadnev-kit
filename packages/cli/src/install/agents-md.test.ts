import { describe, it, expect } from "vitest";
import { mergeAgentsBlock, removeAgentsBlock, AGENTS_MD_START, AGENTS_MD_END } from "./agents-md.js";

describe("mergeAgentsBlock", () => {
  it("inserts a managed block, preserving user content", () => {
    const out = mergeAgentsBlock("# My Project\n\nhand-written notes.", "rule body");
    expect(out).toContain("# My Project");
    expect(out).toContain("hand-written notes.");
    expect(out).toContain(`${AGENTS_MD_START}\nrule body\n${AGENTS_MD_END}`);
  });

  it("replaces the managed block idempotently", () => {
    const first = mergeAgentsBlock("intro", "v1");
    const second = mergeAgentsBlock(first, "v2");
    expect(second).toContain("v2");
    expect(second).not.toContain("v1");
    expect(second.match(new RegExp(AGENTS_MD_START, "g"))!.length).toBe(1);
    expect(second).toContain("intro");
  });

  it("handles empty existing file", () => {
    expect(mergeAgentsBlock("", "body")).toBe(`${AGENTS_MD_START}\nbody\n${AGENTS_MD_END}\n`);
  });
});

describe("removeAgentsBlock", () => {
  it("round-trips: merge then remove restores the original user content exactly", () => {
    const original = "# My Project\n\nhand-written notes.";
    const merged = mergeAgentsBlock(original, "rule body");
    expect(removeAgentsBlock(merged)).toBe(original);
  });

  it("round-trips from an originally-empty file back to empty", () => {
    const merged = mergeAgentsBlock("", "rule body");
    expect(removeAgentsBlock(merged)).toBe("");
  });

  it("is a no-op when no managed block is present", () => {
    expect(removeAgentsBlock("just user content")).toBe("just user content");
  });
});

describe("pre-rename managed block", () => {
  // AGENTS.md is the user's file. A block written under the old brand is real
  // data on disk; if merge stops recognizing it, every reinstall appends a
  // second managed block and the two drift apart.
  const OLD_START = "<!-- vcskill:start -->"; // brand-drift-allow: marker written by pre-rename installs
  const OLD_END = "<!-- vcskill:end -->"; // brand-drift-allow: marker written by pre-rename installs

  it("replaces an old-brand block instead of appending a second one", () => {
    const existing = `# Project\n\n${OLD_START}\nold rules\n${OLD_END}\n`;
    const out = mergeAgentsBlock(existing, "new rules");
    expect(out).toContain("new rules");
    expect(out).not.toContain("old rules");
    expect(out).not.toContain(OLD_START);
    expect(out.match(/<!-- \w+:start -->/g)).toHaveLength(1);
  });

  it("strips an old-brand block on uninstall, restoring user content", () => {
    const original = "# Project\n\nhand-written notes.";
    const withOld = `${original}\n\n${OLD_START}\nold rules\n${OLD_END}\n`;
    expect(removeAgentsBlock(withOld)).toBe(original);
  });
});
