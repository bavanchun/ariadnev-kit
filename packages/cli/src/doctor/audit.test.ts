import { describe, it, expect } from "vitest";
import { auditReceipt, type AuditDeps } from "./audit.js";
import type { Receipt } from "../install/install-receipt.js";

const home = "/home/u";
const cwd = "/home/u/proj";

function receipt(files: { path: string; sha256: string }[]): Receipt {
  return {
    schemaVersion: 2,
    ariadnevVersion: "1.0.0",
    installs: {
      "claude-code": {
        timestamp: "t1",
        scope: "project",
        files,
        agentsMdManaged: false,
        hookBindings: [],
        skipped: [],
      },
    },
  };
}

/** Disk state as a path→content map; anything absent is a missing file. */
function deps(disk: Record<string, string>): AuditDeps {
  return {
    hashFile: (abs) => (abs in disk ? `hash-of:${disk[abs]}` : null),
    listFiles: (dir) =>
      Object.keys(disk)
        .filter((p) => p.startsWith(`${dir}/`) && !p.slice(dir.length + 1).includes("/"))
        .map((p) => p.slice(dir.length + 1)),
  };
}

const SKILL = ".claude/skills/cook/SKILL.md";
const SKILL_ABS = `${cwd}/${SKILL}`;

describe("auditReceipt", () => {
  it("reports ok when the installed file still hashes to what was recorded", () => {
    const r = receipt([{ path: SKILL, sha256: "hash-of:body" }]);
    const res = auditReceipt(r, deps({ [SKILL_ABS]: "body" }), { home, cwd });
    expect(res.entries).toEqual([{ providerId: "claude-code", path: SKILL, status: "ok" }]);
    expect(res.ok).toBe(true);
  });

  it("reports modified when the content changed under us", () => {
    const r = receipt([{ path: SKILL, sha256: "hash-of:body" }]);
    const res = auditReceipt(r, deps({ [SKILL_ABS]: "edited" }), { home, cwd });
    expect(res.entries[0].status).toBe("modified");
    expect(res.ok).toBe(false);
  });

  it("reports missing when the file is gone", () => {
    const r = receipt([{ path: SKILL, sha256: "hash-of:body" }]);
    const res = auditReceipt(r, deps({}), { home, cwd });
    expect(res.entries[0].status).toBe("missing");
    expect(res.ok).toBe(false);
  });

  it("reports untracked for a stray file in a directory we own", () => {
    const r = receipt([{ path: SKILL, sha256: "hash-of:body" }]);
    const res = auditReceipt(
      r,
      deps({ [SKILL_ABS]: "body", [`${cwd}/.claude/skills/cook/NOTES.md`]: "mine" }),
      { home, cwd },
    );
    expect(res.entries).toContainEqual({
      providerId: "claude-code",
      path: ".claude/skills/cook/NOTES.md",
      status: "untracked",
    });
  });

  it("does not fail the run on untracked files unless --strict", () => {
    // A user dropping their own note next to a skill is not a broken install.
    const r = receipt([{ path: SKILL, sha256: "hash-of:body" }]);
    const disk = { [SKILL_ABS]: "body", [`${cwd}/.claude/skills/cook/NOTES.md`]: "mine" };
    expect(auditReceipt(r, deps(disk), { home, cwd }).ok).toBe(true);
    expect(auditReceipt(r, deps(disk), { home, cwd, strict: true }).ok).toBe(false);
  });

  it("never calls a shared merge target untracked", () => {
    // settings.json and AGENTS.md are merged into, not owned; flagging them
    // would make audit noisy on every healthy install.
    const r = receipt([{ path: ".claude/x.md", sha256: "hash-of:x" }]);
    const res = auditReceipt(
      r,
      deps({
        [`${cwd}/.claude/x.md`]: "x",
        [`${cwd}/.claude/settings.json`]: "{}",
        [`${cwd}/.claude/settings.local.json`]: "{}",
      }),
      { home, cwd, strict: true },
    );
    expect(res.entries.filter((e) => e.status === "untracked")).toEqual([]);
    expect(res.ok).toBe(true);
  });

  it("resolves home-relative recorded paths", () => {
    const r = receipt([{ path: "~/.agents/skills/cook/SKILL.md", sha256: "hash-of:body" }]);
    const res = auditReceipt(r, deps({ [`${home}/.agents/skills/cook/SKILL.md`]: "body" }), { home, cwd });
    expect(res.entries[0].status).toBe("ok");
  });

  it("counts each status and covers every provider in the receipt", () => {
    const r: Receipt = {
      schemaVersion: 2,
      ariadnevVersion: "1.0.0",
      installs: {
        "claude-code": {
          timestamp: "t1", scope: "project", agentsMdManaged: false, hookBindings: [], skipped: [],
          files: [{ path: ".claude/a.md", sha256: "hash-of:a" }, { path: ".claude/b.md", sha256: "hash-of:b" }],
        },
        codex: {
          timestamp: "t1", scope: "project", agentsMdManaged: false, hookBindings: [], skipped: [],
          files: [{ path: "~/.agents/c.md", sha256: "hash-of:c" }],
        },
      },
    };
    const res = auditReceipt(
      r,
      deps({ [`${cwd}/.claude/a.md`]: "a", [`${cwd}/.claude/b.md`]: "changed" }),
      { home, cwd },
    );
    expect(res.counts).toMatchObject({ ok: 1, modified: 1, missing: 1, untracked: 0 });
    expect(res.entries.map((e) => e.providerId)).toContain("codex");
  });

  it("treats a receipt with no installs as an empty, passing audit", () => {
    const res = auditReceipt(null, deps({}), { home, cwd });
    expect(res.entries).toEqual([]);
    expect(res.ok).toBe(true);
  });

  it("uses each provider's own recorded scope to resolve paths", () => {
    // A global install records paths against home even when audit runs in a project.
    const r: Receipt = {
      schemaVersion: 2,
      ariadnevVersion: "1.0.0",
      installs: {
        "claude-code": {
          timestamp: "t1", scope: "global", agentsMdManaged: false, hookBindings: [], skipped: [],
          files: [{ path: "~/.claude/skills/cook/SKILL.md", sha256: "hash-of:body" }],
        },
      },
    };
    const res = auditReceipt(r, deps({ [`${home}/.claude/skills/cook/SKILL.md`]: "body" }), { home, cwd });
    expect(res.entries[0].status).toBe("ok");
  });
});
