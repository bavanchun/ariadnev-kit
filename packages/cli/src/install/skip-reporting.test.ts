import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executeInstall } from "./install-execute.js";
import { renderSummary } from "../cli/render-summary.js";
import type { InstallOp } from "./install-types.js";

let sandbox: string;

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), "ariadnev-skip-"));
});
afterEach(() => rmSync(sandbox, { recursive: true, force: true }));

function baseOpts() {
  return { dryRun: false, timestamp: "260831-0000", allowedRoots: [sandbox], scopeRoot: sandbox };
}

/** Two files of one skill — the shape that produced two identical report lines. */
function twoFilesOfOneSkill(): InstallOp[] {
  return [
    { action: "write", kind: "skill", name: "journal", dest: join(sandbox, "av-journal", "SKILL.md"), content: "a", mode: 0o644 },
    { action: "write", kind: "skill", name: "journal", dest: join(sandbox, "av-journal", "references", "notes.md"), content: "b", mode: 0o644 },
  ] as InstallOp[];
}

describe("skip reporting", () => {
  it("names the file a skip is about, not just the artifact it belongs to", () => {
    const ops = twoFilesOfOneSkill();
    const dests = ops.map((op) => (op as { dest: string }).dest);

    const result = executeInstall(ops, "claude-code", join(sandbox, "backups"), {
      ...baseOpts(),
      userModified: new Set(dests),
    });

    expect(result.skipped).toHaveLength(2);
    // Both carry the same artifact identity — that was never the bug — and are
    // told apart by path, which is what was missing.
    expect(result.skipped.every((s) => s.kind === "skill" && s.name === "journal")).toBe(true);
    expect(result.skipped.map((s) => s.path)).toEqual(dests);
  });

  it("renders two edited files of one skill as two distinguishable lines", () => {
    const ops = twoFilesOfOneSkill();
    const result = executeInstall(ops, "claude-code", join(sandbox, "backups"), {
      ...baseOpts(),
      userModified: new Set(ops.map((op) => (op as { dest: string }).dest)),
    });

    const lines = renderSummary([result], false, { color: false }).split("\n").filter((line) => line.includes("- skip "));
    expect(lines).toHaveLength(2);
    expect(new Set(lines).size).toBe(2);
    expect(lines[0]).toContain("SKILL.md");
    expect(lines[1]).toContain(join("references", "notes.md"));
  });

  it("leaves the path off a skip that is about no particular file", () => {
    // An unverified provider cell was never planned to a destination, so there
    // is no path to name and inventing one would be worse than omitting it.
    const unverified: InstallOp[] = [{ action: "skip", kind: "hook", name: "session-init", reason: "unsupported/unverified (omp)" }];
    const result = executeInstall(unverified, "omp", join(sandbox, "backups"), baseOpts());

    expect(result.skipped[0].path).toBeUndefined();
    const line = renderSummary([result], false, { color: false }).split("\n").find((l) => l.includes("- skip "));
    expect(line).toContain("hook/session-init");
    expect(line).not.toContain("[");
  });
});
