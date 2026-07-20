import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runValidate } from "./validate-command.js";
import { resolveKitRoot } from "../kit/load-kit.js";

const GOOD_FRONTMATTER = `---
name: vc:foo
description: Use this fixture skill to exercise the validate command reference check.
---

# Foo
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

  it("reports a lint error as a single (kit) finding and fails", () => {
    // name mismatch → loadKit throws KitValidationError
    writeSkill(tmp, `---\nname: vc:wrong\ndescription: A fixture whose name does not match its directory slug value.\n---\n\n# Foo\n`);
    const result = runValidate({ kitRoot: tmp });
    expect(result.ok).toBe(false);
    expect(result.findings[0].kind).toBe("lint");
  });
});
