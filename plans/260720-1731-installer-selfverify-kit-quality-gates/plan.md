---
title: Installer self-verification + kit-quality gates
description: ''
status: completed
priority: P2
branch: main
tags: []
blockedBy: []
blocks: []
created: '2026-07-20T10:42:37.941Z'
createdBy: 'ck:plan'
source: skill
---

# Installer self-verification + kit-quality gates

## Overview

Six independent upgrades identified during a comparative review of vcskill,
repository-harness, and Archon (deltas: `plans/reports/scout-260720-1724-*`). One theme:
**the tool proves itself correct, and the kit's quality/truth is machine-gated.**
Explicitly NOT adopting harness governance/memory (SQLite, trace-scoring, context-selection)
nor Archon telemetry — off-identity for a kit installer.

Mode: `--tdd` (tests-first per phase; touches validate/doctor/release which have coverage).
Execution order = phase number (already ranked by value). Source design + locked decisions:
`plans/reports/brainstorm-260720-1731-installer-selfverify-kit-quality-gates-report.md`.

Global constraints (all phases): adapt engine stays pure + ≥90% cover; path constants
single-sourced in `src/adapt/paths.ts`; hooks fail-open; cross-platform (`os.homedir`/`path.join`);
files <200 LOC kebab-case; comments explain why, no plan labels in code.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Release smoke-test](./phase-01-release-smoke-test.md) | Completed |
| 2 | [Provider matrix auto-gen + drift gate + contract JSON](./phase-02-provider-matrix-auto-gen-drift-gate-contract-json.md) | Completed |
| 3 | [Skill-description collision scorer](./phase-03-skill-description-collision-scorer.md) | Completed |
| 4 | [Managed-hooks self-heal in doctor](./phase-04-managed-hooks-self-heal-in-doctor.md) | Completed |
| 5 | [Update-available nudge](./phase-05-update-available-nudge.md) | Completed |
| 6 | [stripCwdEnv owned-dir env scope](./phase-06-stripcwdenv-owned-dir-env-scope.md) | Completed |

## Dependencies

- Phase 3 (collision scorer) after Phase 2 (matrix) — both edit `validate-command.ts`; avoid contention.
- Phase 6 (stripCwdEnv) is **spike-gated**: implement only if the verify-spike proves a real cwd `.env` leak; otherwise close with a note.
- All other phases independent; each independently shippable.

## Acceptance (whole plan)

- CI fails on: a broken shipped binary, a hand-edited stale provider matrix, a near-duplicate skill description.
- `vcskill doctor --fix` restores a tampered hook binding idempotently.
- `vcskill contract --json` emits schema-stable JSON consumable by the edge.
- `pnpm test` stays green; no adapt-cover regression.

## Open questions (resolve during phases)

1. Does a Bun *compiled* binary auto-load cwd `.env` into `process.env`? (Phase 6 spike — still open, answered by the spike.)
2. ~~`contract --json` schema~~ → RESOLVED: include per-artifact target paths (see Validation Log).
3. ~~Nudge cache file location~~ → same cache root, separate `update-check.json` (see Validation Log).

## Validation Log

### Session 1 — 2026-07-20

**Verification (Full tier, 4 sampled claims): Verified 4 | Failed 0 | Unverified 0**
- P5 `fetchLatestVersion`/`isNewerVersion`/`assetNameFor`/`expectedSha` exported in `update-command.ts` — VERIFIED (reuse directly).
- P2 `resolver.ts::makeResolver(id)` exists — VERIFIED (build matrix per provider×artifact).
- P4 `install/hook-settings-merge.ts::mergeHookSettings` already shared (used by install-execute); `HookBinding[]` built in `install-plan.ts` — VERIFIED → **Phase 4 simplified, no extraction**.
- P1 build outputs `dist/release/<asset>`; locate host binary via `assetNameFor` — VERIFIED.

**Decisions (4 questions):**
1. `contract --json` schema = `{version, providers:{id:{artifact:{verified, path|null}}}}` — include per-cell target paths.
2. Matrix drift fails ONLY under `vcskill validate --check`; plain `validate` does not touch the matrix.
3. Phase 1 smoke asserts runtime-correctness only (version/counts/no-leaked-path); does NOT re-verify sha256 (install.sh does that client-side).
4. Phase 6: if the spike proves NO cwd `.env` leak → close the phase as no-op with a note; do not add defensive code (YAGNI).

**Propagated to:** phase-01 (assetNameFor + no-sha256), phase-04 (reuse mergeHookSettings, drop extraction). phase-02/phase-06 already matched decisions.

### Whole-Plan Consistency Sweep
Re-read plan.md + all 6 phases. No stale terms, no contradictions. Phase 4 extraction language removed; Phase 1 sha256 scope clarified; contract schema + drift-gate scope consistent across plan.md and phase-02. **0 unresolved contradictions.**
