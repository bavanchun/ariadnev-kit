# Sync-Back Rules

Mechanical rules for reconciling plan files with reality. Apply them in this
order; each layer feeds the next.

## 1. Phase files (`phase-NN-*.md`)

For each phase, derive status from its Success Criteria checkboxes:

| Criteria state | Frontmatter `status` |
|---|---|
| None ticked, no work found in repo | `pending` |
| Some ticked, or work exists but criteria incomplete | `in-progress` |
| All ticked (each with evidence) | `completed` |

- Tick a criterion only when you can name the evidence (test output, file
  path, commit hash). Add the evidence inline when it is not obvious:
  `- [x] installer skips unverified providers (install.test.ts)`.
- Un-tick criteria that no longer hold (regressions, reverts) and note why.

## 2. plan.md phase table

Mirror each phase file's frontmatter into the table row. Allowed cell values:
`Pending`, `In Progress`, `✅ Completed`, plus an optional short parenthetical
(e.g. `✅ Completed (smoke deferred)`). The table never disagrees with the
phase files — the phase file is the source.

## 3. Whole-plan acceptance criteria

Evaluate each checkbox in plan.md against the repo, independent of phase
status — phases can all be "done" while an acceptance criterion still fails.
Same evidence rule applies.

## 4. Plan frontmatter status

| Condition | `status` |
|---|---|
| No phase started | `pending` |
| Any phase in-progress/completed, not all acceptance met | `in-progress` |
| All phases completed AND all acceptance criteria ticked | `completed` |
| User abandoned the effort | `cancelled` (add one line saying why) |

## 5. Consistency sweep

Before finishing, grep the plan dir for stale claims: old counts, renamed
files, phases that changed scope. Fix inline. A plan that contradicts itself
sends the next session down the wrong path.
