// Exact major.minor.patch only — no ranges, no "latest", no "v" prefix, no
// prerelease/build tags. Anchored so nothing after/before the three numeric
// segments (e.g. a trailing newline or shell-injection attempt) can sneak
// through before this value reaches a URL.
const VERSION_RE = /^\d+\.\d+\.\d+$/;

/** True when `v` is an exact version the edge's `?version=` selector accepts. */
export function isValidVersion(v: string): boolean {
  return VERSION_RE.test(v);
}

/** The edge's pinned-selector query string, or "" for the latest (unpinned) path. */
export function versionQuery(version: string | null): string {
  return version ? `?version=${version}` : "";
}
