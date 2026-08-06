import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadCollisionAllowlist, runValidate } from "./validate-command.js";
import { resolveKitRoot } from "../kit/load-kit.js";
import { renderMatrixBlock } from "../providers/matrix-drift.js";

const REQUIRED_SECTIONS = `
## Output format

Output.

## Quality gates

- Check.

## Workflow position

Related: none.
`;

function writeNamedSkill(kitRoot: string, slug: string, description: string): void {
  const dir = join(kitRoot, "skills", slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "SKILL.md"),
    `---\nname: vc:${slug}\ndescription: ${description}\nmetadata:\n  upstream: "none"\n  upstream_version: "none"\n  upstream_digest: "none"\n  upstream_relation: "none"\n---\n\n# ${slug}\n${REQUIRED_SECTIONS}`,
  );
}

describe("validate policies", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "vcskill-validate-policy-"));
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  describe("collision allowlist", () => {
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
