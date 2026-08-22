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
- Prefer labeling evidence by proof layer when it clarifies coverage —
  `unit`/`integration`/`e2e`/`platform`. A criterion whose risk warrants a proof
  layer and carries none is `in-progress`, not `completed`, even if the code is
  written.
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

## 6. Disposition on close

When a plan reaches `completed` (all phases done, all acceptance met), do not
leave it to accumulate. A pile of finished plans + reports is context rot: a
future session reads a superseded plan and follows stale direction. So:

1. **Distill what's durable.** Any decision a future session must honor —
   architecture, a contract, a chosen approach — goes into `docs/` via
   `av:docs` `decision` mode *before* anything is removed. If everything durable
   already lives in the code/docs, say so; most closed plans have nothing left.
2. **Delete the plan + its reports.** Remove the plan dir and the
   `plans/reports/*` files tied only to it. Git history is the archive — nothing
   is lost, and `git log`/`git show` recovers any of it. Do not keep an
   `_archive/` folder; "keep just in case" is the rot this step exists to stop.
3. **Record the disposition** in the closing commit: one line naming what was
   promoted into durable docs (or "nothing durable") and what was deleted.

Never auto-delete without confirming the exact file list when running live —
deletion is the one irreversible-looking step (though `git` reverts it).

## 7. Friction routing

If closing the plan surfaced the *same* friction for the 2nd+ time (a rule that
keeps confusing, a step that keeps breaking), route it to `av:journal`'s
harness-delta mode — propose the concrete kit fix rather than silently patching
mid-close. That is how repeated pain becomes a kit improvement instead of a
recurring tax.
