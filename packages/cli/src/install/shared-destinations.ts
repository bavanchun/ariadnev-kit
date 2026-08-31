// What happens when two providers write to the same file.
//
// Several providers resolve to one destination root — `.agents/skills` is
// shared by cursor, antigravity, omp, dsh and generic, and by codex too under
// global scope. That much was known: `install-heal.ts` already refuses to
// delete a path another provider's record still claims.
//
// What was not handled is that they do not write the *same bytes* there. The
// adapt engine is provider-dependent by design — `path-rewrites.ts`,
// `tool-rewrites.ts` and `compatibility-footer.ts` each carry a per-provider
// table — so one path can have as many intended contents as there are providers
// claiming it. Providers execute in sequence, so the last one wins on disk.
//
// THE BUG THIS FIXES. `buildInstall` hashed `op.content`: what a provider
// *intended* to write. For a path some later provider overwrote, that hash
// describes bytes that are no longer there. The next install compares the
// earlier provider's record against the file and finds a mismatch, reports
// "modified since install", and refuses to touch it — for every provider, not
// just the one whose record drifted. The file is then frozen until someone
// passes `--force`, and nothing in the report suggests that is what happened.
//
// Measured on a real machine before the fix: codex and cursor shared 1485
// paths, 42 of which had different recorded hashes; all 42 files held cursor's
// bytes and all 42 were recorded as codex-modified. The user had edited none of
// them.
//
// The receipt's question is "is this file still the one we wrote", so its answer
// has to be about the file, not about an intention. This module computes what
// was actually left on disk, and names the conflicts so the overlap is reported
// rather than discovered months later.
import { createHash } from "node:crypto";

/** One path more than one provider wrote, with different bytes each time. */
export interface DestinationConflict {
  path: string;
  /** Every provider that wrote here, in execution order. The last one won. */
  providers: string[];
  /** The provider whose bytes are on disk. */
  winner: string;
}

export interface SharedDestinations {
  /** Absolute path → sha256 of the bytes actually left on disk. */
  canonical: Map<string, string>;
  conflicts: DestinationConflict[];
}

export interface WriteRecord {
  path: string;
  content: string | Buffer;
}

export interface ProviderWrites {
  providerId: string;
  writes: WriteRecord[];
}

function sha256(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Resolve what each shared path ends up holding, given the providers in one run
 * **in the order they execute**. Order is the whole input: "last writer wins" is
 * not a policy this chooses, it is what the filesystem already did, and this
 * only has to describe it correctly.
 *
 * A path written by one provider produces no conflict, and neither does one
 * written by several providers with identical bytes — that is two providers
 * agreeing, which is the common case and not worth a word to the user.
 */
export function resolveSharedDestinations(entries: ProviderWrites[]): SharedDestinations {
  const canonical = new Map<string, string>();
  const writers = new Map<string, string[]>();
  const hashes = new Map<string, Set<string>>();

  for (const entry of entries) {
    for (const write of entry.writes) {
      const digest = sha256(write.content);
      // Later entries overwrite earlier ones, which is exactly what the
      // sequential execute does to the file itself.
      canonical.set(write.path, digest);
      const seen = writers.get(write.path) ?? [];
      // A provider that writes the same path twice in one run is still one
      // writer; recording it twice would invent a conflict with itself.
      if (seen.at(-1) !== entry.providerId) seen.push(entry.providerId);
      writers.set(write.path, seen);
      const digests = hashes.get(write.path) ?? new Set<string>();
      digests.add(digest);
      hashes.set(write.path, digests);
    }
  }

  const conflicts: DestinationConflict[] = [];
  for (const [path, providers] of writers) {
    if (providers.length < 2) continue;
    if ((hashes.get(path)?.size ?? 1) < 2) continue;
    conflicts.push({ path, providers, winner: providers.at(-1)! });
  }
  conflicts.sort((a, b) => a.path.localeCompare(b.path));
  return { canonical, conflicts };
}

/**
 * The report line for a run whose providers disagreed about a shared file.
 *
 * Grouped by the provider pair rather than printed per file: 42 lines saying
 * the same thing about 42 files in one directory is a wall, and the fact worth
 * reading is which provider's adaptation the other one is now getting.
 */
export function renderConflictSummary(conflicts: DestinationConflict[]): string[] {
  if (conflicts.length === 0) return [];
  const groups = new Map<string, DestinationConflict[]>();
  for (const conflict of conflicts) {
    const key = `${conflict.providers.join(" + ")}`;
    groups.set(key, [...(groups.get(key) ?? []), conflict]);
  }

  const lines = ["", "  shared destinations — these providers write the same files with different content:"];
  for (const [pair, group] of groups) {
    const winner = group[0].winner;
    lines.push(`      ${pair}: ${group.length} file(s) — ${winner} wrote last, so its adaptation is what is on disk`);
    for (const conflict of group.slice(0, 3)) lines.push(`          ${conflict.path}`);
    if (group.length > 3) lines.push(`          … and ${group.length - 3} more`);
  }
  lines.push("      The receipt records what is on disk, so these are not reported as your edits.");
  return lines;
}
