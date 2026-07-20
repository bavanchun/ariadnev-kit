---
title: vcskill CLI xịn — terminal UI + capability program
description: >-
  7-phase program: vc alias + bold branded terminal UI, scored doctor, security
  posture, vc eval, reliability + machine surface, JSONL history/query,
  telemetry. TDD, build in order (MVP-trimmed post red-team).
status: completed
priority: P1
branch: main
tags:
  - cli
  - terminal-ui
  - dx
  - tdd
blockedBy: []
blocks: []
created: '2026-07-20T12:39:38.226Z'
createdBy: 'ck:plan'
source: skill
---

# vcskill CLI xịn — terminal UI + capability program

## Overview

Make the vcskill CLI look and prove like a serious tool — on par with or above 3 competitor kits (Archon, claudekit-engineer, repository-harness). Foundation is a **bold, branded terminal UI** cohesive with the `vcskill.vchun.dev` landing page (coral `#ff6b45`, `>_` wordmark, `✓/skip/◆` glyphs, matrix grid) plus a **`vc` short alias**. Then six capability upgrades layered in strict build order. TDD throughout — output layer + doctor are existing behavior with pure-formatter test coverage to preserve.

Source design: [`../reports/brainstorm-260720-1930-cli-xin-terminal-ui-capability-program-report.md`](../reports/brainstorm-260720-1930-cli-xin-terminal-ui-capability-program-report.md)
Follows (completed): `plans/260720-1731-installer-selfverify-kit-quality-gates` (shipped 0.7.0).

## Core invariants (hold across all phases)

- **Pure formatters stay pure**: the `ui/` module takes an explicit `color` flag (no global) so existing formatter tests stay deterministic (`color:false` → plain). All command output goes through one `emit()` boundary (Phase 1) that Phase 3 sanitizes.
- **Degrade cleanly**: branded on TTY; plain on pipe / `CI` / `NO_COLOR` — **and plain regardless of `FORCE_COLOR` when non-TTY** (protects the release smoke-test regex). Cross-platform incl Windows.
- **Coverage gates are real**: every phase that claims ≥90% MUST extend `vitest.config.ts` `coverage.include` for its new dirs in the same commit (today it's `adapt/**` only).
- **CI runs every test tier**: `.mjs`/`.cjs` suites must run in CI (Phase 5 fixes the current gap), else new script/hook tests are unenforced.
- **No Bun-only imports in `src/`**: history is JSONL, not `bun:sqlite` (would break Node vitest).
- **No secrets ever printed / persisted** (credential-sanitizer at the `emit` boundary; telemetry stateless + categorical; history enum-allowlist scrubbed).
- **Exit-code contract preserved**: `doctor` exit stays keyed to fail-count; the health score is informational-only.
- Path constants stay single-sourced (`src/adapt/paths.ts`); provider gating stays in `spec-verified.ts`.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Identity + Terminal UI](./phase-01-identity-terminal-ui.md) | Completed |
| 2 | [Doctor Scored Audit](./phase-02-doctor-scored-audit.md) | Completed |
| 3 | [Security Posture](./phase-03-security-posture.md) | Completed |
| 4 | [VC Eval LLM Judge](./phase-04-vc-eval-llm-judge.md) | Completed |
| 5 | [Reliability + Machine Surface](./phase-05-reliability-machine-surface.md) | Completed |
| 6 | [History + Query (JSONL)](./phase-06-sqlite-memory-query.md) | Completed |
| 7 | [Privacy-First Telemetry](./phase-07-privacy-first-telemetry.md) | Completed |

## Dependencies

- **1 → all**: the `ui/` module is the foundation phases 2, 4, 6, 7 render through. Build first.
- 2 depends on 1. 3, 4, 5 independent of each other (all depend on 1 for output styling).
- 6 (JSONL history) and 7 (telemetry) sequenced last — MVP-trimmed; **abortable** after 1–5 if earlier phases suffice.
- Each phase ships as its own commit(s); a release (0.8.0+) can cut after Phase 1 or any later phase.

## Acceptance (program-level)

- `vc` works as alias on macOS/Linux/Windows; README + landing updated.
- Terminal output branded on TTY, plain on pipe/CI/`NO_COLOR`, recognizably matches the website.
- `vc doctor` shows health score + per-finding remediation command; tri-state (no red for unconfigured).
- `vc eval` scores skills; $0 tier-1 in CI, opt-in tier-3.
- `contract --json` carries `protocol_version` + `capabilities[]`; upgrade-transition test green.
- `vc query` returns install/doctor history; telemetry categorical + opt-out honored.

## Open questions (mostly resolved by red-team)

- **P1**: `vc` PATH collision → RESOLVED: install symlink guards against clobbering a pre-existing different `vc`; `VCSKILL_ALIAS=off` escape.
- **P6**: SQLite/`bun:sqlite` risk → RESOLVED: dropped SQLite entirely; JSONL history, global `~/.vcskill/history.jsonl`.
- **P7**: telemetry ingest → RESOLVED: separate rate-limited edge route (not the token Worker); stateless (no id); CLI URL off until route ships.
- **P4**: default `VC_EVAL_CMD` (`claude`? `ccs glm`?) — still open; is paid tier-3 ever wanted in CI or authors-only? (authors-only assumed.)
- **P5**: upgrade-transition test DEFERRED (impossible as written); revisit with an install base.

## Red Team Review

### Session — 2026-07-20
**Reviewers:** 4 (Security Adversary, Failure Mode Analyst, Assumption Destroyer, Scope & Complexity Critic)
**Findings:** 31 raw → ~18 deduped, all evidence-backed (0 rejected on evidence filter).
**Severity:** 4 Critical, 9 High, 5 Medium.
**Disposition:** all correctness/feasibility findings Accepted + applied; scope findings put to the user → **MVP-trim, keep all 7** + **defer P5 transition test**.

| # | Finding | Sev | Disposition | Applied To |
|---|---------|-----|-------------|------------|
| 1 | doctor tri-state rename breaks `deriveStatus`→exit 0 masks broken kit; type is `error\|warning`, no `pass` rows today | Critical | Accept | Completed |
| 2 | `vc` via npm `bin` ships nothing (private pkg + standalone binary); symlink is the mechanism; `ln -sf` clobbers user `vc` | Critical | Accept | Completed |
| 3 | upgrade-transition test impossible (edge=latest only, `update` hardcodes DOMAIN, CI before publish) | Critical | Accept (defer) | Completed |
| 4 | sanitizer only on top-level catch; `console.log(summary)` error paths bypass it | High | Accept | Completed |
| 5 | empty/short env token shreds all output; targets tokens CLI never handles, misses real vectors | High | Accept | Completed |
| 6 | ≥90% coverage gates unenforceable (`coverage.include` = `adapt/**` only) | High | Accept | Completed |
| 7 | `.mjs`/`.cjs` tests never run in CI (`ci.yml` runs coverage, not `pnpm test`) | High | Accept | Completed |
| 8 | `bun:sqlite` poisons Node test graph; interface alone insufficient | High | Accept (drop SQLite→JSONL) | Phase 6 |
| 9 | telemetry fires before consent notice; `silentFetch` no timeout→hang | High | Accept | Phase 7 |
| 10 | `payload_json` unscrubbed + `.gitignore` on wrong repo | High | Accept (JSONL enum-scrub, global path) | Phase 6 |
| 11 | contract envelope drops top-level `version`; `matrixToJSON` is identity (wrong seam); capabilities not derivable | Med | Accept | Phase 5 |
| 12 | `runValidate` whole-kit, no per-skill filter | Med | Accept (add `skillFilter`) | Phase 4 |
| 13 | commander help + `@clack` prompts aren't pure formatters | Med | Accept | Phase 1 |
| 14 | stable telemetry-id = pseudonymous data; "no PII" false | Med | Accept (stateless, no id) | Phase 7 |
| 15 | `/t` ingest on token-bearing Worker, unauth/no-rate-limit; CLI may 404 | Med | Accept | Phase 7 |
| 16 | FORCE_COLOR beats CI→ANSI leaks into `validate`→breaks smoke regex | Med | Accept | Phase 1 |
| 17 | best-effort recording swallows corruption silently | Med | Accept (degraded marker) | Phase 6 |
| S1–S7 | Scope/YAGNI: over-built UI/eval/SQLite/telemetry for ~1-user kit | High/Med | Accept (MVP-trim, keep all 7) | Phases 1,4,6,7 |

### Whole-Plan Consistency Sweep
- Phase 6 retitled SQLite→**History + Query (JSONL)**; table + invariants updated; all `state.db`/`bun:sqlite` references removed from the surviving design (kept only as "why we dropped it" in risk notes).
- Sanitizer wiring unified on the Phase-1 `emit()` boundary; Phases 1 & 3 cross-reference it.
- `coverage.include` extension made a per-phase step in every phase claiming ≥90%.
- Exit-code contract statement reconciled across Phase 2 + invariants (score is informational).
- No unresolved contradictions.
