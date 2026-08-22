import { existsSync, mkdirSync, cpSync, readdirSync, rmSync, statSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname, resolve, relative, isAbsolute } from "node:path";
import { z } from "zod";

/**
 * A backup directory name: `nowStamp()`'s `YYYYMMDD-HHMMSS`, optionally the
 * `pre-restore-` safety copy taken before a restore overwrites anything.
 *
 * Enforced rather than assumed. The backups parent is inside the user's project
 * for project scope, so anyone who can write a directory there can name it —
 * and the old lexicographic sort meant a `9999-…` directory outranked every
 * real backup while never being old enough to prune.
 */
export const BACKUP_DIR_NAME = /^(?:pre-restore-)?\d{8}-\d{6}$/;

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

const ManifestEntry = z.object({
  originalPath: z.string().min(1),
  relPath: RelPath,
  label: z.string(),
});

export const BackupManifestSchema = z.array(ManifestEntry);

export type BackupManifestEntry = z.infer<typeof ManifestEntry>;

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
  return result.data;
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
export function backupPath(target: string, backupRoot: string, label: string, scopeRoot: string): void {
  if (!existsSync(target)) return;
  const relPath = backupRelPath(target, scopeRoot);
  const dest = join(backupRoot, relPath);
  mkdirSync(dirname(dest), { recursive: true });
  if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
  cpSync(target, dest, { recursive: true });

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
  manifest.push({ originalPath: resolve(target), relPath, label });
  writeFileSync(manifestPath(backupRoot), `${JSON.stringify(manifest, null, 2)}\n`);
}

/** Directory names under `backupsParent` that this tool wrote, oldest first. */
export function backupDirNames(backupsParent: string): string[] {
  if (!existsSync(backupsParent)) return [];
  return readdirSync(backupsParent)
    .filter((name) => BACKUP_DIR_NAME.test(name))
    .filter((name) => statSync(join(backupsParent, name)).isDirectory())
    .sort();
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
  const names = backupDirNames(backupsParent);
  const stale = names.slice(0, Math.max(0, names.length - keep));
  for (const name of stale) rmSync(join(backupsParent, name), { recursive: true, force: true });
}
