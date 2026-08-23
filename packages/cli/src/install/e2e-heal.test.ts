// Installing over a layout an older build wrote — the brownfield upgrade path.
//
// Every existing install test starts from an empty directory, which is the one
// case that cannot go wrong. The interesting case is the one every existing
// user is in: a tree written by a build whose resolver produced different
// paths. The receipt is replaced wholesale per provider, so without a heal the
// old files leave the record with nothing referencing them — invisible to
// uninstall (`install.files`), to audit (`ownedDirs` from tracked dirnames) and
// to doctor. Orphaning is the default outcome, not a risk, and these prove it
// does not happen.
//
// The seed is a real install, downgraded to the pre-prefix shape, rather than a
// hand-built fixture: a fixture only proves the heal handles what the fixture
// author imagined.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { loadKit, resolveKitRoot } from "../kit/load-kit.js";
import { installKit } from "./install-execute.js";
import { fromPortablePath, type Receipt } from "./install-receipt.js";
import { readJournal, writeJournal, JOURNAL_SCHEMA_VERSION } from "./intent-journal.js";
import type { ProviderId } from "../providers/spec-verified.js";

const kit = loadKit(resolveKitRoot(process.cwd()));

let sandbox: string;
let ctx: { home: string; cwd: string; scope: "project" | "global" };

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), "ariadnev-heal-"));
  mkdirSync(join(sandbox, "home"), { recursive: true });
  mkdirSync(join(sandbox, "project"), { recursive: true });
  ctx = { home: join(sandbox, "home"), cwd: join(sandbox, "project"), scope: "project" };
});
afterEach(() => rmSync(sandbox, { recursive: true, force: true }));

function baseRoot(): string {
  return ctx.scope === "global" ? ctx.home : ctx.cwd;
}
function receiptFile(): string {
  return join(baseRoot(), ".ariadnev", "receipt.json");
}
function readReceipt(): Receipt {
  return JSON.parse(readFileSync(receiptFile(), "utf8")) as Receipt;
}

/**
 * Strip the `av-` prefix from the directory that follows a `skills` segment.
 *
 * Only that segment. A blanket `/av-` → `/` also renames
 * `.claude/hooks/av/av-statusline.cjs`, which no older build ever called
 * something else — the seed would then be testing a migration that never
 * happened.
 */
function unprefix(portablePath: string): string {
  const parts = portablePath.split("/");
  for (let i = 0; i < parts.length - 1; i++) {
    if (parts[i] === "skills" && parts[i + 1].startsWith("av-")) {
      parts[i + 1] = parts[i + 1].slice(3);
    }
  }
  return parts.join("/");
}

/**
 * Install, then rewind the tree and the receipt to the shape a pre-prefix build
 * left behind. The result is indistinguishable from an upgrade in progress.
 */
function seedPrePrefixInstall(providers: ProviderId[]): void {
  installKit(kit, providers, ctx, { timestamp: "20260101-000000", applyHookSettings: true });
  const receipt = readReceipt();
  const renames = new Set<string>();

  for (const install of Object.values(receipt.installs)) {
    if (!install) continue;
    for (const file of install.files) {
      const rewound = unprefix(file.path);
      if (rewound === file.path) continue;
      // The directory whose name changes is the one right below `skills`.
      const parts = file.path.split("/");
      const i = parts.findIndex((p, n) => p === "skills" && n < parts.length - 1);
      const prefixed = parts.slice(0, i + 2).join("/");
      renames.add(prefixed);
      file.path = rewound;
    }
  }

  for (const portable of renames) {
    const from = fromPortablePath(portable, ctx.home, ctx.cwd);
    const to = fromPortablePath(unprefix(portable), ctx.home, ctx.cwd);
    if (existsSync(from)) renameSync(from, to);
  }
  writeFileSync(receiptFile(), `${JSON.stringify(receipt, null, 2)}\n`);
  // Backups from the seeding install would otherwise be mistaken for the heal's.
  rmSync(join(baseRoot(), ".ariadnev", "backups"), { recursive: true, force: true });
}

/** Every path any record in the receipt currently claims. */
function claimedPaths(receipt: Receipt): string[] {
  return Object.values(receipt.installs)
    .flatMap((install) => install?.files ?? [])
    .map((file) => fromPortablePath(file.path, ctx.home, ctx.cwd));
}

function healBackupDirs(): string[] {
  const parent = join(baseRoot(), ".ariadnev", "backups");
  if (!existsSync(parent)) return [];
  return readdirSync(parent).filter((name) => name.startsWith("heal-"));
}

describe("installing over a pre-prefix layout", () => {
  it("leaves no unprefixed recorded file, no duplicate, and a receipt that matches disk", () => {
    seedPrePrefixInstall(["claude-code"]);
    const legacy = join(ctx.cwd, ".claude", "skills", "cook", "SKILL.md");
    expect(existsSync(legacy), "the seed must actually be unprefixed").toBe(true);

    const { heal } = installKit(kit, ["claude-code"], ctx, { timestamp: "20260102-000000", applyHookSettings: true });

    const receipt = readReceipt();
    const recorded = receipt.installs["claude-code"]!.files.map((f) => f.path);
    expect(recorded.filter((p) => unprefix(p) === p && p.includes("/skills/"))).toEqual([]);
    expect(new Set(recorded).size).toBe(recorded.length);
    for (const abs of claimedPaths(receipt)) {
      expect(existsSync(abs), `receipt claims a file that is not there: ${abs}`).toBe(true);
    }
    expect(existsSync(legacy), "the legacy tree must be gone").toBe(false);
    expect(existsSync(join(ctx.cwd, ".claude", "skills", "av-cook", "SKILL.md"))).toBe(true);
    // Nothing survived, so nothing is reported. A survivor list that names every
    // directory the heal touched would be noise the one real case hides in.
    expect(heal.survivingDirs).toEqual([]);
    expect(heal.preserved).toEqual([]);
  });

  it("is a no-op the second time", () => {
    seedPrePrefixInstall(["claude-code"]);
    installKit(kit, ["claude-code"], ctx, { timestamp: "20260102-000000", applyHookSettings: true });
    const afterHeal = readFileSync(receiptFile(), "utf8");
    const healBackups = healBackupDirs().length;

    installKit(kit, ["claude-code"], ctx, { timestamp: "20260103-000000", applyHookSettings: true });

    // Same claims, and no second heal backup — there was nothing left to heal.
    const before = JSON.parse(afterHeal) as Receipt;
    expect(claimedPaths(readReceipt()).sort()).toEqual(claimedPaths(before).sort());
    expect(healBackupDirs().length).toBe(healBackups);
  });

  it("keeps the removed tree recoverable", () => {
    seedPrePrefixInstall(["claude-code"]);
    const legacy = join(ctx.cwd, ".claude", "skills", "cook", "SKILL.md");
    const contents = readFileSync(legacy, "utf8");

    installKit(kit, ["claude-code"], ctx, { timestamp: "20260102-000000", applyHookSettings: true });

    const dirs = healBackupDirs();
    expect(dirs).toHaveLength(1);
    const manifest = JSON.parse(
      readFileSync(join(baseRoot(), ".ariadnev", "backups", dirs[0], "manifest.json"), "utf8"),
    ) as { originalPath: string; relPath: string }[];
    const entry = manifest.find((e) => e.originalPath === legacy);
    expect(entry, "the deleted file must be in the heal manifest").toBeDefined();
    expect(
      readFileSync(join(baseRoot(), ".ariadnev", "backups", dirs[0], entry!.relPath), "utf8"),
    ).toBe(contents);
  });

  /**
   * `rotateBackups(parent, keep = 3)` prunes by lexicographic sort. A heal
   * backup inside that set expires after three more mutating runs, which would
   * quietly void the rollback recipe weeks after the upgrade — long after
   * anyone would connect the two.
   */
  it("keeps the heal backup after three more installs", () => {
    seedPrePrefixInstall(["claude-code"]);
    installKit(kit, ["claude-code"], ctx, { timestamp: "20260102-000000", applyHookSettings: true });
    const dirs = healBackupDirs();
    expect(dirs).toHaveLength(1);

    for (const stamp of ["20260103-000000", "20260104-000000", "20260105-000000"]) {
      installKit(kit, ["claude-code"], ctx, { timestamp: stamp, applyHookSettings: true });
    }

    expect(healBackupDirs()).toEqual(dirs);
    expect(existsSync(join(baseRoot(), ".ariadnev", "backups", dirs[0], "manifest.json"))).toBe(true);
    // And the ordinary backups still rotated to exactly three. Without this the
    // test passes by accident: `heal-` sorts after every digit, so a heal backup
    // left in the rotation set is simply the newest entry and survives anyway —
    // while silently pushing a real backup out of the window.
    const plain = readdirSync(join(baseRoot(), ".ariadnev", "backups")).filter((n) => /^\d{8}-\d{6}$/.test(n));
    expect(plain.sort()).toEqual(["20260103-000000", "20260104-000000", "20260105-000000"]);
  });

  it("preserves a legacy file the user edited, instead of deleting their work", () => {
    seedPrePrefixInstall(["claude-code"]);
    const edited = join(ctx.cwd, ".claude", "skills", "cook", "SKILL.md");
    writeFileSync(edited, "my own notes\n");

    installKit(kit, ["claude-code"], ctx, { timestamp: "20260102-000000", applyHookSettings: true });

    expect(existsSync(edited)).toBe(true);
    expect(readFileSync(edited, "utf8")).toBe("my own notes\n");
  });

  /**
   * Skills write into their own installed trees — one skill's installer
   * git-clones a vendor dir, another builds a venv under `references/`. Those
   * are in no receipt, so the heal cannot remove them and must not pretend the
   * directory is gone.
   */
  it("reports a directory that survives because something untracked is in it", () => {
    seedPrePrefixInstall(["claude-code"]);
    const husk = join(ctx.cwd, ".claude", "skills", "cook", "vendor");
    mkdirSync(husk, { recursive: true });
    writeFileSync(join(husk, "cloned.txt"), "not ours\n");

    const { heal } = installKit(kit, ["claude-code"], ctx, { timestamp: "20260102-000000", applyHookSettings: true });

    expect(existsSync(join(husk, "cloned.txt")), "an untracked file must survive").toBe(true);
    expect(heal.survivingDirs).toContain(join(ctx.cwd, ".claude", "skills", "cook"));
  });
});

describe("heal safety boundaries", () => {
  /**
   * The first receipt-driven *deletion* in the codebase. The prior receipt is
   * read from `<cwd>/.ariadnev/` for project scope — inside whatever repository
   * was cloned — and `fromPortablePath` passes an absolute path through
   * verbatim. Refusing has to happen before the install writes anything, so a
   * tampered receipt cannot leave a half-applied state behind.
   */
  it("refuses a prior receipt naming a path outside the roots, before writing", () => {
    seedPrePrefixInstall(["claude-code"]);
    const receipt = readReceipt();
    receipt.installs["claude-code"]!.files.push({ path: "/etc/ariadnev-probe", sha256: "0".repeat(64) });
    writeFileSync(receiptFile(), `${JSON.stringify(receipt, null, 2)}\n`);
    const before = readFileSync(receiptFile(), "utf8");

    expect(() =>
      installKit(kit, ["claude-code"], ctx, { timestamp: "20260102-000000", applyHookSettings: true }),
    ).toThrow(/outside allowed roots/);

    expect(readFileSync(receiptFile(), "utf8")).toBe(before);
    expect(existsSync(join(ctx.cwd, ".claude", "skills", "av-cook"))).toBe(false);
  });

  it("refuses a prior receipt from an unsupported schema", () => {
    seedPrePrefixInstall(["claude-code"]);
    const receipt = readReceipt();
    receipt.schemaVersion = 99;
    writeFileSync(receiptFile(), `${JSON.stringify(receipt, null, 2)}\n`);

    expect(() =>
      installKit(kit, ["claude-code"], ctx, { timestamp: "20260102-000000", applyHookSettings: true }),
    ).toThrow(/schemaVersion/);
  });

  /**
   * Under global scope codex, cursor, antigravity and generic all write the
   * *same physical* `~/.agents/skills`. Reinstalling one of them must not
   * delete files another's record still claims — those are not stale, they are
   * the other provider's live install, and removing them would make its every
   * diagnostic report missing files.
   */
  it("does not delete a path another provider's record still claims", () => {
    ctx = { ...ctx, scope: "global" };
    seedPrePrefixInstall(["codex", "cursor"]);
    const shared = join(ctx.home, ".agents", "skills", "cook", "SKILL.md");
    expect(existsSync(shared)).toBe(true);

    installKit(kit, ["cursor"], ctx, { timestamp: "20260102-000000", applyHookSettings: true });

    expect(existsSync(shared), "codex still claims this file").toBe(true);
    const receipt = readReceipt();
    for (const abs of claimedPaths(receipt)) {
      expect(existsSync(abs), `a record claims a file that is not there: ${abs}`).toBe(true);
    }

    // And once codex is reinstalled too, nothing claims it and it goes.
    installKit(kit, ["codex"], ctx, { timestamp: "20260103-000000", applyHookSettings: true });
    expect(existsSync(shared)).toBe(false);
  });
});

describe("a heal interrupted between the receipt write and the deletions", () => {
  /**
   * The window the ordering exists for. The receipt is written before the
   * deletes, so a kill in between leaves files on disk that no record claims —
   * exactly the orphan state, reached by crashing instead of by skipping the
   * heal. The journal is what makes it recoverable, and nothing on the install
   * path read the journal before this.
   */
  function crashedMidHeal(): string {
    seedPrePrefixInstall(["claude-code"]);
    const legacy = join(ctx.cwd, ".claude", "skills", "cook", "SKILL.md");
    const stale = readFileSync(legacy, "utf8");
    const hash = readReceipt().installs["claude-code"]!.files.find(
      (f) => fromPortablePath(f.path, ctx.home, ctx.cwd) === legacy,
    )!.sha256;

    // Post-crash state, built exactly: the new receipt is on disk, the legacy
    // file is still there, and the journal still lists it as pending.
    installKit(kit, ["claude-code"], ctx, { timestamp: "20260102-000000", applyHookSettings: true });
    mkdirSync(dirname(legacy), { recursive: true });
    writeFileSync(legacy, stale);
    writeJournal(baseRoot(), {
      schemaVersion: JOURNAL_SCHEMA_VERSION,
      timestamp: "20260102-000000",
      scope: ctx.scope,
      providers: [],
      healRemovals: [{ path: ".claude/skills/cook/SKILL.md", sha256: hash }],
    });
    return legacy;
  }

  it("finishes the removal on the next install and clears the journal", () => {
    const legacy = crashedMidHeal();

    installKit(kit, ["claude-code"], ctx, { timestamp: "20260103-000000", applyHookSettings: true });

    expect(existsSync(legacy), "the pending removal must be completed").toBe(false);
    expect(readJournal(baseRoot())).toBeNull();
    for (const abs of claimedPaths(readReceipt())) {
      expect(existsSync(abs)).toBe(true);
    }
  });

  it("still refuses to remove a pending file the user has since edited", () => {
    const legacy = crashedMidHeal();
    writeFileSync(legacy, "edited after the crash\n");

    installKit(kit, ["claude-code"], ctx, { timestamp: "20260103-000000", applyHookSettings: true });

    expect(readFileSync(legacy, "utf8")).toBe("edited after the crash\n");
  });
});

describe("a heal entry it cannot remove", () => {
  /**
   * The wedge. A removal that throws does so *after* the receipt write, so the
   * install actually succeeded but reports failure — and `clearJournal` never
   * runs. The next install re-executes the pending set before writing anything,
   * throws in the same place, and aborts. If the cause is deterministic, every
   * `av install` from then on fails at startup until the user finds and removes
   * the offending path by hand.
   *
   * A recorded file replaced by a directory is the cheapest deterministic
   * trigger; a chmod'd file or an open handle gets there the same way.
   */
  function wedge(): string {
    seedPrePrefixInstall(["claude-code"]);
    const legacy = join(ctx.cwd, ".claude", "skills", "cook", "SKILL.md");
    rmSync(legacy);
    mkdirSync(legacy, { recursive: true });
    return legacy;
  }

  it("completes the install and reports the entry instead of aborting", () => {
    const legacy = wedge();
    const { heal } = installKit(kit, ["claude-code"], ctx, { timestamp: "20260102-000000", applyHookSettings: true });

    expect(existsSync(join(ctx.cwd, ".claude", "skills", "av-cook", "SKILL.md"))).toBe(true);
    expect(heal.preserved.map((p) => p.path)).toContain(legacy);
    expect(readJournal(baseRoot()), "a completed run must clear its journal").toBeNull();
  });

  it("does not wedge the next install either", () => {
    wedge();
    installKit(kit, ["claude-code"], ctx, { timestamp: "20260102-000000", applyHookSettings: true });
    expect(() =>
      installKit(kit, ["claude-code"], ctx, { timestamp: "20260103-000000", applyHookSettings: true }),
    ).not.toThrow();
  });
});

/**
 * The journal reaches `executeHeal` without passing `assertPriorReceiptSafe` —
 * pending removals are recovered at the top of the run, before the receipt is
 * even read. It lives in the same `.ariadnev/` directory as the receipt, so it
 * is exactly as forgeable, and its own root check is the only thing standing
 * between a hand-edited journal and an arbitrary unlink.
 */
describe("a journal naming a path outside the roots", () => {
  it("refuses it, and does not fall back to deleting quietly", () => {
    seedPrePrefixInstall(["claude-code"]);
    writeJournal(baseRoot(), {
      schemaVersion: JOURNAL_SCHEMA_VERSION,
      timestamp: "20260102-000000",
      scope: ctx.scope,
      providers: [],
      healRemovals: [{ path: "/etc/ariadnev-probe", sha256: "0".repeat(64) }],
    });

    expect(() =>
      installKit(kit, ["claude-code"], ctx, { timestamp: "20260102-000000", applyHookSettings: true }),
    ).toThrow(/outside allowed roots/);
  });
});

describe("a dry run over a pre-prefix layout", () => {
  /**
   * "Run it with --dry-run first" is the natural advice for an upgrade that
   * deletes from the user's home directory, and it was the one instruction the
   * output could not honour: the whole heal sat behind the dry-run guard, so a
   * user about to lose ~1500 recorded files saw the writes and no mention of
   * the removals.
   */
  it("names what it would remove, and removes nothing", () => {
    seedPrePrefixInstall(["claude-code"]);
    const legacy = join(ctx.cwd, ".claude", "skills", "cook", "SKILL.md");
    const before = readFileSync(receiptFile(), "utf8");

    const { heal } = installKit(kit, ["claude-code"], ctx, {
      dryRun: true,
      timestamp: "20260102-000000",
      applyHookSettings: true,
    });

    expect(heal.wouldRemove).toContain(legacy);
    expect(heal.removed).toEqual([]);
    expect(existsSync(legacy)).toBe(true);
    expect(readFileSync(receiptFile(), "utf8")).toBe(before);
    expect(existsSync(join(baseRoot(), ".ariadnev", "backups"))).toBe(false);
  });
});
