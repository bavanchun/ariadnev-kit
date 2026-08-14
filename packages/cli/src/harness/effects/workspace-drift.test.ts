import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  captureWorkspaceSnapshot,
  createRollbackEvidence,
  diffWorkspaceSnapshots,
  pathsWithinWorkspaceScope,
} from "./workspace-drift.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    chmodSync(root, 0o700);
    rmSync(root, { recursive: true, force: true });
  }
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "ariadnev-workspace-drift-"));
  roots.push(root);
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src", "router.ts"), "v1\n");
  return root;
}

describe("workspace drift", () => {
  it("creates deterministic fingerprints and reports material changed paths", () => {
    const root = fixture();
    const before = captureWorkspaceSnapshot(root);
    expect(captureWorkspaceSnapshot(root)).toEqual(before);
    writeFileSync(join(root, "src", "router.ts"), "v2\n");
    writeFileSync(join(root, "proof.txt"), "tests pass\n");
    const after = captureWorkspaceSnapshot(root);
    expect(diffWorkspaceSnapshots(before, after)).toEqual({
      drifted: true,
      changedPaths: ["proof.txt", "src/router.ts"],
    });
  });

  it("tracks source-control metadata and enforces explicit workspace scope", () => {
    const root = fixture();
    const before = captureWorkspaceSnapshot(root);
    mkdirSync(join(root, ".git"));
    writeFileSync(join(root, ".git", "index"), "metadata");
    expect(diffWorkspaceSnapshots(before, captureWorkspaceSnapshot(root))).toEqual({
      drifted: true,
      changedPaths: [".git/", ".git/index"],
    });
    expect(pathsWithinWorkspaceScope(["src/router.ts"], ["src/router.ts"])).toBe(true);
    expect(pathsWithinWorkspaceScope(["src/router.ts", "proof.txt"], ["src/"])).toBe(false);
    expect(() => pathsWithinWorkspaceScope(["src/router.ts"], ["../outside"])).toThrow(/scope/i);
  });

  it("generates rollback guidance from observed evidence without claiming reversibility", () => {
    const root = fixture();
    const before = captureWorkspaceSnapshot(root);
    writeFileSync(join(root, "src", "router.ts"), "v2\n");
    const evidence = createRollbackEvidence(before, captureWorkspaceSnapshot(root));
    expect(evidence).toMatchObject({ automatic: false, changedPaths: ["src/router.ts"] });
    expect(evidence.guidance).toMatch(/recorded pre-change evidence/i);
    expect(evidence.beforeDigest).toBe(before.digest);
  });
});
