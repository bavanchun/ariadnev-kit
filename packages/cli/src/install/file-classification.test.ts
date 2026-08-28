import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  classifyFiles,
  plannedDeletions,
  FILE_STATES,
  type ClassifiedFile,
  type ClassifyDeps,
} from "./file-classification.js";
import type { Receipt } from "./install-receipt.js";

const hash = (content: string) => createHash("sha256").update(content).digest("hex");

function receiptWith(files: { path: string; content: string }[]): Receipt {
  return {
    schemaVersion: 2,
    ariadnevVersion: "1.2.0",
    installs: {
      "claude-code": {
        timestamp: "2026-08-28T00:00:00.000Z",
        scope: "project",
        files: files.map((file) => ({ path: file.path, sha256: hash(file.content) })),
        agentsMdManaged: false,
        hookBindings: [],
        skipped: [],
      },
    },
  };
}

function deps(onDisk: Record<string, string>, listed?: string[]): ClassifyDeps {
  return {
    fileExists: (path) => path in onDisk,
    readFileContent: (path) => onDisk[path] ?? "",
    listFiles: () => listed ?? Object.keys(onDisk),
  };
}

const base = { home: "/home/u", cwd: "/proj", providerIds: ["claude-code"] as const };

function classify(receipt: Receipt, onDisk: Record<string, string>, listed?: string[]): ClassifiedFile[] {
  return classifyFiles({ receipt, providerIds: [...base.providerIds], home: base.home, cwd: base.cwd }, deps(onDisk, listed));
}

const stateOf = (files: ClassifiedFile[], path: string) => files.find((file) => file.path === path)?.state;

describe("the four states", () => {
  it("calls a receipt file whose hash matches clean", () => {
    const files = classify(receiptWith([{ path: ".claude/a.md", content: "same" }]), { "/proj/.claude/a.md": "same" });
    expect(stateOf(files, "/proj/.claude/a.md")).toBe("clean");
  });

  it("calls a receipt file whose hash differs modified", () => {
    const files = classify(receiptWith([{ path: ".claude/a.md", content: "original" }]), { "/proj/.claude/a.md": "edited" });
    expect(stateOf(files, "/proj/.claude/a.md")).toBe("modified");
  });

  it("calls a receipt file that is gone missing", () => {
    const files = classify(receiptWith([{ path: ".claude/a.md", content: "gone" }]), {});
    expect(stateOf(files, "/proj/.claude/a.md")).toBe("missing");
  });

  it("calls a file on disk that no receipt mentions an orphan", () => {
    const files = classify(receiptWith([{ path: ".claude/a.md", content: "ours" }]), {
      "/proj/.claude/a.md": "ours",
      "/proj/.claude/theirs.md": "not ours",
    });
    expect(stateOf(files, "/proj/.claude/theirs.md")).toBe("orphan");
  });

  it("has exactly four states and no fifth", () => {
    expect([...FILE_STATES]).toEqual(["clean", "modified", "orphan", "missing"]);
  });
});

describe("THE SAFETY PROPERTY: an orphan is never deleted", () => {
  // The highest-consequence assertion in this plan. This project has already
  // shipped one installer RCE and designed one migration that would have
  // renamed 30 third-party directories. `uninstall` deletes files, in a root
  // measured at 131 entries of which 30 belong to other tools.

  it("excludes orphans from the deletion plan under every flag combination", () => {
    const files = classify(receiptWith([{ path: ".claude/ours.md", content: "ours" }]), {
      "/proj/.claude/ours.md": "ours",
      "/proj/.claude/theirs.md": "someone else's",
      "/proj/.claude/also-theirs.md": "someone else's",
    });

    for (const force of [false, true]) {
      const deletions = plannedDeletions(files, { force });
      expect(deletions.map((file) => file.path), `force=${force}`).not.toContain("/proj/.claude/theirs.md");
      expect(deletions.map((file) => file.path), `force=${force}`).not.toContain("/proj/.claude/also-theirs.md");
      expect(deletions.every((file) => file.state !== "orphan"), `force=${force}`).toBe(true);
    }
  });

  it("cannot be made to delete an orphan by feeding it only orphans", () => {
    // The degenerate case: a receipt that owns nothing, a directory full of
    // other people's files. The answer must be "delete nothing", not
    // "delete everything I can see".
    const files = classify(receiptWith([]), { "/proj/.claude/a.md": "x", "/proj/.claude/b.md": "y" });
    expect(files.every((file) => file.state === "orphan")).toBe(true);
    expect(plannedDeletions(files, { force: true })).toEqual([]);
  });

  it("reports orphans so a user can see them, since it will never act on them", () => {
    const files = classify(receiptWith([]), { "/proj/.claude/theirs.md": "x" });
    expect(files.map((file) => file.path)).toContain("/proj/.claude/theirs.md");
  });
});

describe("what the deletion plan does include", () => {
  it("deletes clean files without --force", () => {
    const files = classify(receiptWith([{ path: ".claude/a.md", content: "same" }]), { "/proj/.claude/a.md": "same" });
    expect(plannedDeletions(files, { force: false }).map((file) => file.path)).toEqual(["/proj/.claude/a.md"]);
  });

  it("refuses a modified file without --force, and deletes it with", () => {
    const files = classify(receiptWith([{ path: ".claude/a.md", content: "original" }]), { "/proj/.claude/a.md": "edited" });
    expect(plannedDeletions(files, { force: false })).toEqual([]);
    expect(plannedDeletions(files, { force: true }).map((file) => file.path)).toEqual(["/proj/.claude/a.md"]);
  });

  it("never plans to delete a file that is already gone", () => {
    const files = classify(receiptWith([{ path: ".claude/a.md", content: "gone" }]), {});
    for (const force of [false, true]) {
      expect(plannedDeletions(files, { force })).toEqual([]);
    }
  });
});

describe("hashing", () => {
  it("hashes bytes, so a binary asset is not read back as modified", () => {
    // The bug that preserved 55 files through a full uninstall: reading a font
    // as utf8 produces a different digest than the bytes it was hashed from,
    // so every binary file looked user-edited.
    const bytes = Buffer.from([0xff, 0xfe, 0x00, 0x01, 0xd8, 0x00]);
    const receipt: Receipt = {
      schemaVersion: 2,
      ariadnevVersion: "1.2.0",
      installs: {
        "claude-code": {
          timestamp: "2026-08-28T00:00:00.000Z",
          scope: "project",
          files: [{ path: ".claude/font.woff", sha256: createHash("sha256").update(bytes).digest("hex") }],
          agentsMdManaged: false,
          hookBindings: [],
          skipped: [],
        },
      },
    };
    const files = classifyFiles(
      { receipt, providerIds: ["claude-code"], home: base.home, cwd: base.cwd },
      {
        fileExists: () => true,
        readFileContent: () => bytes,
        listFiles: () => ["/proj/.claude/font.woff"],
      },
    );
    expect(stateOf(files, "/proj/.claude/font.woff")).toBe("clean");
  });
});

describe("multiple providers", () => {
  it("does not call another provider's file an orphan", () => {
    // Classifying one provider while another's files sit on disk must not
    // report the second provider's files as unowned — they are owned, by the
    // record right next to this one.
    const receipt: Receipt = {
      schemaVersion: 2,
      ariadnevVersion: "1.2.0",
      installs: {
        "claude-code": {
          timestamp: "2026-08-28T00:00:00.000Z",
          scope: "project",
          files: [{ path: ".claude/a.md", sha256: hash("a") }],
          agentsMdManaged: false, hookBindings: [], skipped: [],
        },
        codex: {
          timestamp: "2026-08-28T00:00:00.000Z",
          scope: "project",
          files: [{ path: ".codex/b.md", sha256: hash("b") }],
          agentsMdManaged: false, hookBindings: [], skipped: [],
        },
      },
    };
    const onDisk = { "/proj/.claude/a.md": "a", "/proj/.codex/b.md": "b" };
    const files = classifyFiles(
      { receipt, providerIds: ["claude-code"], home: base.home, cwd: base.cwd },
      deps(onDisk),
    );
    expect(stateOf(files, "/proj/.codex/b.md")).not.toBe("orphan");
    expect(plannedDeletions(files, { force: true }).map((file) => file.path)).toEqual(["/proj/.claude/a.md"]);
  });
});
