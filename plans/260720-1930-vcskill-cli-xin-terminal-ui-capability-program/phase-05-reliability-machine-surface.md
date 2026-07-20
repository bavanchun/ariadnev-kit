---
phase: 5
title: Reliability + Machine Surface
status: completed
effort: S
---

# Phase 5: Reliability + Machine Surface

## Overview

Two cheap hardening bits: a machine-readable capability envelope on `contract --json`, and closing the CI gap where `.mjs`/`.cjs` tests never run. **The upgrade-transition test is DEFERRED** (red-team: architecturally impossible as written — see below) — revisit when there's a real install base.

## Requirements

- Functional: `contract --json` gains `protocol_version`, `capabilities[]`, `schema` range **while keeping the existing top-level `version`** (back-compat). CI runs the `node --test` script/hook suites (currently unexecuted in the merge gate).
- Non-functional: envelope serialization pure + tested; capabilities guarded against silent rot.

## Architecture

**Contract envelope — build in `runContract` (red-team: `matrixToJSON` is an identity fn, `provider-matrix.ts:65`; wrong seam).** Current output `{ version, providers }` (`contract-command.ts:19`). New shape: `{ protocol_version: "1", version, cli_version, kit_version, capabilities: [...], schema: {min,max}, providers }` — **keep `version`** (alias of `cli_version`) so existing consumers don't break. `capabilities` is a **curated constant** (e.g. `providers.matrix.v1`, `install.receipt.v1`, `doctor.audit.v1`, `eval.tier1.v1`) with a **guard test** asserting it stays in sync with the registered command set — there is no derivation source, so don't claim "derived."

**CI `.mjs`/`.cjs` gate (red-team High)**: `ci.yml` runs `pnpm run coverage` (vitest `.ts` only); `scripts/*.test.mjs` + `hooks/*.test.cjs` run only under `pnpm test`, which CI never calls — so `smoke-binary.test.mjs` etc. are unenforced. Add a CI step `node --test "packages/cli/scripts/**/*.test.mjs" "kit/hooks/**/*.test.cjs"` (or switch the CI gate to `pnpm test`).

**Upgrade-transition test — DEFERRED**: as specified it can't work (edge serves only `releases/latest`; `update` hardcodes `DOMAIN`, `update-command.ts:9`; CI step runs before publish → `isNewerVersion(prior,prior)=false`). The existing `smoke-binary.mjs` already catches a bricked binary. Documented as a future item, not built this round.

## Related Code Files

- Modify: `packages/cli/src/cli/contract-command.ts` (envelope + keep `version`), `contract-command.test.ts`
- Modify: `.github/workflows/ci.yml` (add `node --test` step for `.mjs`/`.cjs`)
- Modify: `README.md` (document envelope fields)

## Implementation Steps (TDD — tests first)

1. **Failing test**: `runContract({json:true})` parses to an object with `protocol_version`, `capabilities` (non-empty), `schema.min/max`, `providers`, **and the legacy `version` key still resolves**.
2. **Failing test**: a guard asserting `capabilities` matches the registered command surface (fails if a command is added without a capability entry, or vice-versa).
3. Implement the envelope in `runContract` until green.
4. Add the CI `node --test` step; verify `smoke-binary.test.mjs` now runs in CI.
5. Document envelope + the deferred transition test in README.

## Success Criteria

- [ ] `contract --json` carries `protocol_version`, `capabilities[]`, `schema`; **legacy `version` preserved** (asserted).
- [ ] `capabilities` guarded by a test against the command registry (can't silently rot).
- [ ] CI executes `.mjs`/`.cjs` tests (`smoke-binary.test.mjs` runs on PRs).
- [ ] Upgrade-transition test explicitly deferred + documented; `pnpm test` + CI green.

## Risk Assessment

- **Envelope back-compat break** [red-team]: keep `version`; test both old + new fields.
- **capabilities rot** [red-team]: curated constant + registry guard test (no false "derived" claim).
- **Deferred transition test**: accepted trade-off — `smoke-binary` covers the bricked-binary case; revisit with an install base.
