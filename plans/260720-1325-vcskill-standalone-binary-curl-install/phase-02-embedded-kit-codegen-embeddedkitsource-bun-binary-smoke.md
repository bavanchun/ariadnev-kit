---
phase: 2
title: "Embedded kit codegen + EmbeddedKitSource + bun binary smoke"
status: completed
priority: P1
effort: "5h"
dependencies: [1]
---

# Phase 2: Embedded kit + Bun binary (top-risk de-risk)

## Overview

Generate an embedded copy of the kit, add `EmbeddedKitSource`, auto-select it in
binary mode, then build ONE Bun binary and smoke the full command surface —
especially the interactive install wizard. This phase proves the whole approach
before any release-pipeline investment.

## Requirements

- `scripts/generate-embedded-kit.ts`: walk `kit/`, emit
  `packages/cli/src/kit/kit-embedded.generated.ts` exporting
  `EMBEDDED_KIT: Record<string, string>` (path relative to kit root → file text)
  for all 90 files. Deterministic ordering (sorted) so diffs are stable.
- `EmbeddedKitSource` implements `KitSource` over `EMBEDDED_KIT` (virtual root,
  `listDir` derived from key prefixes, `readText`/`exists` from the map).
- Kit-source selection: a `resolveKitSource()` factory — if running as a compiled
  binary (`process.isBun` and the embedded map is populated) → `EmbeddedKitSource`;
  else `FsKitSource(resolveKitRoot(...))`. Wire callers (load-kit default,
  validate, install-execute) to `resolveKitSource()`.
- `bun --compile` build script producing a local binary for the host target.
- Drift guard: a test (or `validate` extension) asserts the generated map matches
  the live `kit/` (regenerate-in-temp + deep-equal) so stale embeds fail CI.

## Architecture

The generated map is the single embedded artifact. `EmbeddedKitSource` treats map
keys as a virtual filesystem. In a Bun binary, `import.meta.url`/fs point into the
binary's internal fs, so fs-based `resolveKitRoot` is unusable — `resolveKitSource`
detects binary mode and returns the embedded source instead.

## Related Code Files

- Create: `packages/cli/scripts/generate-embedded-kit.ts`,
  `packages/cli/src/kit/kit-embedded.generated.ts` (generated; git-ignored or
  committed — decide: commit for reproducible builds),
  `packages/cli/src/kit/embedded-kit-source.ts` + test,
  `packages/cli/src/kit/resolve-kit-source.ts`
- Modify: `load-kit.ts`, `validate-command.ts`, `install-execute.ts` (default to `resolveKitSource()`)
- Add script: `bun build --compile --target=bun-<host> src/index.ts --outfile dist/vcskill`

## Implementation Steps

1. **TDD:** `embedded-kit-source.test.ts` — build a small in-memory map, assert
   list/read/exists parity with `FsKitSource` over the same fixture — red, then green.
2. Write the generator; generate the map; add the drift-guard test.
3. `EmbeddedKitSource` + `resolveKitSource()`; wire callers.
4. `pnpm test` green (FsKitSource path unchanged; embedded path covered).
5. **Build + SMOKE the binary** (host target): run `vcskill list`, `validate`,
   `install --provider claude-code --dry-run`, real `install` into a temp dir,
   `doctor`, `uninstall`, AND the **interactive** `install` wizard. Confirm the
   embedded kit lands correctly (73 files) and behavior matches the npm build.

## Success Criteria

- [ ] Generator emits a deterministic map of all 90 kit files; drift-guard test fails on staleness
- [ ] `EmbeddedKitSource` parity-tested against `FsKitSource`
- [ ] `resolveKitSource()` selects embedded in binary mode, fs otherwise; callers wired
- [ ] Local Bun binary runs list/validate/install/doctor/uninstall identically to npm build
- [ ] Interactive wizard verified under the binary (or fallback decided per Stop Condition)
- [ ] Full `pnpm test` green

## Risk Assessment

- **@clack/prompts / commander under `bun --compile`** — the make-or-break risk.
  Smoke immediately (step 5). If interactive breaks: binary defaults to
  non-interactive (`--yes`-style) with a clear message; keep interactive on dev/npm.
- Generated file size (~600-800K of string literals) — acceptable for compile.

## Stop Conditions

- Interactive wizard unrunnable in the binary → STOP, surface options to user
  (non-interactive-default vs invest), per the whole-plan Stop Condition. Do not
  start Phase 3 until the binary is proven on the host target.
