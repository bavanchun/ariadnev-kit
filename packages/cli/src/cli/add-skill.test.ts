import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, existsSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { renderSkillTemplate, isValidSlug } from "../kit/skill-template.js";
import { parseFrontmatter } from "../adapt/frontmatter.js";
import { runAddSkill } from "./add-skill-command.js";
import { loadKit } from "../kit/load-kit.js";

const here = dirname(fileURLToPath(import.meta.url));
const srcKit = join(here, "..", "..", "..", "..", "kit");

describe("renderSkillTemplate", () => {
  it("renders parseable SKILL.md with vc: prefix", () => {
    const md = renderSkillTemplate({ slug: "my-skill", description: "Do a thing." });
    const { data } = parseFrontmatter(md);
    expect(data.name).toBe("vc:my-skill");
    expect(data.description).toBe("Do a thing.");
  });
  it("rejects invalid slug", () => {
    expect(() => renderSkillTemplate({ slug: "Bad_Slug", description: "x" })).toThrow();
    expect(isValidSlug("good-slug-1")).toBe(true);
    expect(isValidSlug("Bad")).toBe(false);
  });
});

describe("runAddSkill", () => {
  let kitRoot: string;
  beforeEach(() => {
    const sandbox = mkdtempSync(join(tmpdir(), "vcskill-add-"));
    kitRoot = join(sandbox, "kit");
    mkdirSync(kitRoot, { recursive: true });
    cpSync(srcKit, kitRoot, { recursive: true });
  });
  afterEach(() => rmSync(dirname(kitRoot), { recursive: true, force: true }));

  it("creates a skill that loadKit accepts", () => {
    const res = runAddSkill({ name: "foo", description: "A foo skill.", kitRoot });
    expect(existsSync(res.path)).toBe(true);
    expect(loadKit(kitRoot).skills.some((s) => s.name === "foo")).toBe(true);
  });
  it("rejects duplicate name", () => {
    runAddSkill({ name: "foo", description: "x", kitRoot });
    expect(() => runAddSkill({ name: "foo", description: "x", kitRoot })).toThrow(/already exists/);
  });
  it("rejects invalid name", () => {
    expect(() => runAddSkill({ name: "Bad Name", description: "x", kitRoot })).toThrow(/invalid/);
  });
});
