---
"ariadnev": patch
---

Widen `CURRENT_RELEASE_TAG` to accept prereleases so phase 11's beta channel can cut.

`detect-release-source.mjs` gates candidate-build on `CURRENT_RELEASE_TAG.test(tag)`.
The regex only accepted `X.Y.Z`, so `ariadnev@1.2.1-beta.0` failed as "not a release
version" and the candidate-build + candidate-publish jobs skipped — no held draft
was ever created for the beta cut. `STABLE_RELEASE_TAG` stays strict so
previous-stable lock and "bare install selects stable" invariants are unchanged.
