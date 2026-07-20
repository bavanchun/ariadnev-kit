---
phase: 4
title: "Live plans cleanup (confirm-gated) + changeset + sync-back"
status: pending
priority: P2
effort: "2h"
dependencies: [2, 3]
---

# Phase 4: Live plans cleanup + close-out

## Overview

Dogfood the phase-3 disposition rule on the real repo: distill anything durable
from the 4 completed plans, then delete them so `plans/` holds only active work.
Then close v3b: parity report, changeset, README, sync-back.

## Requirements

- **Cleanup (confirm-gated, destructive)** — targets: the 4 completed plan dirs
  (`260720-0014-...v1`, `260720-0116-...v2-agents`, `260720-0116-...cli-v2`,
  `260720-1128-...v3a`) + their `plans/reports/*` files. Before deleting:
  1. Distill any still-durable decision not already in `docs/` (the cook-grade
     standard is already in the authoring spec — verify nothing else is orphaned
     knowledge) via `vc:docs` decision mode.
  2. Present the exact delete list (dirs + report files) via `AskUserQuestion`;
     proceed only on explicit confirmation.
  3. `git rm` them; git history is the archive.
- Keep this plan's own dir until it is itself completed (delete in a later cycle,
  not now).
- **Close-out** — parity report (`parity-260720-cli-validate-vs-ck-report.md`),
  changeset minor, README commands table +`validate` (→ 9 commands), whole-plan
  sync-back with evidence-cited checkboxes.

## Related Code Files

- Delete (confirm-gated): 4 completed `plans/<dir>/` + associated `plans/reports/*`
- Create: `plans/reports/parity-260720-cli-validate-vs-ck-report.md`,
  `.changeset/vc-kit-v3b-anti-bloat-infra.md`
- Modify: `README.md` (commands table); `docs/decisions/NNNN-*.md` only if
  distillation surfaces a durable decision not yet recorded

## Implementation Steps

1. Grep the 4 completed plans + their reports for durable decisions not in
   `docs/`; distill the few that matter (likely none — spec already holds them).
2. AskUserQuestion with the exact delete manifest; on confirm, `git rm`.
3. Write parity report (validate vs ck: net-new, orphan-catching proof).
4. README commands row for `validate`; changeset.
5. `pnpm test` + `vcskill validate` live (must be clean); sync-back plan.

## Success Criteria

- [ ] Durable decisions distilled to docs/ (or confirmed none) before any delete
- [ ] Delete manifest confirmed by user, then 4 completed plans + their reports removed
- [ ] `plans/` contains only this plan (active) after cleanup
- [ ] Parity report + changeset + README (9-command table) done
- [ ] `pnpm test` green; `vcskill validate` exit 0; plan sync-back with evidence

## Risk Assessment

- Irreversible-looking deletion → it's `git rm`, fully recoverable; plus the
  confirm gate + prior distillation. Low real risk, high perceived — hence the gate.

## Stop Conditions

- **Hard gate**: never delete a plan dir or report without the user confirming
  the exact manifest first. If the user declines any item, keep it and note why.
- If distillation finds substantial un-recorded durable knowledge, STOP the
  delete for that plan until it's captured in docs/.
