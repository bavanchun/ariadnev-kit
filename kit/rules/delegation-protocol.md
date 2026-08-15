# Delegation Protocol

Which agent to spawn for which situation.

The rest of delegation — what context to hand over, how to isolate it, when
parallel work is safe, and the status format a subagent reports back with —
lives in `orchestration-protocol.md`. This file is only the routing table,
because two rules describing the same thing in different words is how they drift
into contradicting each other.

## When to delegate

| Situation | Delegate to |
|---|---|
| Need to locate files/patterns across a codebase | `explore` |
| Architecture or phased implementation plan | `planner` |
| Ideation, trade-off debate before building | `brainstormer` |
| Diff needs a production-readiness pass | `code-reviewer` |
| Test suite needs running/analyzing | `tester` |
| Bug needs root-cause proof before a fix | `debugger` |
| Implementation work itself | `fullstack-developer` |
| Stage/commit/push | `git-manager` |
| Docs need to match code reality | `docs-manager` |
| Plan progress needs tracking/sync-back | `project-manager` |
| External research (libraries, best practices) | `researcher` |
| Session-end technical journal entry | `journal-writer` |
| Recently-touched code needs simplifying | `code-simplifier` |
| Interface or interaction design | `ui-ux-designer` |
| A hard call while running below the strongest model tier | `kongming` |
| Interview-driven advice with the user in the loop | `advisor` |

Do not delegate trivial, single-tool-call work — spawning overhead costs more
than doing it directly.
