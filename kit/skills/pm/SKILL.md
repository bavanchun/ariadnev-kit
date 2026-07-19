---
name: vc:pm
description: Track plan progress and keep plan files truthful. Use for status checks, plan sync-back after work sessions, progress reports, or cross-session handoffs.
user-invocable: true
argument-hint: "[plan dir] [--report]"
metadata:
  author: vchun
  version: "1.0.0"
---

# PM

Keep `plans/` honest: statuses match reality, checkboxes match the repo, and
anyone (human or agent) can resume work from the files alone. Works on the
plan format defined by `vc:plan`.

Handles: status checks, whole-plan sync-back, progress reports, handoffs.
Does not handle: creating plans (`vc:plan`), doing the work (`vc:cook`).

## Core rule

A checkbox is ticked by evidence, not by optimism. Before marking anything
done, verify against the repo: the file exists, the test passes, the commit
is there. When plan and repo disagree, the repo wins — update the plan.

## Workflow

1. **Locate** — target plan dir from the argument, or scan `plans/*/plan.md`
   for non-completed plans (frontmatter `status`).
2. **Audit every phase** (not just the active one) — read each
   `phase-NN-*.md`, compare its steps/success criteria against the actual
   repo state (files, tests, git log).
3. **Sync back** — apply the rules in `references/sync-back.md`: phase
   statuses, plan.md phase table, whole-plan acceptance checkboxes,
   plan-level status.
4. **Report** — summary to the user; for session handoffs or `--report`,
   write `plans/reports/pm-{yymmdd-hhmm}-{slug}-status-report.md`.

## Status report format

```markdown
# Status: <plan title>

## Snapshot
| Phase | Status | Evidence |

## Done since last check
Short bullets with commits/tests.

## Next actions
Ordered, each with the skill to use (vc:cook phase-03, vc:fix <bug>, ...).

## Risks / blockers
Or "none".

## Unresolved questions
Or "none".
```

## Quality gates

- [ ] Every status change is backed by named evidence (file, test, commit)
- [ ] All phase files audited, not only the most recent
- [ ] plan.md table, phase frontmatter, and checkboxes mutually consistent
- [ ] Next actions are concrete enough to start without re-reading history
