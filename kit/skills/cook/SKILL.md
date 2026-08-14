---
name: vc:cook
description: Implement features and execute plans end to end. Use for feature development, plan execution, or any change that must ship tested and reviewed.
user-invocable: true
argument-hint: "<task description or path to plan.md / phase-*.md>"
metadata:
  author: vchun
  version: "1.0.0"
---

# Cook

Structured implementation pipeline: understand → plan → implement (TDD) →
test gate → review gate → finalize. The gates are part of this skill — there
is no separate test or review skill to invoke.

Handles: feature implementation, plan/phase execution, refactors with tests.
Does not handle: ideation (`vc:brainstorm`), root-cause bug hunts (`vc:fix`),
multi-phase roadmap authoring (`vc:plan`).

## Input routing

| Input | Route |
|---|---|
| Path to `plan.md` / `phase-*.md` | Load plan; skip discovery, execute phases in order |
| Task description, requirements clear | Micro-plan inline (steps + files + acceptance), then implement |
| Task description, requirements fuzzy | Stop — run `vc:brainstorm` or ask targeted questions first |

## Hard rules

1. **No code before a plan exists** — a loaded plan file or a written inline
   micro-plan (steps, files touched, acceptance criteria). "Simple" tasks are
   where unexamined assumptions cost the most.
2. **TDD by default**: write the failing test first, watch it fail, implement
   to green. If the repo has no test infrastructure, say so and get consent
   to proceed without, or set it up.
3. **Keep the suite green**: never commit on red; never weaken a test to make
   it pass.
4. **Match the codebase**: reuse existing helpers, naming, and module
   boundaries before inventing new ones.

## Workflow

1. **Understand** — read the plan or scout the touched area (existing
   patterns, contracts, callers). List: files to modify, files to create,
   acceptance criteria. Classify the risk lane per `references/risk-lanes.md`
   — high-risk stops here for a confirm before any code is written.
2. **Implement per unit of work**:
   a. failing test → b. implementation → c. green → d. commit via `vc:git`
   (conventional message, one concern per commit).
3. **Test gate** — read `references/test-gate.md` and pass every check before
   claiming completion.
4. **Review gate** — read `references/review-gate.md`; self-review the full
   diff against it (or delegate to `vc-reviewer` for cross-module or
   contract-touching changes).
5. **Finalize** — sync plan checkboxes/status if executing a plan, update
   docs only when user-visible behavior changed, report the outcome with
   evidence (test counts, files changed).

## When something breaks

If the gates reveal a regression or side effect: stop. Present to the user
what broke, the one-line cause, and 2-3 concrete options (revert slice,
update dependents, accept new behavior). Never silently patch around a
regression.

## Output format

End every cook run with:

```
✅/⚠️ <one-line outcome>
- Tests: <n passed / evidence, or why skipped>
- Files: <changed paths>
- Commits: <hashes + subjects>
- Follow-ups: <or "none">
```

## Quality gates

- [ ] Plan (file or inline) existed before the first code edit
- [ ] Risk lane classified; high-risk work confirmed with the user before implementing
- [ ] Red-then-green evidence for each behavior change
- [ ] `references/test-gate.md` checklist passed
- [ ] `references/review-gate.md` checklist passed
- [ ] Plan file synced back (when executing a plan)

## Workflow position

**Typically follows:** `vc:plan` (execute a phase of an accepted plan),
`vc:brainstorm` (implement the agreed approach), `vc:scout` (the touched area is
already mapped).
**Typically precedes:** `vc:ship` (release the finished branch), `vc:pm` (track
plan sync-back), `vc:git` (commit each unit of work).
**Related:** `vc:fix` — use it instead when the task is a bug whose cause is not
yet proven. `vc:code-review` and `vc:test` deepen gates that cook already runs
inline; reach for them only when a change needs more than the embedded pass.
