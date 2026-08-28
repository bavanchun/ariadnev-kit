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
  /** Every file currently present in the scanned surface, absolute. */
  listFiles(root: string): string[];
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
    const root = record.scope === "global" ? input.home : input.cwd;
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
    for (const path of deps.listFiles(root)) {
      if (seen.has(path) || ownedByAnyProvider.has(path)) continue;
      seen.add(path);
      classified.push({ path, state: "orphan" });
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

/** Counts for a summary line, in the order the classification table lists them. */
export function countByState(files: readonly ClassifiedFile[]): Record<FileState, number> {
  const counts = { clean: 0, modified: 0, orphan: 0, missing: 0 };
  for (const file of files) counts[file.state] += 1;
  return counts;
}
