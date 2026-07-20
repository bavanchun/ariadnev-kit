---
title: "vcskill standalone binary + curl|bash install (replace npx)"
description: "Ship vcskill as a single Bun-compiled binary with the kit embedded, installed via curl|bash / ps1 / brew across 5 platforms. Drop npm publish."
status: completed
priority: P1
branch: "main"
tags: [distribution, binary, bun, install, release, tdd]
blockedBy: []
blocks: []
created: "2026-07-20T06:32:03.806Z"
createdBy: "ck:plan"
source: skill
---

# vcskill standalone binary + curl|bash install (replace npx)

## Overview

Design: brainstorm-260720-1325-vcskill-standalone-binary-curl-install-report.md.
Replace npx/npm with a **single self-contained Bun binary** (kit embedded),
installed via `curl … | bash` / `install.ps1` / brew, for 5 platforms, hosted on
GitHub Releases. User decisions: D1 embed kit (single-file), D2 drop npm publish,
D3 all 5 platforms, D4 GitHub raw URL hosting.

## Feasibility (scout-confirmed)

- Kit = 90 text files (408K), no binary assets → embeds as a codegen'd map.
- fs-read refactor surface = 3 files: `kit/load-kit.ts`, `cli/validate-command.ts`,
  `install/install-execute.ts` + `resolveKitRoot`.
- Bun 1.3.14 installed; deps (commander/gray-matter/smol-toml/zod/@clack/prompts)
  are Bun-compatible.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [KitSource abstraction + FsKitSource (behavior-preserving)](./phase-01-kitsource-abstraction-fskitsource-behavior-preserving-refact.md) | ✅ Completed |
| 2 | [Embedded kit codegen + EmbeddedKitSource + bun binary smoke](./phase-02-embedded-kit-codegen-embeddedkitsource-bun-binary-smoke.md) | ✅ Completed |
| 3 | [Release workflow: 5-target cross-compile + checksums + GH Release + drop npm](./phase-03-release-workflow-5-target-cross-compile-checksums-gh-release.md) | ✅ Completed |
| 4 | [install.sh + install.ps1 + brew + update→GH Releases + README](./phase-04-install-sh-install-ps1-brew-formula-update-gh-releases-readm.md) | ✅ Completed |

Order 1→4. Phase 2 carries the top risk (interactive wizard under `bun --compile`)
— de-risk there before investing in the release pipeline (3-4).

## Acceptance Criteria (whole plan)

**Design deviation (documented):** the scout showed kit reads span load-kit +
install-plan + artifact-content via absolute paths on the `Kit` object, so the
planned `KitSource` virtual-fs refactor would touch the Kit contract and risk
regressions. Switched to **self-extract**: kit embedded in the binary,
self-extracted to a version-stamped cache on first run; `getKitRoot()` tries fs
first, falls back to embedded. Same single-binary outcome, zero changes to
load-kit/install/validate behavior. (commit 61cd3c8)

- [x] Kit reads unchanged; `getKitRoot()` seam added (self-extract instead of KitSource) — full suite stays green
- [x] `generate-embedded-kit.mjs` maps all 92 assets (kit tree + manifest + config); `EmbeddedKitSource`≡`materializeEmbeddedKit`; binary-mode auto-selected (try-fs-then-embedded)
- [x] Bun binary runs list/validate/install/doctor/uninstall identically to npm build (live smoke from outside repo → embedded); interactive @clack wizard loads+renders+cancels cleanly under compile
- [x] Embedded-map drift-guard test (byte-compare vs live kit) — fails on staleness
- [x] Release workflow cross-compiles 5 targets (verified locally) + checksums.txt → GitHub Release; npm removed (`private: true`, provenance/OIDC/NPM_TOKEN dropped); changeset kept for version+CHANGELOG
- [x] install.sh (shellcheck-clean, sha256 verify tested) + install.ps1 + Formula/vcskill.rb
- [x] `vcskill update` checks GitHub Releases (parseLatestTag + GH API), offline-safe, tested
- [x] README headlines curl/brew/ps1 (no Node needed) + Gatekeeper note
- [x] 241 tests green; each phase TDD; setup-bun SHA-pinned (security review)

## Dependencies

Manual (user): create `bavanchun/homebrew-vcskill` tap repo (formula generated in
phase 4). macOS unsigned-binary Gatekeeper note in README (notarization deferred).

## Stop Conditions (whole plan)

- If the interactive `@clack/prompts` wizard cannot run under `bun --compile`
  (Phase 2 smoke), STOP and confirm: ship binary with non-interactive default +
  keep interactive only on the npm/dev path, or invest further. Do not proceed to
  the release pipeline on an unverified binary.
