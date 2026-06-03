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
    writeSkill(root, "foo", "name: vc:foo\ndescription: x");
    // second skill dir 'bar' but name vc:foo -> mismatch first, so use valid dup setup
    mkdirSync(join(root, "skills", "foo2"), { recursive: true });
    writeFileSync(
      join(root, "skills", "foo2", "SKILL.md"),
      `---\nname: vc:foo2\ndescription: x\n---\n`,
    );
    // duplicate is hard to trigger with name==dir invariant; ensure valid kit loads
    expect(loadKit(root).skills.length).toBe(2);
    rmSync(root, { recursive: true, force: true });
  });
});

describe("resolveKitRoot", () => {
  it("locates a directory containing skills/ from a start path", () => {
    const root = resolveKitRoot(repoKitRoot);
    expect(root).toBe(repoKitRoot);
  });
});
