---
phase: 1
title: "KitSource abstraction + FsKitSource (behavior-preserving refactor)"
status: pending
priority: P1
effort: "4h"
dependencies: []
---

# Phase 1: KitSource abstraction + FsKitSource

## Overview

Route every kit *read* through a `KitSource` interface so the loader/installer/
validator no longer call `fs` on the kit directly. Ship one impl (`FsKitSource`)
that preserves today's behavior exactly. Pure refactor — no feature change; the
full existing suite must stay green. This is the seam that lets Phase 2 swap in
an embedded source for the binary.

## Requirements

- Functional: new `KitSource` interface — `root: string`, `exists(rel)`,
  `listDir(rel)`, `readText(rel)`. `FsKitSource(root)` wraps `existsSync`/
  `readdirSync`/`readFileSync` with the current semantics (e.g. `listDir`
  returns names, `.md`-filtering stays at call sites as today).
- The 3 kit-reading modules take a `KitSource` (injected), defaulting to an
  `FsKitSource` resolved via the existing `resolveKitRoot`:
  - `kit/load-kit.ts` (`readArtifact`, `readReferenceFiles`, `loadSkills`,
    `loadFlat`, `loadHooks`)
  - `cli/validate-command.ts` (the reference-integrity dir walk)
  - `install/install-execute.ts` (reads kit artifact files to copy to targets —
    reads via KitSource, target *writes* stay real fs)
- Non-functional: no behavior change; public function signatures may gain an
  optional `KitSource` param with an fs default (back-compatible).

## Architecture

`KitSource` is a read-only façade over the kit tree, rooted at a virtual or real
path. `FsKitSource` is the identity implementation. All existing callers keep
working because the default wiring constructs an `FsKitSource` from
`resolveKitRoot(...)` exactly where they resolve the root today.

## Related Code Files

- Create: `packages/cli/src/kit/kit-source.ts` (interface + `FsKitSource`) + test
- Modify: `packages/cli/src/kit/load-kit.ts`, `packages/cli/src/cli/validate-command.ts`, `packages/cli/src/install/install-execute.ts`
- Read first: those 3 files + `kit/kit-types.ts` to map every fs touchpoint

## Implementation Steps

1. **Lock behavior (TDD):** confirm the existing kit/install/validate suites are
   green pre-refactor; add a focused `FsKitSource` test (list/read/exists on a
   temp kit) as the new seam's spec — red first (no module), then green.
2. Implement `kit-source.ts`.
3. Refactor the 3 modules to read through an injected `KitSource` (default
   `FsKitSource`). Change reads only; keep target writes on real fs.
4. Run the FULL suite — every prior test must pass unchanged.

## Success Criteria

- [ ] `KitSource` + `FsKitSource` exist, unit-tested (list/read/exists)
- [ ] load-kit / validate / install-execute read the kit only through `KitSource`
- [ ] Full existing suite (232+) green — zero behavior change
- [ ] No target-write path changed (installs still write real files)

## Risk Assessment

- Missing an fs touchpoint → grep all `readFileSync|readdirSync|existsSync` under
  the 3 files + kit/, convert each; the full suite catches regressions.

## Stop Conditions

- If any existing test needs its *expectations* changed to pass, STOP — that means
  the refactor altered behavior; fix the refactor, don't edit the test.
