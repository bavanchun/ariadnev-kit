---
phase: 5
title: "Pinned downgrade for av update"
status: completed
priority: P2
effort: "0.5d"
dependencies: []
---

# Phase 5: Pinned downgrade for av update

## Overview

`av update` can only move to the latest release. Add `--to <version>` so a user
who hits a regression can go back to a version that worked, without re-running
the installer by hand.

## Requirements

- Functional: `av update --to <version>` installs that exact release, verifying
  its checksum exactly as the latest path does.
- Functional: `--check` keeps reporting against latest; `--to` with `--check`
  reports what would be installed.
- Non-functional: an unknown or malformed version fails closed with a clear
  message and changes nothing on disk.

## Architecture

`packages/cli/src/cli/update-command.ts` today resolves the target through
`resolveLatest()`, which reads `${DOMAIN}/version` (short timeout, never throws),
then downloads the platform asset and verifies it against `checksums.txt` using
`assetNameFor` and `expectedSha`.

The edge already supports the pinned form: `/version?version=<x.y.z>` and
`/download/<asset>?version=<x.y.z>` resolve one exact release and fail closed on a
mismatch — verified live on production. So this phase adds a target resolver, not
a download path: `--to` substitutes an explicit version for `resolveLatest()`, and
every existing download-and-verify step is reused unchanged.

Version input is validated before it reaches a URL: exact `x.y.z`, no ranges, no
`latest`, no tag prefix — the same shape the edge's selector accepts, so a bad
value is rejected here rather than producing an opaque edge 400.

## Related Code Files

- Modify: `packages/cli/src/cli/update-command.ts` — `--to` option, target resolution
- Modify: the matching `*.test.ts` beside it — pinned success, unknown version,
  malformed version, `--to` + `--check`
- Modify: `kit/skills/av/SKILL.md` (from Phase 1) — document the flag
- Read-only: the edge selector behavior (`workers/edge/src/release-selector.js` in `ariadnev-web`)

## Implementation Steps

1. Add strict version parsing (exact `x.y.z`), rejecting everything else before
   any network call.
2. Resolve the target: `--to` wins over `resolveLatest()`; keep the existing
   timeout and failure semantics for the latest path.
3. Pass the version through to the release and asset requests as the edge's
   pinned selector.
4. Keep checksum verification mandatory on both paths — a downgrade is exactly
   when a user is least able to spot a bad binary.
5. Tests: pinned install, unknown version (edge 404), malformed input (no network
   call made), `--to` with `--check`.
6. Manually verify a real downgrade in a sandbox: install current, `--to 1.0.0`,
   confirm `av --version`.

## Success Criteria

- [x] `av update --to 1.0.0` downgrades a newer install and verifies the checksum.
      Verified against the live edge on 2026-08-16 once Phase 6 cut 1.1.0: a
      sandbox 1.0.0 install upgraded to 1.1.0 with plain `av update`, then
      `av update --to 1.0.0` took it back, each step confirmed by `av --version`.
- [x] A malformed version exits non-zero with no network request issued.
- [x] An unknown version fails closed without replacing the installed binary.
- [x] `av update` with no flag behaves exactly as before.
- [x] Tests cover all four cases; kit CI green.

## Risk Assessment

- **A half-written binary on a failed downgrade.** Signal: the download or
  checksum fails midway and `av` is gone. Response: reuse the existing
  download-to-temp-then-move sequence; never write over the live binary before
  verification passes.
- **`--to` becomes a way to install an unsupported old release.** Signal: a user
  pins a version predating the current kit layout and `av doctor` reports damage.
  Response: this is the user's explicit choice and the release is immutable; state
  in the skill that a downgrade may require re-running `av install`.
