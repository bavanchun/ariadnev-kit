import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  rmSync,
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executeUninstall } from "./uninstall-execute.js";
import type { UninstallOp } from "./uninstall-plan.js";

let sandbox: string;
let root: string;
beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), "ariadnev-uninst-"));
  root = join(sandbox, "proj");
  mkdirSync(root, { recursive: true });
});
afterEach(() => rmSync(sandbox, { recursive: true, force: true }));

function writeFile(rel: string, content: string): string {
  const abs = join(root, rel);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, content);
  return abs;
}

describe("executeUninstall", () => {
  it("removes a remove-file op and cleans up the now-empty artifact directory", () => {
    const skillFile = writeFile(".claude/skills/brainstorm/SKILL.md", "content");
    const ops: UninstallOp[] = [{ action: "remove-file", path: skillFile }];
    const res = executeUninstall(ops, { dryRun: false, allowedRoots: [root], backupRoot: join(sandbox, "backups"), scopeRoot: root });
    expect(existsSync(skillFile)).toBe(false);
    expect(existsSync(join(root, ".claude/skills/brainstorm"))).toBe(false);
    // stops at .claude/skills (direct child of scope root's subdir) — never removes scope root itself
    expect(existsSync(root)).toBe(true);
    expect(res.removed).toEqual([skillFile]);
  });

  it("never removes the top-level provider directory or the scope root, even if empty", () => {
    const skillFile = writeFile(".claude/skills/only-one/SKILL.md", "content");
    executeUninstall(
      [{ action: "remove-file", path: skillFile }],
      { dryRun: false, allowedRoots: [root], backupRoot: join(sandbox, "backups"), scopeRoot: root },
    );
    // .claude/skills itself (1 level below root) must survive even though empty
    expect(existsSync(join(root, ".claude", "skills"))).toBe(true);
    expect(existsSync(join(root, ".claude"))).toBe(true);
  });

  it("does not remove a preserve-file op's file — it's a no-op by construction", () => {
    const skillFile = writeFile(".claude/skills/brainstorm/SKILL.md", "user edited");
    const ops: UninstallOp[] = [{ action: "preserve-file", path: skillFile, reason: "modified since install — not removed" }];
    const res = executeUninstall(ops, { dryRun: false, allowedRoots: [root], backupRoot: join(sandbox, "backups"), scopeRoot: root });
    expect(existsSync(skillFile)).toBe(true);
    expect(readFileSync(skillFile, "utf8")).toBe("user edited");
    expect(res.preserved).toEqual([{ path: skillFile, reason: "modified since install — not removed" }]);
  });

  it("unmerges settings.json, backing up the original first", () => {
    const settingsPath = writeFile(
      ".claude/settings.json",
      JSON.stringify({
        model: "opus",
        hooks: { SessionStart: [{ hooks: [{ type: "command", command: "node x.cjs" }] }] },
      }),
    );
    const ops: UninstallOp[] = [
      { action: "unmerge-settings", path: settingsPath, bindings: [{ event: "SessionStart", command: "node x.cjs" }] },
    ];
    const res = executeUninstall(ops, { dryRun: false, allowedRoots: [root], backupRoot: join(sandbox, "backups"), scopeRoot: root });
    const after = JSON.parse(readFileSync(settingsPath, "utf8"));
    expect(after.model).toBe("opus");
    expect(after.hooks).toBeUndefined();
    expect(res.settingsUnmerged).toBe(true);
    expect(existsSync(join(sandbox, "backups"))).toBe(true);
  });

  it("removes the AGENTS.md managed block, backing up the original first", () => {
    const agentsPath = writeFile(
      "AGENTS.md",
      "# Notes\n\n<!-- ariadnev:start -->\nrules\n<!-- ariadnev:end -->\n",
    );
    const ops: UninstallOp[] = [{ action: "remove-agents-block", path: agentsPath }];
    const res = executeUninstall(ops, { dryRun: false, allowedRoots: [root], backupRoot: join(sandbox, "backups"), scopeRoot: root });
    expect(readFileSync(agentsPath, "utf8")).toBe("# Notes");
    expect(res.agentsMdCleaned).toBe(true);
  });

  it("dry-run performs no filesystem changes at all", () => {
    const skillFile = writeFile(".claude/skills/brainstorm/SKILL.md", "content");
    const settingsPath = writeFile(".claude/settings.json", JSON.stringify({ hooks: {} }));
    const ops: UninstallOp[] = [
      { action: "remove-file", path: skillFile },
      { action: "unmerge-settings", path: settingsPath, bindings: [] },
    ];
    const res = executeUninstall(ops, { dryRun: true, allowedRoots: [root], backupRoot: join(sandbox, "backups"), scopeRoot: root });
    expect(existsSync(skillFile)).toBe(true);
    expect(existsSync(join(sandbox, "backups"))).toBe(false);
    expect(res.removed).toEqual([skillFile]); // plan is still reported
  });

  it("refuses to touch a path outside allowedRoots", () => {
    const outside = join(sandbox, "outside.txt");
    writeFileSync(outside, "not ours");
    const ops: UninstallOp[] = [{ action: "remove-file", path: outside }];
    expect(() =>
      executeUninstall(ops, { dryRun: false, allowedRoots: [root], backupRoot: join(sandbox, "backups"), scopeRoot: root }),
    ).toThrow();
    expect(existsSync(outside)).toBe(true);
  });
});
