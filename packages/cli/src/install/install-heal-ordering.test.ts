// The heal's write ordering, observed at the one moment it is visible.
//
// A successful run clears the journal, so nothing downstream can tell whether
// the pending removals were ever journalled — and the brownfield recovery test
// hand-builds the post-crash state, which exercises the *reading* half only.
// Dropping `healRemovals` from the write left that test green.
//
// This one kills the run at the receipt write, which is the exact instant the
// journal has to be complete: everything before it is recoverable by re-running,
// and everything after it depends on the journal to finish the deletions.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const failOn = { path: "" };

vi.mock("./fs-atomic.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("./fs-atomic.js")>();
  return {
    ...real,
    atomicWrite(target: string, content: string | Buffer, mode?: number) {
      if (failOn.path !== "" && target === failOn.path) throw new Error("killed at the receipt write");
      return real.atomicWrite(target, content, mode);
    },
  };
});

const { loadKit, resolveKitRoot } = await import("../kit/load-kit.js");
const { installKit } = await import("./install-execute.js");
const { readJournal } = await import("./intent-journal.js");
const { readBackupManifest } = await import("./backup.js");
const { fromPortablePath } = await import("./install-receipt.js");
type Receipt = import("./install-receipt.js").Receipt;

const kit = loadKit(resolveKitRoot(process.cwd()));

let sandbox: string;
let ctx: { home: string; cwd: string; scope: "project" };

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), "ariadnev-healorder-"));
  mkdirSync(join(sandbox, "home"), { recursive: true });
  mkdirSync(join(sandbox, "project"), { recursive: true });
  ctx = { home: join(sandbox, "home"), cwd: join(sandbox, "project"), scope: "project" };
  failOn.path = "";
});
afterEach(() => {
  failOn.path = "";
  rmSync(sandbox, { recursive: true, force: true });
});

const receiptFile = () => join(ctx.cwd, ".ariadnev", "receipt.json");

/** Install, then rewind the tree and receipt to the pre-prefix shape. */
function seedPrePrefixInstall(): string {
  installKit(kit, ["claude-code"], ctx, { timestamp: "20260101-000000", applyHookSettings: true });
  const receipt = JSON.parse(readFileSync(receiptFile(), "utf8")) as Receipt;
  const renames = new Set<string>();
  for (const file of receipt.installs["claude-code"]!.files) {
    const parts = file.path.split("/");
    const i = parts.findIndex((p, n) => p === "skills" && n < parts.length - 1);
    if (i === -1 || !parts[i + 1].startsWith("av-")) continue;
    renames.add(parts.slice(0, i + 2).join("/"));
    parts[i + 1] = parts[i + 1].slice(3);
    file.path = parts.join("/");
  }
  for (const portable of renames) {
    const from = fromPortablePath(portable, ctx.home, ctx.cwd);
    const to = from.replace(/(\/skills\/)av-/, "$1");
    if (existsSync(from)) renameSync(from, to);
  }
  writeFileSync(receiptFile(), `${JSON.stringify(receipt, null, 2)}\n`);
  return join(ctx.cwd, ".claude", "skills", "cook", "SKILL.md");
}

describe("the journal at the moment the receipt is written", () => {
  it("already names every file the heal is about to delete", () => {
    const legacy = seedPrePrefixInstall();
    failOn.path = receiptFile();

    expect(() =>
      installKit(kit, ["claude-code"], ctx, { timestamp: "20260102-000000", applyHookSettings: true }),
    ).toThrow(/killed at the receipt write/);

    const journal = readJournal(ctx.cwd);
    expect(journal, "a killed heal must leave a journal").not.toBeNull();
    const pending = (journal!.healRemovals ?? []).map((r) => fromPortablePath(r.path, ctx.home, ctx.cwd));
    expect(pending, "the legacy file must be listed as pending").toContain(legacy);
    // Still on disk: the deletions come after the receipt, which never landed.
    expect(existsSync(legacy)).toBe(true);
  });

  /**
   * The backup has to exist by this point too. It is taken before
   * `rotateBackups`, and the only window in which the prior receipt still names
   * these files is before the new one replaces it — after that there is nothing
   * left to tell the tool what to copy.
   */
  it("is preceded by a heal backup that already holds the file", () => {
    const legacy = seedPrePrefixInstall();
    const contents = readFileSync(legacy, "utf8");
    failOn.path = receiptFile();

    expect(() =>
      installKit(kit, ["claude-code"], ctx, { timestamp: "20260102-000000", applyHookSettings: true }),
    ).toThrow();

    const backup = join(ctx.cwd, ".ariadnev", "backups", "heal-20260102-000000");
    const manifest = readBackupManifest(backup);
    const entry = manifest.find((e) => e.originalPath === legacy);
    expect(entry).toBeDefined();
    expect(readFileSync(join(backup, entry!.relPath), "utf8")).toBe(contents);
  });
});
