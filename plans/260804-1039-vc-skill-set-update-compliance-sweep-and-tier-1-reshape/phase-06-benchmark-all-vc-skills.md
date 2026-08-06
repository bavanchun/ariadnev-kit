---
phase: 6
title: "Benchmark all vc skills"
status: completed
priority: P2
effort: "0.5-1d"
dependencies: [5]
---

# Phase 6: Benchmark all vc skills

## Overview

Run an individual, auditable benchmark for every skill in the delivered kit.
This is an honest scorecard over evidence the repository can produce today,
not a substitute for the deferred golden-task behavioral harness.

## Requirements

- Functional: run `vcskill eval --skill <name>` separately for all 26 skills
  and record each exit result. Collect deterministic structure, provenance, and
  claim-coverage status from the delivered tree.
- Non-functional: never silently skip a skill or infer a tier-3 score. When
  `VCSKILL_EVAL_CMD` is unavailable, record tier 3 as `not run` with the reason.
  Keep raw benchmark evidence reproducible from commands named in the report.

## Benchmark Contract

Each skill gets one row with:

- skill name;
- tier-1 static eval pass/fail and command exit code;
- tier-3 clarity/specificity/completeness/overall when configured, otherwise
  explicit `not run`;
- SKILL.md LOC, reference count, and reference LOC;
- `upstream_relation`, pinned upstream version, and digest presence;
- strict claim-coverage result for the eight claim-tracked distillations, or
  `not applicable` for the other skills.

LOC and reference mass are descriptive, not quality scores. Tier 1 proves the
static contracts only. Tier 3, when available, judges prose rather than task
outcomes. The report must state both limits before ranking or recommendations.

## Related Files

- Read: `packages/cli/src/cli/eval-command.ts` — existing per-skill evaluator
- Read: `packages/cli/src/cli/coverage-command.ts` — strict claim gate from Phase 4
- Read: `kit/distill-decisions.json` — provenance and coverage applicability
- Create: `plans/reports/benchmark-260806-1531-vc-skills.md` — one row per skill plus commands and limits

## Implementation Steps

1. Build the CLI from the final Phase-5 tree and list the canonical 26 skill names.
2. Detect whether `VCSKILL_EVAL_CMD` is configured without printing its value.
3. Run `vcskill eval --skill <name>` once per skill; capture exit status and tier output.
4. Run strict coverage for each of the eight claim-tracked skills.
5. Measure structural and provenance fields directly from the canonical kit.
6. Write the benchmark report with all 26 rows, aggregate counts, outliers,
   command/environment notes, and the proof limitations above.
7. Fix any deterministic tier-1 or coverage failure through the normal
   scout→debug→fix loop, then rerun the affected skill and the full suite.

## Success Criteria

- [x] Exactly 26 unique canonical skills appear in the report; no missing or duplicate row
- [x] All 26 individual tier-1 eval runs exit zero
- [x] Tier-3 status is recorded per skill as a real score or explicit `not run`; no fabricated score
- [x] All eight claim-tracked skills pass strict standalone coverage
- [x] Every row includes structural and provenance fields; non-applicable coverage is explicit
- [x] Report names reproducible commands and distinguishes static, prose-judge, and behavioral proof
- [x] Any failure is diagnosed, fixed, and rerun before completion

## Completion Record — 2026-08-06

The [benchmark report](../reports/benchmark-260806-1531-vc-skills.md) contains
exactly one row for each canonical skill. All 26 tier-1 processes and all 8
strict coverage processes exit zero. Tier 3 is explicitly `not run` in every
row because `VCSKILL_EVAL_CMD` was unavailable; no behavioral claim is made.

After final review fixed unknown skill filters in `27b2b8d`, the full 26-skill
eval set was rerun against that commit and remained 26/26 green.

## Risk Assessment

- **A green static scorecard could be oversold.** Mitigation: report proof tiers
  and limitations before results; do not claim behavioral parity.
- **Optional tier 3 may be unavailable or costed.** Mitigation: never require or
  auto-configure an external judge; record `not run` honestly.
- **Per-skill runs could accidentally benchmark embedded stale content.**
  Mitigation: regenerate the embedded kit and build from the final tree first.
