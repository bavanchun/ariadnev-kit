import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runValidate, loadCollisionAllowlist } from "./validate-command.js";
import { resolveKitRoot } from "../kit/load-kit.js";
import { renderMatrixBlock } from "../providers/matrix-drift.js";

const GOOD_FRONTMATTER = `---
name: vc:foo
description: Use this fixture skill to exercise the validate command reference check.
---

# Foo

## Output format

Output.

## Quality gates

- Check.

## Workflow position

Related: none.
`;

const REQUIRED_SECTIONS = `
## Output format

Output.

## Quality gates

- Check.

## Workflow position

Related: none.
`;

function writeSkill(kitRoot: string, body: string, refs: Record<string, string> = {}): void {
  const dir = join(kitRoot, "skills", "foo");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), body);
  const names = Object.keys(refs);
  if (names.length > 0) {
    mkdirSync(join(dir, "references"), { recursive: true });
    for (const [name, content] of Object.entries(refs)) {
      writeFileSync(join(dir, "references", name), content);
    }
  }
}

describe("runValidate", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "vcskill-validate-"));
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("passes clean on the real kit", () => {
    const result = runValidate({ kitRoot: resolveKitRoot(process.cwd()) });
    if (!result.ok) throw new Error(`real kit not clean:\n${result.summary}`);
    expect(result.ok).toBe(true);
    expect(result.counts.skills).toBeGreaterThan(0);
  });

  it("flags an orphan reference (exists but unlinked)", () => {
    writeSkill(tmp, `${GOOD_FRONTMATTER}\nNo links here.\n`, { "orphan.md": "# Orphan\n" });
    const result = runValidate({ kitRoot: tmp });
    expect(result.ok).toBe(false);
    expect(result.findings).toContainEqual(
      expect.objectContaining({ skill: "foo", kind: "orphan" }),
    );
  });

  it("passes when the reference is linked", () => {
    writeSkill(tmp, `${GOOD_FRONTMATTER}\nSee references/used.md.\n`, { "used.md": "# Used\n" });
    const result = runValidate({ kitRoot: tmp });
    expect(result.ok).toBe(true);
  });

  it("flags a dangling reference (linked but missing)", () => {
    writeSkill(tmp, `${GOOD_FRONTMATTER}\nSee references/gone.md.\n`);
    const result = runValidate({ kitRoot: tmp });
    expect(result.ok).toBe(false);
    expect(result.findings).toContainEqual(
      expect.objectContaining({ skill: "foo", kind: "dangling" }),
    );
  });

  it("flags an unresolved vc skill reference under kind skillref", () => {
    writeSkill(tmp, `${GOOD_FRONTMATTER}\nUse vc:missing.\n`);
    const result = runValidate({ kitRoot: tmp });
    expect(result.ok).toBe(false);
    expect(result.findings).toContainEqual(
      expect.objectContaining({ skill: "foo", kind: "skillref", message: expect.stringContaining("vc:missing") }),
    );
  });

  it("checks vc skill references inside linked reference files", () => {
    writeSkill(tmp, `${GOOD_FRONTMATTER}\nSee references/used.md.\n`, {
      "used.md": "# Used\n\nContinue with vc:missing.\n",
    });
    const result = runValidate({ kitRoot: tmp });
    expect(result.findings).toContainEqual(
      expect.objectContaining({ kind: "skillref", message: expect.stringContaining("references/used.md") }),
    );
  });

  it("reports a lint error as a single (kit) finding and fails", () => {
    // name mismatch → loadKit throws KitValidationError
    writeSkill(tmp, `---\nname: vc:wrong\ndescription: A fixture whose name does not match its directory slug value.\n---\n\n# Foo\n`);
    const result = runValidate({ kitRoot: tmp });
    expect(result.ok).toBe(false);
    expect(result.findings[0].kind).toBe("lint");
  });

  describe("collision allowlist", () => {
    function writeNamedSkill(kitRoot: string, slug: string, description: string): void {
      const dir = join(kitRoot, "skills", slug);
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, "SKILL.md"),
        `---\nname: vc:${slug}\ndescription: ${description}\n---\n\n# ${slug}\n${REQUIRED_SECTIONS}`,
      );
    }
    const DESC_A = "Use this to migrate database schema changes safely with rollback support and checks.";
    const DESC_B = "Use this to migrate database schema changes safely with rollback support and guards.";

    it("flags a near-duplicate pair as an error collision by default", () => {
      writeNamedSkill(tmp, "alpha", DESC_A);
      writeNamedSkill(tmp, "beta", DESC_B);
      const result = runValidate({ kitRoot: tmp });
      expect(result.findings.some((f) => f.kind === "collision" && (f.level ?? "error") === "error")).toBe(true);
    });

    it("suppresses the pair when it is allowlisted with a reason", () => {
      writeNamedSkill(tmp, "alpha", DESC_A);
      writeNamedSkill(tmp, "beta", DESC_B);
      writeFileSync(
        join(tmp, "collision-allowlist.json"),
        JSON.stringify([{ a: "vc:alpha", b: "vc:beta", reason: "adjacent by design" }]),
      );
      const result = runValidate({ kitRoot: tmp });
      expect(result.findings.some((f) => f.kind === "collision")).toBe(false);
    });
  });

  describe("loadCollisionAllowlist", () => {
    it("returns [] when the file is absent", () => {
      expect(loadCollisionAllowlist(tmp)).toEqual([]);
    });

    it("returns [] for malformed JSON", () => {
      writeFileSync(join(tmp, "collision-allowlist.json"), "{not json");
      expect(loadCollisionAllowlist(tmp)).toEqual([]);
    });

    it("returns [] when the top level is not an array", () => {
      writeFileSync(join(tmp, "collision-allowlist.json"), JSON.stringify({ a: 1 }));
      expect(loadCollisionAllowlist(tmp)).toEqual([]);
    });

    it("drops entries missing a non-empty reason or string endpoints", () => {
      writeFileSync(
        join(tmp, "collision-allowlist.json"),
        JSON.stringify([
          { a: "vc:x", b: "vc:y", reason: "kept" },
          { a: "vc:x", b: "vc:y", reason: "  " },
          { a: "vc:x", b: 2, reason: "bad endpoint" },
          null,
        ]),
      );
      expect(loadCollisionAllowlist(tmp)).toEqual([{ a: "vc:x", b: "vc:y", reason: "kept" }]);
    });
  });

  describe("--check (provider matrix drift)", () => {
    const realKit = () => resolveKitRoot(process.cwd());

    it("passes when the README matrix is in sync", () => {
      const readme = join(tmp, "README.md");
      writeFileSync(readme, `# vcskill\n\n${renderMatrixBlock()}\n`);
      const result = runValidate({ kitRoot: realKit(), check: true, readmePath: readme });
      expect(result.ok).toBe(true);
      expect(result.findings.some((f) => f.kind === "matrix")).toBe(false);
    });

    it("fails with a matrix finding when the README block is stale", () => {
      const readme = join(tmp, "README.md");
      const stale = renderMatrixBlock().replace(".claude/skills/", ".claude/WRONG/");
      writeFileSync(readme, `# vcskill\n\n${stale}\n`);
      const result = runValidate({ kitRoot: realKit(), check: true, readmePath: readme });
      expect(result.ok).toBe(false);
      expect(result.findings).toContainEqual(expect.objectContaining({ kind: "matrix" }));
    });

    it("does not touch the matrix without --check", () => {
      const result = runValidate({ kitRoot: realKit() });
      expect(result.findings.some((f) => f.kind === "matrix")).toBe(false);
    });
  });
});
