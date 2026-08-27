// Which release tags this project recognises, in one place.
//
// Two grammars exist because the product was renamed: every release cut before
// the rename carries the old product name in its tag, and every one after
// carries `ariadnev`. Both name real, immutable releases, so anything that reads
// *backwards* — resolving a predecessor, locking one into a release contract —
// has to accept either. Anything that *produces* a tag stays strict on the
// current name.
//
// Kept as one module because the allowance was previously written out twice,
// in two languages, and the JSON copy was missed: a schema demanded
// `ariadnev@…` for a predecessor at a time when no such tag could exist, which
// made the first ariadnev release unreleasable. Restating a grammar in a second
// language is how the two drift.

const SEMVER = String.raw`(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)`;
// Optional SemVer 2.0 prerelease suffix (`-beta.0`, `-rc.1`, `-alpha.2.3`).
// Empty by design when the version is stable, so a stable tag under the current
// grammar keeps matching the same shape it did before this suffix existed.
const PRERELEASE = String.raw`(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?`;

/** Product names that have carried a release. Order is oldest-first. */
export const RELEASE_PRODUCT_NAMES = ["vcskill", "ariadnev"]; // brand-drift-allow: names the pre-rename release grammar

/** A tag naming any stable release this project has ever cut. Prereleases are
 * deliberately excluded: previous-stable lock and "bare install selects stable"
 * both depend on this staying stable-only. */
export const STABLE_RELEASE_TAG = new RegExp(`^(?:${RELEASE_PRODUCT_NAMES.join("|")})@${SEMVER}$`);

/** A tag for a release being produced now — current name, stable or prerelease.
 * `detect-release-source.mjs` gates candidate-build on this: without the
 * prerelease branch, a `1.2.1-beta.0` cut is refused as "not a release version"
 * and phase 11's beta channel cannot ship. */
export const CURRENT_RELEASE_TAG = new RegExp(`^${RELEASE_PRODUCT_NAMES.at(-1)}@${SEMVER}${PRERELEASE}$`);

export function isStableReleaseTag(tag) {
  return typeof tag === "string" && STABLE_RELEASE_TAG.test(tag);
}
