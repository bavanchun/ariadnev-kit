---
phase: 6
title: "Release and propagate"
status: completed
priority: P2
effort: "0.5-1d"
dependencies: [1, 2, 3, 5]
---

# Phase 6: Release and propagate

## Overview

Phases 1-3 and 5 only exist in git until a release carries them to users. Cut the
release, then push the new docs bundle through the web repo so `ariadnev.com` and
`docs.ariadnev.com` describe what actually ships.

## Requirements

- Functional: a new immutable GitHub release with the five platform binaries,
  `checksums.txt`, and a regenerated docs bundle.
- Functional: `ariadnev.com/version` reports the new version; the docs site lists
  the new skills; `av update` upgrades a 1.0.0 install.
- Non-functional: the web deploy runs through `deploy.yml` from a committed
  immutable input — never a hand deploy.

## Architecture

Kit side: changesets → version bump → `build:release` (binaries) →
`docs-bundle:generate` (bundle + manifest + schema) → the Release workflow
publishes the tagged release.

Web side (`ariadnev-web`): `releases/ariadnev.json` pins version, tag, and
`bundleSha256`, with the bundle bytes committed under `releases/<version>/`. The
docs content generator rebuilds `apps/docs/content/generated/` from that bundle;
`scripts/deploy/compose-deployment-input.mjs` composes an immutable input; the
`deploy.yml` workflow deploys staging then production and writes a cutover record.

The edge Worker needs no change: it resolves releases through the GitHub App
credential added on 2026-08-16, which has no expiry.

## Related Code Files

- Modify (kit): `.changeset/*`, package versions, `releases`-adjacent generated artifacts
- Modify (web): `releases/ariadnev.json`, `releases/ariadnev-<version>/*`
- Create (web): `deployment/evidence/<productSha>.json`,
  `deployment/inputs/{staging,production}-ariadnev-<version>.json`
- Create (web): `deployment/records/*-deploy.json` from the workflow artifacts

## Implementation Steps

1. Add a changeset describing the two new skills, the reference cleanup, the eval
   coverage, and `av update --to`; version and tag.
2. `pnpm build:release` and `pnpm docs-bundle:generate`; verify the bundle manifest
   digest changed and the skill count in it is 105.
3. Publish the release; confirm assets and `checksums.txt`.
4. Web: update the release pin and committed bundle, regenerate docs content, run
   `pnpm run test:qualification`.
5. Compose evidence + immutable inputs; run `deploy.yml` for staging, verify, then
   production; commit the cutover records.
6. Verify live: `node scripts/deploy/probe-public-edge.mjs`, `/version`, the docs
   skills page, and `av update` from a 1.0.0 sandbox install.

## Success Criteria

- [x] GitHub release exists with 5 binaries + `checksums.txt` + docs bundle.
      `ariadnev@1.1.0`, 9 assets, published from tag `762db82` and immutable.
- [x] `curl https://ariadnev.com/version` returns the new version. Returns
      `1.1.0`; `?version=1.0.0` still returns `1.0.0`, so the pinned selector
      that Phase 5's downgrade depends on survived the cutover.
- [x] `docs.ariadnev.com` lists `av:av` and `av:plan-i18n`. The generated skill
      reference carries 105 entries and `/en/stable/` is 1.1.0.
- [x] A sandbox install of 1.0.0 upgrades cleanly via `av update`, and the new
      release downgrades back to 1.0.0 via `av update --to 1.0.0`. Both
      directions run against the live edge, not a mock.
- [x] `probe-public-edge.mjs` healthy; `edge-health` workflow green.
- [x] Cutover records committed under `deployment/records/` as
      `{staging,production}-ariadnev-1.1.0-deploy.json`, both `result: pass`.

## Outcome (2026-08-16)

Kit: PR #22 merged at `16d7416`, the Version Packages PR bumped to 1.1.0 at
`64100bb`, `release.yml` cut tag `ariadnev@1.1.0` and held the draft, and
`finalize-release.yml` was dispatched from the tag's ref to publish it.

Web (`ariadnev-web`): `3f3dedc` pins the 1.1.0 bundle, `74ac40c` records the
qualification evidence, `f9e2db7` composes both immutable inputs, and `45b6504`
commits the cutover records. Staging and production both deployed through
`deploy.yml`; nothing was deployed by hand.

The production preflight reports `immutableReleases: false`, which is a read
limitation rather than a finding — `GITHUB_TOKEN` cannot see that setting on the
core repo. Confirmed `true` directly, and the published release object carries
`immutable: true`.

## Risk Assessment

- **Cloudflare deploy tokens expire 2026-08-31.** Signal: the deploy job fails
  authenticating. Pre-decided response: rotate `CLOUDFLARE_DEPLOY_TOKEN` and
  `CLOUDFLARE_WAF_TOKEN` in both GitHub environments before starting this phase if
  the date has passed; nothing else in the release path expires.
- **Docs bundle digest drift between kit and web.** Signal: the web
  qualification's manifest digest check fails. Response: the pin carries
  `bundleSha256`; recompose the input from committed bytes rather than editing a
  digest by hand.
- **A release that users cannot roll back from.** Signal: a regression reported
  after cutover. Response: releases are immutable, the previous tag stays
  installable through the edge's pinned selectors
  (`/version?version=1.0.0`, `/download/<asset>?version=1.0.0`), and Phase 5 gives
  that a first-class command — which is why this phase depends on it. Without
  Phase 5 the only downgrade path is re-running the installer by hand.
