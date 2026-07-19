# Delegation Protocol

When and how to spawn a subagent instead of doing the work inline.

## When to delegate

| Situation | Delegate to |
|---|---|
| Need to locate files/patterns across a codebase | `vc-explore` |
| Architecture or phased implementation plan | `vc-planner` |
| Ideation, trade-off debate before building | `vc-brainstormer` |
| Diff needs a production-readiness pass | `vc-reviewer` |
| Test suite needs running/analyzing | `vc-tester` |
| Bug needs root-cause proof before a fix | `vc-debugger` |
| Implementation work itself | `vc-developer` |
| Stage/commit/push | `vc-git-manager` |
| Docs need to match code reality | `vc-docs-manager` |
| Plan progress needs tracking/sync-back | `vc-project-manager` |
| External research (libraries, best practices) | `vc-researcher` |
| Session-end technical journal entry | `vc-journal-writer` |
| Recently-touched code needs simplifying | `vc-simplifier` |

Do not delegate trivial, single-tool-call work — spawning overhead costs more
than doing it directly.

## Context to hand off

Every delegation must include: the task, exact file paths (not "look
around"), acceptance criteria, constraints, and where reports/plans live.
Never pass full conversation history — summarize only the decisions the
subagent needs. Keep merge decisions and user approvals in the lead session.

## Status protocol

Every delegated task ends with:

```text
Status: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
Summary: one or two sentences
Concerns/Blockers: optional
```

`BLOCKED` or `NEEDS_CONTEXT` means change the context or scope before
retrying — never resend the identical prompt.

## Parallel work

Only parallelize when file ownership is clear and non-overlapping. Never let
two agents write the same file, migration, or generated artifact at once.
