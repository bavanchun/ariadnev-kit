---
title: "vcskill standalone binary + curl|bash install (replace npx)"
description: "Ship vcskill as a single Bun-compiled binary with the kit embedded, installed via curl|bash / ps1 / brew across 5 platforms. Drop npm publish."
status: pending
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
| 1 | [KitSource abstraction + FsKitSource (behavior-preserving)](./phase-01-kitsource-abstraction-fskitsource-behavior-preserving-refact.md) | Pending |
| 2 | [Embedded kit codegen + EmbeddedKitSource + bun binary smoke](./phase-02-embedded-kit-codegen-embeddedkitsource-bun-binary-smoke.md) | Pending |
| 3 | [Release workflow: 5-target cross-compile + checksums + GH Release + drop npm](./phase-03-release-workflow-5-target-cross-compile-checksums-gh-release.md) | Pending |
| 4 | [install.sh + install.ps1 + brew + update→GH Releases + README](./phase-04-install-sh-install-ps1-brew-formula-update-gh-releases-readm.md) | Pending |

Order 1→4. Phase 2 carries the top risk (interactive wizard under `bun --compile`)
— de-risk there before investing in the release pipeline (3-4).

## Acceptance Criteria (whole plan)

- [ ] All kit reads go through a `KitSource` interface; `FsKitSource` preserves current behavior — full existing suite (232+) stays green
- [ ] `scripts/generate-embedded-kit.ts` produces a map of all 90 kit files; `EmbeddedKitSource` reads it; binary-mode auto-selected
- [ ] A locally-built Bun binary runs `list` / `validate` / `install` / `doctor` / `uninstall` identically to the npm build, incl. the interactive install wizard (or a documented non-interactive fallback)
- [ ] Embedded-map drift fails CI (regenerate + diff, or validate check)
- [ ] Release workflow cross-compiles 5 targets, emits `checksums.txt`, attaches binaries to the GitHub Release; npm publish removed (`private: true`, provenance dropped); changeset kept for version+CHANGELOG only
- [ ] `install.sh` + `install.ps1` detect os/arch, download from latest Release, verify sha256, install to PATH; brew formula generated
- [ ] `vcskill update` checks GitHub Releases (not npm); offline-safe
- [ ] README headlines curl/brew/ps1; `curl … | bash` works on a Node-less machine
- [ ] `pnpm test` green throughout; each phase TDD (lock behavior first)

## Dependencies

Manual (user): create `bavanchun/homebrew-vcskill` tap repo (formula generated in
phase 4). macOS unsigned-binary Gatekeeper note in README (notarization deferred).

## Stop Conditions (whole plan)

- If the interactive `@clack/prompts` wizard cannot run under `bun --compile`
  (Phase 2 smoke), STOP and confirm: ship binary with non-interactive default +
  keep interactive only on the npm/dev path, or invest further. Do not proceed to
  the release pipeline on an unverified binary.
