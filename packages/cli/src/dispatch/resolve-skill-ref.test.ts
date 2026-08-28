import { describe, expect, it } from "vitest";
import { EXIT } from "../cli/exit-codes.js";
import { parseSkillRef, resolveSkill, type ResolveDeps } from "./resolve-skill-ref.js";

/** A kits tree with one kit `demo` holding one skill `scout`. */
function deps(overrides: Partial<ResolveDeps> = {}): ResolveDeps {
  const dirs = new Set(["/kits/demo", "/kits/demo/skills/scout", "/embedded", "/embedded/skills/ported"]);
  const files = new Set(["/kits/demo/skills/scout/SKILL.md", "/embedded/skills/ported/SKILL.md"]);
  return {
    kitsDir: "/kits",
    embedded: { name: "ariadnev", root: "/embedded" },
    dirExists: (p) => dirs.has(p),
    fileExists: (p) => files.has(p),
    listKits: () => ["demo"],
    listSkills: () => ["scout"],
    ...overrides,
  };
}

describe("parsing a skill reference", () => {
  it("splits the two segments", () => {
    expect(parseSkillRef("demo/scout")).toEqual({ kit: "demo", skill: "scout" });
  });

  it("refuses a reference with no slash, because that spelling means a workflow", () => {
    // The slash is the whole discriminator between dispatch and the deprecated
    // harness spelling. Guessing here would reinterpret an invocation someone
    // already has in a script.
    expect(() => parseSkillRef("scout")).toThrow(/exactly <kit>\/<skill>/);
  });

  it("refuses more than two segments rather than taking the first two", () => {
    expect(() => parseSkillRef("demo/scout/extra")).toThrow(/exactly <kit>\/<skill>/);
  });

  it.each([
    ["..", "demo/.."],
    ["parent traversal in the kit", "../etc/passwd"],
    ["absolute-looking", "/etc/passwd"],
    ["empty kit", "/scout"],
    ["empty skill", "demo/"],
    ["a leading dash a spawned binary would read as a flag", "demo/-rf"],
    ["uppercase", "demo/Scout"],
    ["a backslash", "demo/..\\windows"],
    ["a dot segment", "demo/."],
  ])("rejects %s", (_label, raw) => {
    expect(() => parseSkillRef(raw)).toThrow();
  });

  it("rejects a NUL byte in a segment", () => {
    expect(() => parseSkillRef(`demo/sc${String.fromCharCode(0)}out`)).toThrow(/invalid skill name/);
  });

  it("reports a bad reference as a usage error, not a failure", () => {
    // Exit 2 means "you invoked it wrong". A script that gets 1 back would read
    // it as "the skill ran and said no".
    try {
      parseSkillRef("scout");
      expect.unreachable("should have thrown");
    } catch (error) {
      expect((error as { exitCode: number }).exitCode).toBe(EXIT.usage);
    }
  });
});

describe("resolving a skill reference to a directory", () => {
  it("finds a skill in the kits directory", () => {
    expect(resolveSkill({ kit: "demo", skill: "scout" }, deps())).toEqual({
      ref: { kit: "demo", skill: "scout" },
      dir: "/kits/demo/skills/scout",
      skillFile: "/kits/demo/skills/scout/SKILL.md",
      source: "kits-dir",
    });
  });

  it("falls back to the embedded kit, so dispatch works with no kits directory at all", () => {
    const resolved = resolveSkill({ kit: "ariadnev", skill: "ported" }, deps());
    expect(resolved.source).toBe("embedded");
    expect(resolved.dir).toBe("/embedded/skills/ported");
  });

  it("lets a kits-directory kit shadow the embedded one of the same name", () => {
    // A developer editing the shipped kit checks it out under ./kits. If the
    // binary's own copy won, their edits would be invisible and dispatch would
    // silently run different bytes than the ones they are looking at.
    const shadow = deps({
      dirExists: (p) => ["/kits/ariadnev", "/kits/ariadnev/skills/ported"].includes(p) || p === "/embedded",
      fileExists: (p) => p === "/kits/ariadnev/skills/ported/SKILL.md",
    });
    expect(resolveSkill({ kit: "ariadnev", skill: "ported" }, shadow).source).toBe("kits-dir");
  });

  it("names the directory it searched when the kit is unknown", () => {
    expect(() => resolveSkill({ kit: "nope", skill: "scout" }, deps())).toThrow(/unknown kit "nope" \(looked in \/kits\)/);
  });

  it("suggests near names for an unknown skill", () => {
    expect(() => resolveSkill({ kit: "demo", skill: "scou" }, deps())).toThrow(/did you mean: scout/);
  });

  it("distinguishes a broken skill from a missing one", () => {
    // A directory with no SKILL.md exists but cannot be dispatched. Reporting
    // "no such skill" about a directory the user can see costs an hour.
    const broken = deps({ fileExists: () => false });
    expect(() => resolveSkill({ kit: "demo", skill: "scout" }, broken)).toThrow(/has no SKILL\.md at/);
  });

  it("does not consult the embedded kit for a kit of another name", () => {
    let asked = false;
    const spy = deps({
      dirExists: (p) => {
        if (p === "/embedded") asked = true;
        return false;
      },
    });
    expect(() => resolveSkill({ kit: "other", skill: "scout" }, spy)).toThrow(/unknown kit/);
    expect(asked, "the embedded kit was probed for a ref that cannot name it").toBe(false);
  });
});
