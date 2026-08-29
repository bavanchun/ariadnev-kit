# cook — P11 beta cut prep

**Date:** 2026-08-26 17:45 ICT
**Plan:** `260822-1407-ariadnev-kit-correctness-and-operational-hardening`
**Phase:** 11 (Beta release channel)
**Branch:** `chore/p11-beta-prep-260826` off `origin/main@c9f5c8e` — **not pushed**
**Scope reminder:** option A from the earlier cook — stage release artifacts
locally, stop before publish.

## What shipped on this branch

Two commits, working tree clean:

| # | SHA | Kind | Note |
|---|---|---|---|
| 1 | `87d1add` | fix | `packages/cli/src/kit/kit-embedded.generated.ts` regenerated — `EMBEDDED_VERSION` now `"1.2.0"` (was `"1.1.0"`), digest `358a494adb827762` |
| 2 | `7c70140` | chore | `.changeset/p11-open-beta-channel.md` + `plans/.../runbook-p11-beta-cut.md` |

Split so the pre-existing drift fix can land on its own if you want to unblock
CI without opening pre mode.

## Local dry-run

- `pnpm install --frozen-lockfile`: OK
- `pnpm -w lint` (tsc noEmit): OK
- `pnpm -w build` (tsup, 21.68 MB, 295ms): OK
- `pnpm -w test`: vitest **1410/1410**, node-test **125/126 (1 skipped)**, after regen

First test run failed 1: `embedded-kit > keeps the generated version aligned
with package metadata`. Reproduces on origin/main verbatim — Version PR #73
bumped `packages/cli/package.json` but did not regenerate the embedded map.
Commit 1 fixes it.

**Anomaly worth noting:** the last CI run on main (`32720655994`,
"fix(release): resolve smoke binary path to absolute (#74)") reports the same
14 embedded-kit tests all passing, yet the file at that SHA has the drift. Did
not chase — the drift is real either way and gets worse after
`changesets version` bumps package.json again. Flagged for follow-up.

## Blocker for step 5 of the runbook

`bavanchun/ariadnev-web` **PR #7** ("feat(edge): allow a beta version in the
release selector") = **OPEN, not merged**. Until it deploys, the edge answers
`400 bad request: prerelease-or-build-unsupported` for
`GET /version?version=<x>-beta.<n>`, and the beta is uninstallable via the
documented opt-in even after the CLI-side publish succeeds.

## What I intentionally did **not** do

- No `pnpm changeset pre enter beta` — mode-with-sharp-edges the plan warns
  about; must pair with `gh variable set ARIADNEV_RELEASE_CHANNEL beta` in
  the same window and that's a maintainer command.
- No `git push` on this branch.
- No `packages/cli/package.json` version edit — `changesets version` does that.
- No P11 checkbox flipped — beta isn't published yet.
- No touch to `fix/smoke-sibling-dir` (your open branch, 2 commits ahead of
  main). Runbook mentions merging it first only if you want the sibling-dir
  fixes in `-beta.1`.

## Handoff — what you actually run

Follow `plans/260822-1407-.../runbook-p11-beta-cut.md`. Short form:

1. Merge `bavanchun/ariadnev-web` PR #7, deploy, verify edge accepts
   `?version=…-beta.1`.
2. Push + merge this branch (`chore/p11-beta-prep-260826`).
3. `gh variable set ARIADNEV_RELEASE_CHANNEL --body beta`
4. New branch → `pnpm changeset pre enter beta` → PR → merge.
5. `gh workflow run finalize-release.yml` after the held-draft candidate lands.
6. Expected published tag: **`ariadnev@1.2.1-beta.1`**.

## Unresolved

- Web PR #7 owner + deploy ETA — kit prep sits idle without it.
- Whether CI on main is silently masking the embedded-drift assertion. Worth a
  short investigation before the beta cut runs the same tests in a Version PR.
- `fix/smoke-sibling-dir`: land in main before the cut, or leave for `-beta.2`?
