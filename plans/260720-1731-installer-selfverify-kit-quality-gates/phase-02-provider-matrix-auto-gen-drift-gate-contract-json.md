---
phase: 2
title: Provider matrix auto-gen + drift gate + contract JSON
status: completed
effort: ''
---

# Phase 2: Provider matrix auto-gen + drift gate + contract JSON

## Overview

Generate the README provider×artifact matrix from the same code the engine reads
(`resolver.ts` + `spec-verified.ts`), gate drift in `validate --check`, and expose the gate table
as `vcskill contract --json`. Kills the hand-maintained-table drift and gives the edge a
machine-readable capability surface.

## Requirements

- Functional:
  - `generate-provider-matrix.mjs` emits the exact README table by iterating every provider×artifact,
    calling the resolver for the target path, marking `skip (unverified)` where `spec-verified` is false.
  - Deterministic output (sorted provider/artifact order) so the gate never flaps.
  - README has BEGIN/END markers around the generated block; script rewrites only between markers.
  - `vcskill validate --check` fails if the committed block ≠ freshly generated block (prints a diff hint).
  - `vcskill contract --json` prints `{ version, providers: { <id>: { <artifact>: { verified, path|null } } } }` — schema-versioned.
- Non-functional: generator + contract are pure (no network); JSON schema minimal + stable.

## Architecture

Single canonical serializer `buildProviderMatrix()` (pure) consumed by BOTH the doc generator and
`contract --json`, so they never diverge (DRY). `validate --check` reads README, extracts the marked
block, compares to `buildProviderMatrix().toMarkdown()`. New `contract-command.ts` wraps
`buildProviderMatrix().toJSON()` + `packageVersion()`.

## Related Code Files
- Create: `packages/cli/src/providers/provider-matrix.ts` (+ `.test.ts`), `packages/cli/scripts/generate-provider-matrix.mjs`, `packages/cli/src/cli/contract-command.ts` (+ `.test.ts`)
- Modify: `packages/cli/src/cli/validate-command.ts` (add `check` opt + matrix-drift finding), `packages/cli/src/index.ts` (wire `contract` command + `validate --check` flag), `README.md` (add block markers), `packages/cli/scripts/build-binaries.mjs`? (no)
- Read-only source: `src/providers/resolver.ts`, `src/providers/spec-verified.ts`

## Implementation Steps (TDD)
1. **Test first**: `provider-matrix.test.ts` — golden test: `buildProviderMatrix()` over the real providers yields a stable markdown snapshot + JSON snapshot; changing a `spec-verified` bool changes exactly one cell.
2. Implement `provider-matrix.ts` (`buildProviderMatrix`, `.toMarkdown()`, `.toJSON()`) using resolver + spec-verified.
3. **Test**: `validate --check` returns a `matrix-drift` finding when README block mutated; clean when in sync.
4. Add `--check` path to `runValidate` + a `matrix` kind to `ValidateFinding`.
5. Write `generate-provider-matrix.mjs`; run it to populate README block markers.
6. **Test**: `contract-command.test.ts` — JSON shape stable, version present.
7. Implement `contract-command.ts` + wire in `index.ts`.

## Success Criteria
- [ ] `provider-matrix.test.ts` golden snapshots green; single-bool-change → single-cell diff
- [ ] Hand-editing README matrix → `vcskill validate --check` exits non-zero with `matrix-drift`
- [ ] `generate-provider-matrix.mjs` regenerates the block idempotently
- [ ] `vcskill contract --json` emits schema-stable JSON with version + verified paths
- [ ] Existing `validate` (no `--check`) behavior unchanged

## Risk Assessment
- Non-deterministic ordering → flapping gate. Mitigate: sort keys, golden test locks order.
- README markers accidentally stripped by a human edit → generator should error if markers missing (not silently append).
