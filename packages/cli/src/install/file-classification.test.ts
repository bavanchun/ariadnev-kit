import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  classifyFiles,
  ownedDirectories,
  realClassifyDeps,
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
  const all = listed ?? Object.keys(onDisk);
  return {
    fileExists: (path) => path in onDisk,
    readFileContent: (path) => onDisk[path] ?? "",
    // Scoped per directory, the way the real walk is: a file counts as a
    // neighbour only when it sits in a directory the receipt already claims.
    listFiles: (dir) => all.filter((path) => dirname(path) === dir),
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

  it("cannot be made to delete an orphan by feeding it a directory that is almost all orphans", () => {
    // The degenerate case: one owned file in a directory otherwise full of
    // other people's work. The answer must be "delete the one file we wrote",
    // never "delete everything I can see".
    //
    // The owned file has to be here. Without it the receipt claims no
    // directory, nothing is scanned, and the test would pass while asserting
    // nothing — which is how a safety test quietly stops being one.
    const files = classify(receiptWith([{ path: ".claude/ours.md", content: "ours" }]), {
      "/proj/.claude/ours.md": "ours",
      "/proj/.claude/a.md": "x",
      "/proj/.claude/b.md": "y",
    });
    expect(files.filter((file) => file.state === "orphan")).toHaveLength(2);
    expect(plannedDeletions(files, { force: true }).map((file) => file.path)).toEqual(["/proj/.claude/ours.md"]);
  });

  it("reports orphans so a user can see them, since it will never act on them", () => {
    const files = classify(receiptWith([{ path: ".claude/ours.md", content: "ours" }]), {
      "/proj/.claude/ours.md": "ours",
      "/proj/.claude/theirs.md": "x",
    });
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

describe("where orphans are looked for", () => {
  it("scans only the directories the receipt already claims a file in", () => {
    // Scanning the scope root would report every unrelated file in it. The home
    // root measured on the machine this was designed against holds 131 entries,
    // 30 belonging to other tools — a list that is mostly other people's work
    // is not a finding, and presenting it as one invites a cleanup nobody
    // should perform.
    const receipt = receiptWith([{ path: ".claude/a.md", content: "a" }]);
    expect(ownedDirectories(receipt, base.home, base.cwd)).toEqual(["/proj/.claude"]);

    const files = classify(receipt, { "/proj/.claude/a.md": "a" }, [
      "/proj/.claude/a.md",
      "/proj/.claude/neighbour.md",
      "/proj/unrelated/other-tool.md",
    ]);
    expect(files.map((file) => file.path)).toContain("/proj/.claude/neighbour.md");
    expect(files.map((file) => file.path)).not.toContain("/proj/unrelated/other-tool.md");
  });

  it("reports no orphans at all when the caller cannot list directories", () => {
    // The orphan report is what a missing listing costs. The safety property is
    // not: never deleting an orphan does not depend on knowing one is there.
    const files = classifyFiles(
      { receipt: receiptWith([{ path: ".claude/a.md", content: "a" }]), providerIds: ["claude-code"], home: base.home, cwd: base.cwd },
      { fileExists: () => true, readFileContent: () => "a" },
    );
    expect(files.every((file) => file.state !== "orphan")).toBe(true);
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

describe("a recorded path that is not a readable file", () => {
  it("is missing rather than a thrown read", () => {
    // A directory can end up where a file was: an interrupted heal does it, and
    // so does a user reorganising by hand. Reporting the path as present and
    // letting the read throw EISDIR aborts the whole install, and every run
    // after it fails in the same place — the wedge `e2e-heal` guards against.
    //
    // "missing" is the true answer as well as the safe one: the file this tool
    // installed is genuinely not there. An install rewrites it; an uninstall
    // plans no deletion, so nothing unlinks whatever took its place.
    const dir = mkdtempSync(join(tmpdir(), "ariadnev-classify-"));
    try {
      const blocked = join(dir, "SKILL.md");
      mkdirSync(blocked);
      const receipt = receiptWith([{ path: "SKILL.md", content: "ours" }]);
      const files = classifyFiles(
        { receipt, providerIds: ["claude-code"], home: dir, cwd: dir },
        realClassifyDeps,
      );
      expect(files.find((file) => file.path === blocked)?.state).toBe("missing");
      expect(plannedDeletions(files, { force: true })).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
