---
title: "vc kit v3b: anti-bloat + infra — pm disposition, vcskill validate, hooks README, friction wiring"
description: "Apply the RDD anti-bloat lesson (pm disposition + live plans/ cleanup) and add the infra that would have caught v3a's defects automatically: vcskill validate (reference-integrity), hooks README, friction wiring."
status: completed
priority: P1
branch: "main"
tags: [cli, validate, anti-bloat, hooks, pm, tdd]
blockedBy: []
blocks: []
created: "2026-07-20T05:08:35.869Z"
createdBy: "ck:plan"
source: skill
---

# vc kit v3b: anti-bloat + infra

## Overview

Second half of the v3 work (brainstorm-260720-1128-vc-kit-v3-deep-quality-anti-bloat-report.md).
v3a made skills coherent; v3b makes the kit *self-guarding* and *self-pruning*:
- **`vcskill validate`** — lint the kit without installing; catch orphan/dangling
  references automatically (the exact class of bug that hid git's contradictory
  `workflow-pr-per-change.md` orphan, found by hand in v3a).
- **pm disposition + live cleanup** — the RDD lesson made operational: closing a
  plan distills durable decisions to `docs/` then deletes the plan (git is the
  archive). Applied live to the 4 completed plans in `plans/`.
- **hooks README + friction wiring** — remove the hooks black-box; make repeated
  friction land in the journal loop.

User decisions in force (brainstorm D1-D4): D3 = delete plans, git is archive
(distill durable to docs/ first). Parity-or-better vs `ck` CLI for `validate`.

## PARITY-OR-BETTER GATE (validate command)

`ck` has no `validate` (its lint runs only at install). vcskill's `validate` is a
net addition: a standalone, CI-able, exit-coded kit health check. Prove it
catches a real defect class ck's install-time lint doesn't: orphan/dangling
references. Record in `plans/reports/parity-260720-cli-validate-vs-ck-report.md`.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [validate: reference-integrity pure module (TDD)](./phase-01-validate-reference-integrity-pure-module-tdd.md) | ✅ Completed |
| 2 | [validate: CLI command + loadKit wiring + CI](./phase-02-validate-cli-command-loadkit-wiring-ci.md) | ✅ Completed |
| 3 | [pm disposition + plan evidence rule + friction wiring + hooks README](./phase-03-pm-disposition-plan-evidence-rule-friction-wiring-hooks-read.md) | ✅ Completed |
| 4 | [Live plans cleanup (confirm-gated) + changeset + sync-back](./phase-04-live-plans-cleanup-confirm-gated-changeset-sync-back.md) | ✅ Completed |

Order: 1→2 (validate code, TDD, riskiest-first by proof burden); 3 (markdown, kit
content); 4 (destructive cleanup last, confirm-gated). 3 and 4 depend on 1-2 only
for changeset/README grouping, not code.

## Acceptance Criteria (whole plan)

- [x] `vcskill validate` exists: loadKit lint + reference-integrity across skills; exit 0/1 (validate-command.ts + index.ts, live smoke exit 0)
- [x] Reference-integrity is pure, tested (reference-integrity.ts + 9 tests, no fs)
- [x] `validate` catches real orphans — caught 3 live on first run (obsidian ×2, predict); injected-orphan/dangling/lint tests in validate-command.test.ts
- [x] CI runs `vcskill validate` as a gate (.github/workflows/ci.yml, after Build)
- [x] `vc:pm` sync-back has Disposition-on-close (§6) + Friction routing (§7); evidence-cited rule already in sync-back §1
- [x] hooks/README.md documents all 6 hooks; each hook.cjs already had a header (verified)
- [x] Friction wiring: sync-back §7 routes repeat friction to vc:journal harness-delta
- [x] 4 completed plans + their reports deleted (confirm-gated); durable decision distilled to docs/decisions/0001; plans/ holds v3b + 3 older June plans (out of confirmed scope)
- [x] `pnpm test` green (232→ with new tests); parity report done; changeset minor; README 9-command table

## Dependencies

Predecessor: 260720-1128-vc-kit-v3a-deep-coherence-10-skills (completed). This
plan's phase 4 deletes that plan's dir as part of the cleanup demo.

## Red-team notes (inline --deep pass)

- **`validate` false-positives on intentional unlinked files** (e.g.
  `co-authors.json`, scripts, data). Mitigation: reference-integrity scans only
  `references/*.md`; a `references/*.md` that exists MUST be linked — deliberate
  strict invariant, not a heuristic.
- **Deleting plans loses un-distilled context.** Mitigation: phase 4 hard Stop
  Condition — list exact deletions, confirm via AskUserQuestion, distill first;
  git reverts anything. Never auto-delete.
- **CI gate blocks unrelated PRs on pre-existing drift.** Mitigation: run
  validate against the current kit first — must be clean before wiring the gate.
- **pm disposition over-deletes referenced reports.** Mitigation: disposition
  deletes only reports tied to the closed plan; durable content moves to docs/ first.

## Validation (inline --deep pass)

- Expected output: new `validate` subcommand + pure module + tests; edited
  pm/plan/hooks markdown; cleaned `plans/`; parity report; changeset.
- Acceptance: `vcskill validate` exit 0 on clean kit, exit 1 on injected orphan
  (both tested); CI green with the gate; `pnpm test` green.
- Out of scope: `validate --fix` (auto-repair), validating installed targets
  (that's `doctor`), schema-versioning the kit.
- Touchpoints stable: loadKit/skill-lint/agent-lint reused not modified (validate
  wraps them); index.ts registration follows the doctor pattern.
