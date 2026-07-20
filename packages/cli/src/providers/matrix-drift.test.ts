import { describe, it, expect } from "vitest";
import { checkMatrixDrift, renderMatrixBlock, extractMatrixBlock, MATRIX_BEGIN, MATRIX_END } from "./matrix-drift.js";

const inReadme = (block: string) => `# vcskill\n\nsome text\n\n${block}\n\nmore text`;

describe("checkMatrixDrift", () => {
  it("passes when README block matches the generated matrix", () => {
    const readme = inReadme(renderMatrixBlock());
    expect(checkMatrixDrift(readme).ok).toBe(true);
  });

  it("fails when the block was hand-edited (stale)", () => {
    const tampered = `${MATRIX_BEGIN}\n| artifact | claude-code |\n|---|---|\n| skill | \`WRONG\` |\n${MATRIX_END}`;
    const r = checkMatrixDrift(inReadme(tampered));
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/stale/);
  });

  it("fails when markers are missing", () => {
    const r = checkMatrixDrift("# vcskill\n\nno markers here");
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/markers not found/);
  });

  it("extractMatrixBlock returns the inner table only", () => {
    const block = extractMatrixBlock(inReadme(renderMatrixBlock()));
    expect(block).toContain("| artifact | claude-code |");
    expect(block).not.toContain(MATRIX_BEGIN);
  });
});
