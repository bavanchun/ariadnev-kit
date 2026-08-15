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
// in two languages, and the JSON copy was missed: the web-consumer lock schema
// demanded `ariadnev@…` for a predecessor at a time when no such tag could
// exist, which made the first ariadnev release unreleasable.

const SEMVER = String.raw`(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)`;

/** Product names that have carried a release. Order is oldest-first. */
export const RELEASE_PRODUCT_NAMES = ["vcskill", "ariadnev"]; // brand-drift-allow: names the pre-rename release grammar

/** A tag naming any release this project has ever cut. */
export const STABLE_RELEASE_TAG = new RegExp(`^(?:${RELEASE_PRODUCT_NAMES.join("|")})@${SEMVER}$`);

/** A tag for a release being produced now — current name only. */
export const CURRENT_RELEASE_TAG = new RegExp(`^${RELEASE_PRODUCT_NAMES.at(-1)}@${SEMVER}$`);

export function isStableReleaseTag(tag) {
  return typeof tag === "string" && STABLE_RELEASE_TAG.test(tag);
}
