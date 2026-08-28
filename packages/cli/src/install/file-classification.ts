// What ariadnev owns in a directory, and what it is allowed to do about it.
//
// THERE IS NO SECOND OWNERSHIP RECORD. `install-receipt.ts` is the manifest:
// it already stores a portable path and a sha256 for every file an install
// wrote. Adding a parallel `ownership.json` would create two records of the
// same fact, and the failure mode of two records is that they disagree during
// an `uninstall` — which is the one moment nobody can afford ambiguity.
//
// THE ORPHAN GUARANTEE IS STRUCTURAL, NOT A CHECK. `plannedDeletions` selects
// from the classified set by state, and an orphan is never in the selected
// states. There is no flag that reaches it, because there is no branch that
// reaches it — the safety property is a consequence of the shape rather than of
// a condition someone has to remember to write.
//
// That matters here more than anywhere else in this tool. A root on the machine
// this was designed against holds 131 entries, 30 of which belong to other
// tools, and this project has already shipped one installer RCE and designed
// one migration that would have renamed those 30 directories.

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ProviderId } from "../providers/spec-verified.js";
import { fromPortablePath, type Receipt } from "./install-receipt.js";

/**
 * | state | meaning | `update` | `uninstall` |
 * |---|---|---|---|
 * | clean | in the receipt, hash matches | overwrite | delete |
 * | modified | in the receipt, hash differs | skip unless `--force` | refuse unless `--force` |
 * | orphan | on disk, in no receipt | ignore | **report only, never delete** |
 * | missing | in the receipt, gone | recreate | skip |
 */
export const FILE_STATES = ["clean", "modified", "orphan", "missing"] as const;

export type FileState = (typeof FILE_STATES)[number];

export interface ClassifiedFile {
  /** Absolute path on this machine. */
  readonly path: string;
  readonly state: FileState;
  /** The provider whose receipt record owns it; absent for an orphan. */
  readonly providerId?: ProviderId;
}

export interface ClassifyDeps {
  fileExists(absPath: string): boolean;
  /**
   * Bytes, not text. The receipt's hash was taken over bytes, so reading a font
   * or an image back as utf8 yields a different digest — every binary file then
   * looks user-modified. That is not hypothetical: it once preserved 55 files
   * through what should have been a complete uninstall.
   */
  readFileContent(absPath: string): Buffer | string;
  /**
   * The files directly inside one directory, absolute, without recursing.
   *
   * Optional, and the orphan report is what is lost without it — never the
   * safety property, which does not depend on knowing an orphan exists.
   */
  listFiles?(dir: string): string[];
}

/**
 * The directories to scan for orphans: exactly the ones holding a file the
 * receipt claims, and no others.
 *
 * Scanning a scope root instead would be wrong in both directions. The home
 * root on the machine this was designed against holds 131 entries, 30 of them
 * belonging to other tools — every one would be reported as an orphan, which is
 * noise dressed as a finding, and it would invite someone to "clean up" a list
 * that is mostly other people's work. A directory ariadnev actually wrote into
 * is the only place a neighbouring file says anything about this install.
 *
 * Not recursive, for the same reason: a nested subtree we do not own is not our
 * business. A subdirectory we *do* own arrives in this set on its own, carried
 * in by the receipt entry for the file inside it.
 */
export function ownedDirectories(receipt: Receipt, home: string, cwd: string): string[] {
  const dirs = new Set<string>();
  for (const record of Object.values(receipt.installs)) {
    for (const file of record?.files ?? []) {
      dirs.add(dirname(fromPortablePath(file.path, home, cwd)));
    }
  }
  return [...dirs].sort();
}

export interface ClassifyInput {
  readonly receipt: Receipt;
  /** The providers being acted on. Others' files stay owned, not orphaned. */
  readonly providerIds: readonly ProviderId[];
  readonly home: string;
  readonly cwd: string;
}

function digest(content: Buffer | string): string {
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Classify every file the receipt claims, plus every file on disk it does not.
 *
 * Ownership is read across **all** providers in the receipt, not just the ones
 * being acted on: a file belonging to a provider this run is not touching is
 * still owned, and calling it an orphan would be a lie in the safest direction
 * but a lie all the same — it would appear in a report as "not ours".
 */
export function classifyFiles(input: ClassifyInput, deps: ClassifyDeps): ClassifiedFile[] {
  const ownedByAnyProvider = new Set<string>();
  for (const record of Object.values(input.receipt.installs)) {
    for (const file of record?.files ?? []) {
      ownedByAnyProvider.add(fromPortablePath(file.path, input.home, input.cwd));
    }
  }

  const classified: ClassifiedFile[] = [];
  const seen = new Set<string>();

  for (const providerId of input.providerIds) {
    const record = input.receipt.installs[providerId];
    if (!record) continue;
    for (const file of record.files) {
      const path = fromPortablePath(file.path, input.home, input.cwd);
      seen.add(path);
      if (!deps.fileExists(path)) {
        classified.push({ path, state: "missing", providerId });
        continue;
      }
      const matches = digest(deps.readFileContent(path)) === file.sha256;
      classified.push({ path, state: matches ? "clean" : "modified", providerId });
    }
  }

  const listFiles = deps.listFiles;
  if (listFiles) {
    for (const dir of ownedDirectories(input.receipt, input.home, input.cwd)) {
      for (const path of listFiles(dir)) {
        if (seen.has(path) || ownedByAnyProvider.has(path)) continue;
        seen.add(path);
        classified.push({ path, state: "orphan" });
      }
    }
  }

  return classified;
}

/**
 * The files a deletion is permitted to touch.
 *
 * `force` widens this from `clean` to `clean | modified`. It does **not** reach
 * `orphan`, and no argument to this function can: the selected states are
 * written out, and orphan is not among them. Nor `missing` — there is nothing
 * there to delete, and planning to unlink a path that does not exist is how a
 * race turns into deleting a file someone else just created.
 */
export function plannedDeletions(files: readonly ClassifiedFile[], options: { force: boolean }): ClassifiedFile[] {
  const deletable: readonly FileState[] = options.force ? ["clean", "modified"] : ["clean"];
  return files.filter((file) => deletable.includes(file.state));
}

/** Files kept back, with the reason a user needs to understand the outcome. */
export function refusedDeletions(
  files: readonly ClassifiedFile[],
  options: { force: boolean },
): { path: string; reason: string }[] {
  const refused: { path: string; reason: string }[] = [];
  for (const file of files) {
    if (file.state === "modified" && !options.force) {
      refused.push({ path: file.path, reason: "modified since install — not removed (use --force to delete it)" });
    } else if (file.state === "orphan") {
      refused.push({ path: file.path, reason: "not installed by ariadnev — never removed" });
    }
  }
  return refused;
}

/**
 * Classification against the real filesystem.
 *
 * `fileExists` asks whether a **readable regular file** is there, not merely
 * whether the path resolves. A recorded file can be replaced by a directory —
 * an interrupted heal does it, and so does a user reorganising by hand — and
 * then `readFileSync` throws EISDIR. Answering "yes it exists" and letting the
 * read throw turns a strange path into an aborted install, which is the wedge
 * `e2e-heal` was written to prevent: every subsequent run fails in the same
 * place until someone finds the path by hand.
 *
 * Calling it `missing` instead is both true and useful in each direction. The
 * file this tool installed is genuinely no longer there; an install rewrites
 * it, and an uninstall plans no deletion — so nothing unlinks whatever has
 * taken its place.
 */
export const realClassifyDeps: ClassifyDeps = {
  fileExists: (path) => {
    try {
      return statSync(path).isFile();
    } catch {
      return false;
    }
  },
  // Bytes, deliberately: hashing a font read back as utf8 never matches the
  // receipt, so every binary file would look edited.
  readFileContent: (path) => readFileSync(path),
  listFiles: (dir) => {
    try {
      return readdirSync(dir, { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => join(dir, entry.name));
    } catch {
      return [];
    }
  },
};

/**
 * Absolute paths of every file in the receipt the user has edited since it was
 * written — what a re-install must not silently overwrite.
 *
 * Reads the whole receipt rather than one provider's record. An install run
 * targets the providers it was asked for, but the file it is about to write may
 * be recorded under another one, and "did the user edit this file" is a
 * question about the file, not about which provider claimed it.
 */
export function modifiedPaths(receipt: Receipt, home: string, cwd: string, deps: ClassifyDeps): Set<string> {
  const classified = classifyFiles(
    { receipt, providerIds: Object.keys(receipt.installs) as ProviderId[], home, cwd },
    // The orphan scan is dead weight here — this only reads `modified`, which
    // comes from the receipt rows — and it costs a directory walk per owned
    // directory on a path that runs before every install.
    { fileExists: deps.fileExists, readFileContent: deps.readFileContent },
  );
  return new Set(classified.filter((file) => file.state === "modified").map((file) => file.path));
}

/** Counts for a summary line, in the order the classification table lists them. */
export function countByState(files: readonly ClassifiedFile[]): Record<FileState, number> {
  const counts = { clean: 0, modified: 0, orphan: 0, missing: 0 };
  for (const file of files) counts[file.state] += 1;
  return counts;
}
