// Exact `major.minor.patch`, optionally a `-beta.N` prerelease — no ranges, no
// "latest", no "v" prefix, no build metadata, no other prerelease word.
// Anchored so nothing before or after (a trailing newline, a shell-injection
// attempt) can sneak through before this value reaches a URL.
//
// Deliberately narrower than semver. The only prerelease this project publishes
// is `-beta.N`, and a value that reaches a URL should accept exactly what is
// expected rather than everything that is legal.
const VERSION_RE = /^\d+\.\d+\.\d+(?:-beta\.\d+)?$/;

/** True when `v` is an exact version the edge's `?version=` selector accepts. */
export function isValidVersion(v: string): boolean {
  return VERSION_RE.test(v);
}

/** True when `v` names a prerelease rather than a stable release. */
export function isPrerelease(v: string): boolean {
  return v.includes("-beta.");
}

/** The edge's pinned-selector query string, or "" for the latest (unpinned) path. */
export function versionQuery(version: string | null): string {
  return version ? `?version=${version}` : "";
}
