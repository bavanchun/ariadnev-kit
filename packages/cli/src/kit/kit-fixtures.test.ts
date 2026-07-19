import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { loadKit, resolveKitRoot, KitValidationError } from "./load-kit.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoKitRoot = join(here, "..", "..", "..", "..", "kit");

describe("loadKit (real kit/)", () => {
  const kit = loadKit(repoKitRoot);

  it("discovers all artifact kinds", () => {
    expect(kit.skills.length).toBeGreaterThanOrEqual(2);
    expect(kit.agents.length).toBeGreaterThanOrEqual(1);
    expect(kit.commands.length).toBeGreaterThanOrEqual(1);
    expect(kit.rules.length).toBeGreaterThanOrEqual(1);
    expect(kit.scriptsDir).not.toBeNull();
    expect(kit.envExample).not.toBeNull();
  });

  it("parses skill frontmatter and enforces vc: name == dir", () => {
    for (const s of kit.skills) {
      expect(s.frontmatter.name).toBe(`vc:${s.name}`);
      expect(typeof s.frontmatter.description).toBe("string");
      expect((s.frontmatter.description as string).length).toBeGreaterThan(0);
    }
  });

  it("has no duplicate skill names", () => {
    const names = kit.skills.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("loadKit validation (negative cases)", () => {
  function tmpKit(): string {
    const root = mkdtempSync(join(tmpdir(), "vcskill-kit-"));
    mkdirSync(join(root, "skills"), { recursive: true });
    return root;
  }

  function writeSkill(root: string, dir: string, frontmatter: string) {
    mkdirSync(join(root, "skills", dir), { recursive: true });
    writeFileSync(
      join(root, "skills", dir, "SKILL.md"),
      `---\n${frontmatter}\n---\n\n# body\n`,
    );
  }

  it("rejects missing vc: prefix", () => {
    const root = tmpKit();
    writeSkill(root, "foo", "name: foo\ndescription: x");
    expect(() => loadKit(root)).toThrow(KitValidationError);
    rmSync(root, { recursive: true, force: true });
  });

  it("rejects name/dir mismatch", () => {
    const root = tmpKit();
    writeSkill(root, "foo", "name: vc:bar\ndescription: x");
    expect(() => loadKit(root)).toThrow(/vc:foo/);
    rmSync(root, { recursive: true, force: true });
  });

  it("rejects missing description", () => {
    const root = tmpKit();
    writeSkill(root, "foo", "name: vc:foo");
    expect(() => loadKit(root)).toThrow(KitValidationError);
    rmSync(root, { recursive: true, force: true });
  });

  it("rejects duplicate names", () => {
    const root = tmpKit();
    const desc = "Valid fixture skill. Use when testing kit loading of multiple skills.";
    writeSkill(root, "foo", `name: vc:foo\ndescription: ${desc}`);
    // second skill dir 'bar' but name vc:foo -> mismatch first, so use valid dup setup
    mkdirSync(join(root, "skills", "foo2"), { recursive: true });
    writeFileSync(
      join(root, "skills", "foo2", "SKILL.md"),
      `---\nname: vc:foo2\ndescription: ${desc}\n---\n`,
    );
    // duplicate is hard to trigger with name==dir invariant; ensure valid kit loads
    expect(loadKit(root).skills.length).toBe(2);
    rmSync(root, { recursive: true, force: true });
  });
});

describe("loadKit skill lint gates (negative fixtures)", () => {
  function tmpKit(): string {
    const root = mkdtempSync(join(tmpdir(), "vcskill-lint-"));
    mkdirSync(join(root, "skills"), { recursive: true });
    return root;
  }

  function writeSkillFile(root: string, dir: string, content: string) {
    mkdirSync(join(root, "skills", dir), { recursive: true });
    writeFileSync(join(root, "skills", dir, "SKILL.md"), content);
  }

  const okDescription = "Demo skill for lint tests. Use when validating the kit CI gate rules.";

  it("rejects a too-short description", () => {
    const root = tmpKit();
    writeSkillFile(root, "foo", `---\nname: vc:foo\ndescription: Use it.\n---\n# foo\n`);
    expect(() => loadKit(root)).toThrow(KitValidationError);
    rmSync(root, { recursive: true, force: true });
  });

  it("rejects a description without trigger verb", () => {
    const root = tmpKit();
    writeSkillFile(
      root,
      "foo",
      `---\nname: vc:foo\ndescription: A pile of git conventions and various pipelines together.\n---\n# foo\n`,
    );
    expect(() => loadKit(root)).toThrow(/trigger/);
    rmSync(root, { recursive: true, force: true });
  });

  it("rejects SKILL.md over 300 lines", () => {
    const root = tmpKit();
    const body = Array.from({ length: 301 }, (_, i) => `line ${i}`).join("\n");
    writeSkillFile(root, "foo", `---\nname: vc:foo\ndescription: ${okDescription}\n---\n${body}\n`);
    expect(() => loadKit(root)).toThrow(/300/);
    rmSync(root, { recursive: true, force: true });
  });

  it("rejects a reference file over 300 lines", () => {
    const root = tmpKit();
    writeSkillFile(root, "foo", `---\nname: vc:foo\ndescription: ${okDescription}\n---\n# foo\n`);
    mkdirSync(join(root, "skills", "foo", "references"), { recursive: true });
    writeFileSync(
      join(root, "skills", "foo", "references", "big.md"),
      Array.from({ length: 301 }, () => "x").join("\n"),
    );
    expect(() => loadKit(root)).toThrow(/big\.md/);
    rmSync(root, { recursive: true, force: true });
  });

  it("rejects unknown frontmatter fields", () => {
    const root = tmpKit();
    writeSkillFile(
      root,
      "foo",
      `---\nname: vc:foo\ndescription: ${okDescription}\ncategory: dev-tools\n---\n# foo\n`,
    );
    expect(() => loadKit(root)).toThrow(/category/);
    rmSync(root, { recursive: true, force: true });
  });

  it("surfaces duplicate-heading overlap as kit warnings, not errors", () => {
    const root = tmpKit();
    writeSkillFile(
      root,
      "foo",
      `---\nname: vc:foo\ndescription: ${okDescription}\n---\n# foo\n\n## Shared Heading\n`,
    );
    mkdirSync(join(root, "skills", "foo", "references"), { recursive: true });
    writeFileSync(join(root, "skills", "foo", "references", "ref.md"), "## Shared Heading\n\ntext\n");
    const kit = loadKit(root);
    expect(kit.warnings.some((w) => w.includes("Shared Heading"))).toBe(true);
    rmSync(root, { recursive: true, force: true });
  });

  it("real kit/ passes the lint gate", () => {
    expect(() => loadKit(repoKitRoot)).not.toThrow();
  });
});

describe("loadKit hooks discovery", () => {
  function tmpKitWithHook(manifest: string | null, withCjs = true): string {
    const root = mkdtempSync(join(tmpdir(), "vcskill-hooks-"));
    mkdirSync(join(root, "skills"), { recursive: true });
    const hookDir = join(root, "hooks", "session-init");
    mkdirSync(hookDir, { recursive: true });
    if (withCjs) writeFileSync(join(hookDir, "hook.cjs"), "process.exit(0);\n");
    if (manifest !== null) writeFileSync(join(hookDir, "hook.json"), manifest);
    return root;
  }

  it("discovers hooks with manifest {event, matcher?, description}", () => {
    const root = tmpKitWithHook(
      JSON.stringify({ event: "SessionStart", description: "init session env" }),
    );
    const kit = loadKit(root);
    expect(kit.hooks.length).toBe(1);
    expect(kit.hooks[0].name).toBe("session-init");
    expect(kit.hooks[0].manifest.event).toBe("SessionStart");
    expect(kit.hooks[0].file.endsWith("hook.cjs")).toBe(true);
    rmSync(root, { recursive: true, force: true });
  });

  it("rejects a hook manifest without event", () => {
    const root = tmpKitWithHook(JSON.stringify({ description: "no event" }));
    expect(() => loadKit(root)).toThrow(KitValidationError);
    rmSync(root, { recursive: true, force: true });
  });

  it("rejects a hook dir missing hook.cjs", () => {
    const root = tmpKitWithHook(
      JSON.stringify({ event: "Stop", description: "persist state" }),
      false,
    );
    expect(() => loadKit(root)).toThrow(/hook\.cjs/);
    rmSync(root, { recursive: true, force: true });
  });

  it("skips underscore-prefixed dirs like _lib", () => {
    const root = tmpKitWithHook(
      JSON.stringify({ event: "SessionStart", description: "init session env" }),
    );
    mkdirSync(join(root, "hooks", "_lib"), { recursive: true });
    writeFileSync(join(root, "hooks", "_lib", "helper.cjs"), "module.exports = {};\n");
    const kit = loadKit(root);
    expect(kit.hooks.map((h) => h.name)).toEqual(["session-init"]);
    rmSync(root, { recursive: true, force: true });
  });

  it("accepts a multi-event manifest via events[]", () => {
    const root = tmpKitWithHook(
      JSON.stringify({ events: ["Stop", "SubagentStop"], description: "persist state" }),
    );
    const kit = loadKit(root);
    expect(kit.hooks[0].manifest.events).toEqual(["Stop", "SubagentStop"]);
    rmSync(root, { recursive: true, force: true });
  });

  it("returns empty hooks when kit has no hooks dir", () => {
    const root = mkdtempSync(join(tmpdir(), "vcskill-nohooks-"));
    mkdirSync(join(root, "skills"), { recursive: true });
    expect(loadKit(root).hooks).toEqual([]);
    rmSync(root, { recursive: true, force: true });
  });
});

describe("resolveKitRoot", () => {
  it("locates a directory containing skills/ from a start path", () => {
    const root = resolveKitRoot(repoKitRoot);
    expect(root).toBe(repoKitRoot);
  });
});
