# Promoting dev to main for the 1.6.0 cut

**Date**: 2026-09-04 22:33
**Component**: release
**Status**: Resolved

## What happened

## What happened

The runtime-parity work was already merged into `dev` (46 commits). Cutting a
release from it was not possible: `release.yml` triggers on `push` to `main`, so
a promotion pull request is the only path to a version bump. PR #136 opens that
path.

Two defects surfaced while preparing the promotion, and both were fixed inside
this release rather than deferred.

**The writing-language resolver had never run.** `kit/hooks/_lib/writing-language.cjs`
required `./av-prefs-client.cjs`, a module that has never existed anywhere in the
repository — introduced by `4605f67` on 2026-08-15 and shipped in 1.5.0 and
1.5.1. Every invocation died with `MODULE_NOT_FOUND`. Three shipped skills
(ship, review-pr, github) instruct the agent to run it to decide which language
a pull request body is written in, so that step had been failing silently and
the language fell back to a guess. The fix is one line — the client that
actually exports `resolvePrefs` is `av-config-client.cjs` — plus a new test over
the documented precedence, written red first.

**The committed embedded kit trailed every release.** `kit-embedded.generated.ts`
records the package version, and `embedded-kit.test.ts` asserts it matches
`package.json`. The version bump is what invalidates the file, but regeneration
lived in a separate step, so `main` carried package 1.5.1 against embedded
1.4.0. It stayed invisible because CI skips the lint/unit job for commits that
touch only `package.json` and CHANGELOG — exactly the shape of a Version
Packages commit — and only surfaced on the next pull request that happened to
touch source, which is how it broke #133.

## Decision

Fix the cause, not the detection. Widening the CI path filter would have made
the drift visible one pull request earlier; moving the regeneration into
`version-packages` means the file cannot drift at all. Two facts were verified
before committing rather than assumed: the version job already installs Bun, and
`changesets/action` at the pinned revision commits through
`commitChangesFromRepo` with `addFromDirectory = cwd`, documented in `src/git.ts`
as emulating `git add .`. So a file the version command writes is committed with
the bump.

Released binaries were never mis-stamped. `build-binaries.mjs` regenerates the
map before `bun build --compile`; only the committed artifact drifted.

The release-tooling commit carries no changeset — it changes no published
behaviour.

## Next steps

Merge #136 once its checks pass. That fires `release.yml`, which opens the
Version Packages pull request for 1.6.0 from the eight accumulated changesets.
Merging that one publishes the release.
