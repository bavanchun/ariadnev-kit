# vc kit v3a: the audit oversold the weakness

**Date**: 2026-07-20 12:00
**Component**: kit/skills (all 21), authoring spec, git references
**Status**: Resolved

## What happened

Cooked the v3a "deep coherence" plan — bring 10 satellite skills to a
cook-grade bar. The plan (from a subagent audit) framed them as "thin, missing
gates/contracts". Reading the actual files, most were already strong: `ask`,
`predict`, `research`, `journal`, `sequential-thinking` already had real
workflows and output contracts. The real work was narrower: add explicit
`## Quality gates` + `## Workflow position`, wire risk-lane/proof vocabulary
across the kit, and fix genuine drift.

## Root cause

A read-only audit subagent, primed to "find gaps", graded structure it didn't
fully read as absent. The gap between "audit says thin" and "file is fine" is
why the plan carried a few assumptions that didn't survive contact:
extract-problem-solving-to-references (file was already tight), create a
`_shared/risk-lane` file (the canonical rule already exists, globally injected),
git 10→4 (only 10→7 is honest — the rest are distinct concerns).

## What we tried / decided

Applied judgment over plan literalism: enhanced rather than churned good
content; skipped the three unnecessary sub-tasks with documented reasons in the
parity report's Deviations section. Found one real defect the audit didn't:
`git/references/workflow-pr-per-change.md` was an unreferenced orphan spec of
`prc` that *bypassed review* with `--admin` (YOLO) — contradicting the skill's
own stated scope. Deleted it.

## Lesson

When a plan is built from an audit, re-read the actual artifacts before
executing — grade the code, not the audit's summary of it. An enhancement plan
and a rescue plan look identical on paper but call for opposite amounts of
change. Two contradictory specs for the same operation (the git prc orphan) is
the exact documentation-rot the RDD article warns about; the `vc:docs`
anti-bloat gate added this round exists to catch it.

## Next steps

Plan v3b (anti-bloat + `vcskill validate` + hooks README + friction wiring) —
create after this lands. `vcskill validate` would have caught the orphan
reference automatically.
