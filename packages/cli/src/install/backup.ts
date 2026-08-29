import { existsSync, mkdirSync, cpSync, readdirSync, rmSync, statSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname, resolve, relative, isAbsolute, sep } from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";

/**
 * A backup directory name: `nowStamp()`'s `YYYYMMDD-HHMMSS`, optionally the
 * `pre-restore-` safety copy taken before a restore overwrites anything, or the
 * `heal-` copy of a tree an install removed because this build no longer writes
 * it there.
 *
 * Enforced rather than assumed. The backups parent is inside the user's project
 * for project scope, so anyone who can write a directory there can name it —
 * and the old lexicographic sort meant a `9999-…` directory outranked every
 * real backup while never being old enough to prune.
 */
export const BACKUP_DIR_NAME = /^(?:pre-restore-|heal-)?\d{8}-\d{6}$/;

/**
 * The subset rotation may prune — everything except a heal backup.
 *
 * A heal backup is the only surviving copy of a tree the upgrade deleted, and
 * `rotateBackups(parent, keep = 3)` would expire it after three more mutating
 * runs. That is weeks later, with nothing to connect the loss to the upgrade
 * that caused it, and it would quietly void the rollback recipe.
 */
const ROTATABLE_DIR_NAME = /^(?:pre-restore-)?\d{8}-\d{6}$/;

/**
 * `relPath` is a location inside the backup root, so it must stay inside it:
 * never absolute, never climbing out with `..`. `backupRelPath` only ever emits
 * `scope/…` or `abs/…`, so this rejects a hand-edited manifest, not our own
 * output.
 */
const RelPath = z
  .string()
  .min(1)
  .refine((value) => !isAbsolute(value), { message: "relPath must not be absolute" })
  .refine((value) => !value.split(/[/\\]/).includes(".."), { message: "relPath must not contain \"..\"" });

/**
 * Manifest schema 2 adds `kind`, `sha256` and `size`.
 *
 * Schema 1 recorded only where a copy came from, which is enough to put it back
 * and not enough to know whether it is still the thing that was copied. Without
 * a hash `backups verify` cannot exist, and a `verify` that answers `ok` because
 * it has nothing to compare is worse than no `verify` at all — it is trusted.
 *
 * The three fields are optional in the type so a schema-1 manifest still parses
 * and still restores. `verify` reports `unverifiable` for those rather than a
 * false `ok`.
 */
export const BACKUP_MANIFEST_VERSION = 2;

const ManifestEntry = z.object({
  originalPath: z.string().min(1),
  relPath: RelPath,
  label: z.string(),
  /** Absent in a schema-1 entry. */
  kind: z.enum(["file", "dir"]).optional(),
  /** Bytes for a file; the tree digest below for a directory. Absent in schema 1. */
  sha256: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  /** Total bytes, summed across the tree for a directory. Absent in schema 1. */
  size: z.number().int().nonnegative().optional(),
});

/** A schema-1 manifest is a bare array; a schema-2 one wraps it in an object. */
export const BackupManifestSchema = z.union([
  z.array(ManifestEntry),
  z.object({
    manifestVersion: z.literal(BACKUP_MANIFEST_VERSION),
    entries: z.array(ManifestEntry),
  }),
]);

export type BackupManifestEntry = z.infer<typeof ManifestEntry>;

/**
 * Content digest of a backed-up target.
 *
 * A directory gets a tree digest: every file below it, sorted by its path
 * relative to the target, folded in as `relpath\0<sha256 of bytes>\n`. Paths
 * are part of the digest, so moving a file inside the tree changes it — hashing
 * only the contents would call a rearranged tree identical.
 */
export function hashTarget(target: string): { kind: "file" | "dir"; sha256: string; size: number } {
  const info = statSync(target);
  if (!info.isDirectory()) {
    const bytes = readFileSync(target);
    return { kind: "file", sha256: createHash("sha256").update(bytes).digest("hex"), size: bytes.length };
  }
  const digest = createHash("sha256");
  let size = 0;
  for (const rel of filesUnder(target).sort()) {
    const bytes = readFileSync(join(target, rel));
    digest.update(`${rel.split(sep).join("/")}\0${createHash("sha256").update(bytes).digest("hex")}\n`);
    size += bytes.length;
  }
  return { kind: "dir", sha256: digest.digest("hex"), size };
}

/** Every file below `root`, as paths relative to it. Symlinks are not followed. */
function filesUnder(root: string, prefix = ""): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(join(root, prefix), { withFileTypes: true })) {
    const rel = join(prefix, entry.name);
    if (entry.isDirectory()) out.push(...filesUnder(root, rel));
    else if (entry.isFile()) out.push(rel);
  }
  return out;
}

function manifestPath(backupRoot: string): string {
  return join(backupRoot, "manifest.json");
}

/**
 * Entries recorded for this backup root; `[]` when there is no manifest at all
 * — a backup written before manifests existed, or a missing directory.
 *
 * A manifest that exists but does not parse **throws**. Those are different
 * situations and used to be reported as the same one: the caller printed
 * "created before backup manifests were added" for a truncated or tampered
 * file, which reads as reassurance about the very case that deserves alarm.
 */
export function readBackupManifest(backupRoot: string): BackupManifestEntry[] {
  const p = manifestPath(backupRoot);
  if (!existsSync(p)) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(p, "utf8"));
  } catch (err) {
    throw new Error(`invalid backup manifest at ${p}: ${err instanceof Error ? err.message : String(err)}`);
  }
  const result = BackupManifestSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`invalid backup manifest at ${p}: ${result.error.issues.map((i) => i.message).join("; ")}`);
  }
  return Array.isArray(result.data) ? result.data : result.data.entries;
}

/**
 * Where the copy of `target` lives inside a backup root. Mirrors the target's
 * own directory structure so two files can never share a slot — keying by
 * basename collapsed every skill's `SKILL.md` onto one path and lost all but
 * the last. Targets outside the scope root (a project-scope install still
 * writes home-scoped provider dirs) keep their full path shape under `abs/`.
 */
function backupRelPath(target: string, scopeRoot: string): string {
  const rel = relative(resolve(scopeRoot), resolve(target));
  if (rel !== "" && !rel.startsWith("..") && !isAbsolute(rel)) return join("scope", rel);
  return join("abs", resolve(target).replace(/^([A-Za-z]):/, "$1").replace(/^[/\\]+/, ""));
}

/**
 * Copy an existing target (file or dir) into the backup root before it gets
 * overwritten, and record the original path in a manifest so
 * `ariadnev backups restore` knows where to copy it back. No-op when the
 * target does not exist. `label` classifies the entry for display; it no
 * longer takes part in the path, so it cannot cause a collision.
 */
export function backupPath(
  target: string,
  backupRoot: string,
  label: string,
  scopeRoot: string,
  /**
   * Store these bytes instead of copying `target`.
   *
   * For the one file a snapshot can catch mid-write: the activity log's current
   * segment, truncated at its last complete record. `originalPath` still names
   * the real file, so restore puts it back where it came from — only the stored
   * content differs, and it differs by being a valid prefix rather than a torn
   * copy. Everything below is shared, so a snapshot entry is hashed, recorded
   * and restored by exactly the code an install-time backup uses.
   */
  content?: Buffer,
): void {
  if (!existsSync(target)) return;
  const relPath = backupRelPath(target, scopeRoot);
  const dest = join(backupRoot, relPath);
  mkdirSync(dirname(dest), { recursive: true });
  if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
  if (content === undefined) cpSync(target, dest, { recursive: true });
  else writeFileSync(dest, content);

  // A writer, so it reads defensively. `readBackupManifest` throws on a corrupt
  // manifest, which is right for restore — but this runs during install,
  // uninstall and `doctor --fix`, and aborting one of those because a previous
  // manifest was truncated would turn a cosmetic problem into a failed install.
  // The bad file is replaced by the write below either way.
  let existing: BackupManifestEntry[] = [];
  try {
    existing = readBackupManifest(backupRoot);
  } catch {
    existing = [];
  }
  const manifest = existing.filter((e) => e.relPath !== relPath);
  // Hashed from the copy, not the source: those are byte-identical right now,
  // and reading the copy is what `verify` will later re-read, so a difference
  // between the two shows up immediately rather than on the day it matters.
  manifest.push({ originalPath: resolve(target), relPath, label, ...hashTarget(dest) });
  writeManifest(backupRoot, manifest);
}

/** Always schema 2. Reading still accepts a schema-1 bare array. */
function writeManifest(backupRoot: string, entries: BackupManifestEntry[]): void {
  const doc = { manifestVersion: BACKUP_MANIFEST_VERSION, entries };
  writeFileSync(manifestPath(backupRoot), `${JSON.stringify(doc, null, 2)}\n`);
}

/** Directory names under `backupsParent` matching `pattern`, oldest first. */
function dirNamesMatching(backupsParent: string, pattern: RegExp): string[] {
  if (!existsSync(backupsParent)) return [];
  return readdirSync(backupsParent)
    .filter((name) => pattern.test(name))
    .filter((name) => statSync(join(backupsParent, name)).isDirectory())
    .sort();
}

/** Directory names under `backupsParent` that this tool wrote, oldest first. */
export function backupDirNames(backupsParent: string): string[] {
  return dirNamesMatching(backupsParent, BACKUP_DIR_NAME);
}

/**
 * Keep only the most recent `keep` timestamped backup dirs under `backupsParent`,
 * pruning older ones. Names are fixed-width timestamps, so lexicographic order
 * is chronological order.
 *
 * Only well-formed names take part. A directory we did not write is neither
 * counted toward `keep` nor deleted — it cannot push a real backup out of the
 * window, and we do not remove other people's files to make room.
 */
export function rotateBackups(backupsParent: string, keep = 3): void {
  const names = dirNamesMatching(backupsParent, ROTATABLE_DIR_NAME);
  const stale = names.slice(0, Math.max(0, names.length - keep));
  for (const name of stale) rmSync(join(backupsParent, name), { recursive: true, force: true });
}
