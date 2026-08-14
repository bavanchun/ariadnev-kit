# Task Tracking and Sync-Back

Plan files are the durable source of truth. A runtime task-management surface is
an optional projection for visibility; it must never become a dependency.

## Hydration contract

After a plan with at least three meaningful phases is written:

1. Read `plan.md` and every `phase-NN-*.md` file.
2. Treat checked items as complete and unchecked items as remaining work.
3. Discover the live task-management surface at runtime. Never infer support
   from a client name, environment, or cached tool list.
4. If available, mirror actionable phases, critical/high-risk steps,
   dependencies, ownership, and status.
5. Retain a durable mapping from every runtime item to its plan phase and
   checklist item. Keep parallel groups independent and sequential dependencies
   explicit when the surface supports them.
6. If unavailable, continue with status in the active Markdown plan. Planning
   and cooking remain fully functional.

Runtime ownership must not overlap and dependency graphs must not cycle.

## Cook handoff

In the same session, `vc:cook` may reuse a live view only after confirming it
matches the plan. In a new session, or when runtime state is stale or absent,
rebuild progress from unchecked plan items. The plan always wins when states
disagree.

Present the exact absolute `plan.md` path after planning so the user can choose
the next step safely. The persisted plan itself should use repo-relative links
and remain portable across machines.

## Sync-back

Before reporting progress or completion:

1. Sweep every phase file, not only the active phase.
2. Reconcile completed runtime work with source checklist items.
3. Backfill stale completed checkboxes in earlier phases only when evidence exists.
4. Update phase frontmatter status and the hub phase table.
5. Derive overall plan status and progress from actual checkbox state.
6. Report any runtime item that cannot map to a phase before claiming completion.

For each checked item, retain evidence such as a test command/result, artifact,
or verified file change. Runtime counts are advisory; durable checkbox state
determines progress.

## Lifecycle safety

Creating and executing plans never deletes plan history. Archival, journal, Git,
GitHub, and publication are separate workflows with their own authorization.
Do not remove, move, or publish plan files as an implied planning side effect.
