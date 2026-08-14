# Fix Finalization

Read this reference only after verification and review are clean. Finalization
reports actual evidence and updates only the durable surfaces affected by the
repair.

## Final report

Include:

- repaired outcome and confidence bounded by proof actually run;
- root cause, why now, and evidence chain;
- files and behavior changed;
- regression guard and red-green result;
- prevention measures;
- blast-radius/side-effect sweep results;
- public-contract status;
- unresolved risks or `none`.

## Plan and progress sync

When the fix belongs to an active plan, use `av:pm` to reconcile completed work,
update progress/checklists (including stale earlier phases), and record
unresolved mappings. Reflect completion in a live task-management surface when
available, but keep the plan as durable truth.

A standalone quick fix with no plan does not create plan churn merely to satisfy
finalization.

## Documentation impact

Use `av:docs` only when the repair changes user-visible behavior, setup,
commands, configuration, architecture, security guidance, public contracts, or
a durable maintainer decision. Discover the owning surface and make the
smallest justified update; internal repair completion is not docs impact.

## Git and journal

Commit and push are separate actions. Ask whether the user wants a focused
commit when commit authority was not already granted; push only when explicitly
requested. Use `av:git` and a conventional `fix: <cause>` message after fresh
verification. Never let `--auto`, `--quick`, or task completion imply Git
authorization.

Use `av:journal` for a hard-won root cause or durable decision when repository
workflow calls for it. Do not create a ceremonial journal entry for every
mechanical lint fix.

## Final gate

Do not report complete until the active plan (if any), verification evidence,
review verdict, docs-impact decision, and authorized Git actions agree with the
actual worktree.
