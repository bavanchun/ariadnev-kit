# Delegation Protocol

When and how to spawn a subagent instead of doing the work inline.

## When to delegate

| Situation | Delegate to |
|---|---|
| Need to locate files/patterns across a codebase | `av-explore` |
| Architecture or phased implementation plan | `av-planner` |
| Ideation, trade-off debate before building | `av-brainstormer` |
| Diff needs a production-readiness pass | `av-reviewer` |
| Test suite needs running/analyzing | `av-tester` |
| Bug needs root-cause proof before a fix | `av-debugger` |
| Implementation work itself | `av-developer` |
| Stage/commit/push | `av-git-manager` |
| Docs need to match code reality | `av-docs-manager` |
| Plan progress needs tracking/sync-back | `av-project-manager` |
| External research (libraries, best practices) | `av-researcher` |
| Session-end technical journal entry | `av-journal-writer` |
| Recently-touched code needs simplifying | `av-simplifier` |

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
