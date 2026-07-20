---
phase: 1
title: Release smoke-test
status: completed
effort: ''
---

# Phase 1: Release smoke-test

## Overview

Run the freshly-compiled host-target binary in a scratch dir during release CI and assert it
actually works — guards the silent-break class already hit this session (empty `--version`,
no-output entry, hook-verify wrong runtime).

## Requirements

- Functional: after cross-compile, execute the host binary and assert (a) `--version` prints the
  expected version + build-type, (b) `list` (or `validate`) loads the embedded kit with real counts
  (21 skills / 13 agents / 6 hooks), (c) no output line leaks an absolute dev path (`/Users/…`).
- Non-functional: fast (<10s), zero network, fail-closed (any assertion → exit non-zero → CI red).

## Architecture

New Node script `packages/cli/scripts/smoke-binary.mjs`: takes a binary path arg, spawns it in a
`mkdtemp` scratch cwd, runs the assertions above by parsing stdout, exits 1 with a clear message on
first failure. Wired into `release.yml` right after `Cross-compile binaries`, run against the
host-target artifact only (can't execute cross-arch binaries on the runner). Locate the host artifact
via `assetNameFor(process.platform, process.arch)` (already exported from `update-command.ts`) →
`dist/release/<asset>`. **Scope: runtime-correctness only — sha256/checksums is NOT re-verified here**
(install.sh verifies that client-side).

<!-- Updated: Validation Session 1 - reuse assetNameFor to locate host binary; smoke stays runtime-only, no sha256 -->


## Related Code Files
- Create: `packages/cli/scripts/smoke-binary.mjs`, `packages/cli/scripts/smoke-binary.test.mjs`
- Modify: `.github/workflows/release.yml` (add "Smoke-test binary" step), `packages/cli/scripts/build-binaries.mjs` (expose/emit the host-target path if not already)

## Implementation Steps (TDD)
1. **Test first**: `smoke-binary.test.mjs` — feed a fake "binary" (a node shim printing good/bad output) and assert the checker passes on good output and throws with the right message on each bad case (wrong version, missing counts, leaked `/Users/` path).
2. Implement `smoke-binary.mjs` assertion logic against the test.
3. Add the release step invoking it on the host artifact; confirm it runs `pnpm` build + the real host binary locally once.
4. Verify a deliberately-broken binary (temporarily stub version) makes the script exit 1.

## Success Criteria
- [ ] `smoke-binary.test.mjs` green (good passes; each bad case fails with specific message)
- [ ] Running the script on the real host binary passes
- [ ] `release.yml` fails if the binary is broken (version/counts/leaked-path)
- [ ] No network, completes <10s

## Risk Assessment
- Runner can only execute host-target arch → smoke only covers one platform. Acceptable: the break class is platform-independent (embed/entry/version logic is shared). Note in the step comment.
