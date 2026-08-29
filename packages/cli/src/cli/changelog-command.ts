// `av changelog` — what shipped in ariadnev's own releases.
//
// UPSTREAM READS ITS VENDOR'S CHANGELOG ENDPOINT; THIS READS ARIADNEV'S OWN
// RELEASES. Upstream's own changelog command fetches signed, public changelog
// metadata from its vendor's release domain and reports four products: a CLI, a
// desktop app, and two hosted kits. ariadnev operates no such domain and ships
// no desktop app or second kit, so three of those four are excluded by
// dependency — phase 1's ADR on remote-vendor halves. The function that survives is the one that meant
// something here: what changed between the version you are running and the
// latest one.
//
// The source is the repository's published releases, read through `gh` for the
// same reason `watch` does — ariadnev never holds a GitHub token of its own.
// The releases are what the signed update channel installs from, so this and
// `av update` are describing the same artifacts.

import { ghJson, realGh, type GhRunner } from "../github/gh.js";
import { isNewerVersion, parseLatestTag } from "./update-command.js";
import { packageVersion } from "../version.js";
import { EXIT, UsageError } from "./exit-codes.js";
import { jsonEnvelope } from "./json-envelope.js";

export const CHANGELOG_SCHEMA_VERSION = 1;
/** The repository whose releases ariadnev ships from. */
export const RELEASE_REPO = "bavanchun/ariadnev-kit";
const DEFAULT_LIMIT = 10;

export interface ChangelogOpts {
  readonly from?: string;
  /** Only releases newer than the running binary. */
  readonly sinceCurrent?: boolean;
  /** Include each release's body, not just its name and date. */
  readonly full?: boolean;
  readonly limit?: number;
  readonly json?: boolean;
  readonly currentVersion?: string;
}

export interface ChangelogResult {
  readonly output: string;
  readonly exitCode: number;
}

export interface ReleaseEntry {
  readonly version: string;
  readonly tag: string;
  readonly published_at: string | null;
  readonly prerelease: boolean;
  readonly body: string;
}

/**
 * GitHub's zero date, which `gh` returns for a release that was never published.
 *
 * Passed through as a string it renders as `0001-01-01`, a date a reader has to
 * recognise as a sentinel before they can discount it — and phase 11 already
 * decided that is a shape which gets read as real. It becomes null here, and
 * the renderer says "unpublished".
 */
const ZERO_DATE = /^0001-01-01/;

interface RawRelease {
  tagName?: unknown;
  publishedAt?: unknown;
  isPrerelease?: unknown;
  body?: unknown;
}

/**
 * Releases, newest first.
 *
 * Every field is coerced. A release body is written by a person and passes
 * through here on its way to a terminal; treating a missing one as `undefined`
 * is how the string "undefined" ends up in output.
 */
export function fetchReleases(gh: GhRunner, limit: number): ReleaseEntry[] {
  const raw = ghJson<RawRelease[]>(
    gh,
    ["release", "list", "--repo", RELEASE_REPO, "--limit", String(limit), "--json", "tagName,publishedAt,isPrerelease"],
    "reading ariadnev's releases",
  );
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((entry): entry is RawRelease => typeof entry?.tagName === "string")
    .map((entry) => ({
      version: parseLatestTag(entry.tagName as string),
      tag: entry.tagName as string,
      published_at: typeof entry.publishedAt === "string" && !ZERO_DATE.test(entry.publishedAt) ? entry.publishedAt : null,
      prerelease: entry.isPrerelease === true,
      body: "",
    }));
}

/** One release's notes. Fetched separately because `--full` is the exception. */
export function fetchBody(gh: GhRunner, tag: string): string {
  const result = ghJson<{ body?: unknown }>(
    gh,
    ["release", "view", tag, "--repo", RELEASE_REPO, "--json", "body"],
    `reading the notes for ${tag}`,
  );
  return typeof result.body === "string" ? result.body.trim() : "";
}

/**
 * Narrow the list to what was asked for.
 *
 * `--since-current` and `--from` are the same operation against different
 * baselines, so they share one comparison — the version-aware one from
 * `update-command`, not a string compare, which would sort 0.10.0 below 0.9.0.
 */
export function selectReleases(releases: readonly ReleaseEntry[], opts: ChangelogOpts, current: string): ReleaseEntry[] {
  const floor = opts.sinceCurrent ? current : opts.from;
  if (floor === undefined) return [...releases];
  if (!/^\d+\.\d+\.\d+/.test(floor)) throw new UsageError(`--from must be a version like 1.2.0, got ${JSON.stringify(floor)}`);
  return releases.filter((release) => isNewerVersion(release.version, floor));
}

export function runChangelog(opts: ChangelogOpts, gh: GhRunner = realGh("av changelog")): ChangelogResult {
  const current = opts.currentVersion ?? packageVersion();
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const selected = selectReleases(fetchReleases(gh, limit), opts, current);
  const entries = opts.full ? selected.map((entry) => ({ ...entry, body: fetchBody(gh, entry.tag) })) : selected;

  if (opts.json) {
    return {
      output: jsonEnvelope(CHANGELOG_SCHEMA_VERSION, "changelog.list", { current, releases: entries, repo: RELEASE_REPO }),
      exitCode: EXIT.ok,
    };
  }
  if (entries.length === 0) {
    return {
      output: opts.sinceCurrent ? `changelog: ${current} is the newest release` : "changelog: no releases matched",
      exitCode: EXIT.ok,
    };
  }
  const lines = [`ariadnev changelog — running ${current}`];
  for (const entry of entries) {
    lines.push(`  ${entry.version.padEnd(14)} ${entry.published_at?.slice(0, 10) ?? "unpublished"}${entry.prerelease ? "  (prerelease)" : ""}`);
    if (opts.full && entry.body) lines.push(...entry.body.split("\n").map((line) => `      ${line}`), "");
  }
  return { output: lines.join("\n"), exitCode: EXIT.ok };
}
