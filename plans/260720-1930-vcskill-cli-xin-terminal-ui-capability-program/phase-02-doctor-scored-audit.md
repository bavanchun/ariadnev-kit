---
phase: 2
title: Doctor Scored Audit
status: completed
effort: M
---

# Phase 2: Doctor Scored Audit

## Overview

Upgrade `doctor` from overall-status pass/fail into a scored audit: per-check tri-state (`skip|pass|fail`), a weighted health score (0–100), and a per-finding remediation command. Renders through the Phase-1 UI (health bar + colored glyph rows).

## Requirements

- Functional: each check reports `skip|pass|fail`; unconfigured/optional providers `skip` (never `fail`, no red nag). Overall health score computed from weighted findings; each finding carries a remediation command. `--fix` behavior preserved.
- Non-functional: pure scorer ≥90% covered; resilient (one thrown check ≠ abort the whole run); existing doctor exit-code contract (0/1/2) preserved.

## Architecture

**FACT CORRECTION (red-team)**: `ProviderFinding` today uses `FindingLevel = "error" | "warning"` (`diagnose.ts:6`) — NOT `warn|error` — has **no `remedy` field**, and `diagnose()` emits findings **only for problems** (no `pass` rows exist). So tri-state is a *structural change* (new per-check emission), not a relabel. `ValidateFinding` (`validate-command.ts:19`) is a different type with `warn|error` — do not conflate.

`src/doctor/audit-score.ts` (pure): `scoreAudit(findings) → { score:number, weights }`. Entropy-style weighted sum capped 0–100: missing-backup ×8, version-drift ×5, drifted-hook-binding ×10, unverified-now-reachable-cell ×5, orphaned-receipt-entry ×3, stale-vs-kit ×3. **The score is informational only — it does NOT affect exit code.**

Extend `ProviderFinding` with `level: "pass" | "skip" | "warning" | "fail"` (rename `error`→`fail`) and `remedy?: string` (e.g. `vc update`, `vc doctor --fix`). Emit `pass`/`skip` rows per check (`skip` = unconfigured/optional provider). `kitLintFinding` (`doctor-command.ts:71`) moves `error`→`fail`.

**EXIT-CODE CONTRACT (red-team Critical)**: `deriveStatus` currently keys on `level === "error"` (`diagnose.ts:104`). After the rename it MUST key on `level === "fail"` **in the same commit**, else a broken kit returns exit 0. Lock the current 0/1/2 mapping with a regression test BEFORE the rename; add a test that a kit-load failure still yields exit ≥1.

`renderDoctorSummary` gains the score bar + `↳ run <remedy>` lines via `ui/style` (`bar`, `symbols`). Extend `vitest.config.ts` `coverage.include` += `src/doctor/audit-score.ts` this commit.

Resilience: wrap each check so a thrown check becomes its own `fail` line rather than aborting.

## Related Code Files

- Create: `packages/cli/src/doctor/audit-score.ts` + `audit-score.test.ts`
- Modify: `packages/cli/src/doctor/diagnose.ts` (tri-state + `skip` for unconfigured, `remedy` on findings), `diagnose.test.ts`
- Modify: `packages/cli/src/cli/doctor-command.ts` (render score bar + remedy lines via `ui/`), `doctor-command.test.ts`, `doctor-fix.test.ts` (keep green)

## Implementation Steps (TDD — tests first)

1. **Write failing regression test FIRST**: lock current exit-code 0/1/2 for existing finding sets (kit-load fail → exit ≥1). This must stay green through the refactor.
2. **Write failing tests** for `scoreAudit`: known finding sets → expected score (100 clean, 0 floor, monotone in severity).
3. Implement `audit-score.ts` until green; extend `coverage.include`.
4. **Write failing tests** for `diagnose` tri-state: unconfigured provider → `skip`; drifted binding → `fail` + remedy `vc doctor --fix`; version drift → `warning`/`fail` + remedy `vc update`; passing check → `pass` row.
5. Add `level: pass|skip|warning|fail` + `remedy` to `ProviderFinding`; move `kitLintFinding` error→fail; **update `deriveStatus` to key on `fail` in the same commit**. Regression test (step 1) must still pass.
6. **Write failing test** for `renderDoctorSummary(color:false)`: contains `health` score, `↳ run <remedy>` per actionable finding, `·` for skips. Implement render via `ui/style`.
7. Verify `doctor-fix` tests still pass; manual `vc doctor` (branded) + `NO_COLOR=1 vc doctor` (plain).

## Success Criteria

- [ ] `ProviderFinding.level` is `pass|skip|warning|fail`; `pass`/`skip` rows emitted; unconfigured providers `skip`, never red.
- [ ] Health score 0–100 shown as a bar, **informational only (does not change exit code)**; deterministic + tested; `audit-score.ts` in `coverage.include`.
- [ ] Every actionable finding prints an exact remedy command.
- [ ] Exit-code contract (0/1/2) unchanged — `deriveStatus` keys on `fail`; regression test proves a kit-load failure still exits ≥1; a thrown check degrades to one fail line, not a crash.
- [ ] `pnpm test` green incl existing doctor/fix tests.

## Risk Assessment

- **Exit-code regression masking a broken kit** [red-team Critical]: `deriveStatus` must switch `error`→`fail` in the same commit as the level rename; regression test locks 0/1/2 first.
- **Finding-type confusion** [red-team]: `ProviderFinding` (doctor) ≠ `ValidateFinding` (validate); only the former changes here.
- **Score gaming/instability**: score is informational + exit-neutral, lowering the stakes; weights in one table, monotonicity tested, rationale documented in code.
