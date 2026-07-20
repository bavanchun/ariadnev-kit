---
phase: 3
title: "Release workflow: 5-target cross-compile + checksums + GH Release + drop npm"
status: completed
priority: P1
effort: "4h"
dependencies: [2]
---

# Phase 3: Release workflow — cross-compile 5 targets, drop npm

## Overview

Replace the npm-publish release path with a binary-release pipeline: cross-compile
all 5 targets with Bun, checksum them, attach to the GitHub Release. Keep
changesets only for version bump + CHANGELOG.

## Requirements

- Drop npm publish: set `packages/cli/package.json` `"private": true`, remove
  `publishConfig.provenance` + the `id-token`/OIDC trusted-publishing reliance;
  remove `changeset publish` from the `release` script (keep `changeset version`).
- Cross-compile (single Ubuntu runner, Bun `--target`):
  `bun-darwin-arm64`, `bun-darwin-x64`, `bun-linux-x64`, `bun-linux-arm64`,
  `bun-windows-x64` → `vcskill-<os>-<arch>` (`.exe` for windows).
- Regenerate the embedded kit map before building (guarantee freshness).
- Emit `checksums.txt` (sha256 of each binary).
- On a release (version bump merged / tag), create/attach a GitHub Release with
  all binaries + `checksums.txt` as assets. Reuse the changesets-created release
  or create one from the tag.
- Keep the existing CI workflow (typecheck/build/validate/test) unchanged.

## Architecture

`.github/workflows/release.yml` rewritten: `changeset version` (bump+changelog,
no publish) → on the version commit/tag, a build job runs
`generate-embedded-kit` + a `bun build --compile` matrix (or a loop over targets)
→ `sha256sum` → `gh release create/upload`. No npm, no OIDC.

## Related Code Files

- Modify: `.github/workflows/release.yml`, `packages/cli/package.json`
  (`private`, scripts, drop provenance), root `package.json` `release` script
- Create: `packages/cli/scripts/build-binaries.mjs` (loop targets → binaries →
  checksums) — or inline in the workflow
- Modify: `scripts/verify-package-tarball.mjs` → repurpose/retire (npm tarball no
  longer shipped); replace with a binary smoke check if useful

## Implementation Steps

1. Flip `private: true`, drop provenance/OIDC, remove `changeset publish`.
2. Write `build-binaries.mjs`: regenerate embedded kit → `bun build --compile`
   each target → collect into `dist/release/` → `checksums.txt`.
3. Run it locally (host can at least build its own target; the 5-way matrix
   proves out in CI) — verify artifacts + checksums produced.
4. Rewrite `release.yml`: version (changeset) → build matrix → `gh release`
   upload. Validate the YAML.
5. Confirm CI (`ci.yml`) still green; no npm references remain in release path.

## Success Criteria

- [ ] npm publish fully removed (`private: true`, no provenance/OIDC, no `changeset publish`)
- [ ] `build-binaries.mjs` produces 5 binaries + `checksums.txt` (host target built locally; matrix in CI)
- [ ] Embedded kit regenerated as a build step (no stale-map release)
- [ ] `release.yml` creates a GitHub Release with binaries + checksums attached
- [ ] `ci.yml` unchanged and green; `pnpm test` green

## Risk Assessment

- Bun `--target` cross-compile from Linux may need the Bun toolchain per target —
  Bun supports this from one host; verify each target actually emits in CI.
- Release automation is hard to test without a real tag — gate first real release
  behind a manual `workflow_dispatch` dry-run that builds + checksums without
  publishing the release.

## Stop Conditions

- If a target fails to cross-compile in CI, STOP that target (ship the others),
  file a follow-up — do not block the whole release on one platform.
- Removing npm changes the public contract (install method) — this is the intended
  D2 decision; no extra confirmation needed, but README (phase 4) must land in the
  same release so users aren't left with dead `npx` docs.
