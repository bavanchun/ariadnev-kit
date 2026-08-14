---
name: vc:plan
description: Create evidence-backed phased implementation plans as plain files under plans/. Use for roadmaps, architecture rollouts, or multi-phase delivery after the approach is chosen.
user-invocable: true
argument-hint: "<feature or goal to plan>"
metadata:
  author: vchun
  version: "1.0.0"
---

# Plan

Turn an accepted outcome into an executable, evidence-backed delivery plan.
The deliverable is `plan.md` plus phase files under the project `plans/`
directory. Those Markdown files are canonical; GitHub is neither required nor
canonical, and no external CLI, database, dashboard, or publishing service is
required.

Handles: implementation sequencing, architecture rollouts, risky refactors,
and multi-phase roadmaps.

Does not handle: open-ended option selection (`vc:brainstorm`), implementation
(`vc:cook`), plan archival, HTML presentation, or external publication.

## Opening contract

Before writing files, capture or reuse:

- **Outcome:** what must be true when the plan is complete;
- **Constraints:** compatibility, safety, ownership, time, and project rules;
- **Non-goals:** adjacent work deliberately excluded;
- **Acceptance criteria:** observable evidence for the whole plan.

The approach must already be chosen. If materially different solutions remain,
route to `vc:brainstorm`; do not hide architecture selection inside a phase.
This skill creates plans only and must not implement code.

## Planning depth

Choose depth from evidence, not labels:

| Depth | Use when | Required addition |
|---|---|---|
| Fast | Small, clear, low-risk change | Focused scout; minimal phases |
| Standard | Cross-module work or meaningful dependencies | Research, architecture, and contract checks |
| Deep | Five-plus affected areas or high blast radius | Per-phase inventories, test matrices, and interface checks |
| Parallel-ready | Independent work with disjoint ownership | Dependency graph, execution strategy, and file-ownership matrix |

Read [intake and planning depth](references/intake-and-modes.md) before choosing
scope or research effort. Parallel-ready means the files express safe groups;
it does not promise an unsupported parallel execution command.

## Authoritative workflow

1. **Preflight.** Resolve the active goal, inspect unfinished plans for overlap,
   and read repository instructions plus owning documentation. Read existing
   `plan.md` and every existing phase stub before editing any of them.
2. **Challenge scope.** Identify reusable code, the minimum viable change, and
   load-bearing assumptions. Confirm only a material choice that evidence cannot
   settle. See [intake and planning depth](references/intake-and-modes.md).
3. **Research and scout.** Verify current files, symbols, callers, tests,
   manifests, and external contracts. Record unresolved facts as `[UNVERIFIED]`;
   never invent a path or API.
4. **Design and slice.** Apply KISS and DRY. Deliver the full requested scope;
   with `--yagni`, additionally challenge and cut scope not needed for the
   stated outcome. Compare credible trade-offs
   on their worst plausible case; split independently testable, revertible
   phases by dependency and risk. Follow
   [solution and phase design](references/solution-and-phases.md).
5. **Write.** Create `plans/{yymmdd-hhmm}-{slug}/plan.md` and
   `phase-NN-{slug}.md` files using
   [the plan templates](references/plan-file-templates.md). Keep the hub short
   and the execution detail in phase files.
6. **Attack and verify.** Fact-check claims against source, apply adversarial
   lenses, adjudicate only evidence-backed findings, and validate implicit user
   decisions. Follow [verification and red team](references/verification-and-red-team.md).
7. **Consistency sweep.** Re-read the hub and every phase after edits; reconcile
   stale terms, dependencies, contracts, criteria, risks, and logs. Do not
   recommend cooking while any contradiction remains.
8. **Track and hand off.** Mirror work into a live task surface only when one is
   actually available; Markdown remains authoritative. Follow
   [task tracking and sync-back](references/task-and-sync-back.md), then present
   the exact absolute plan path for `vc:cook`.

## Hard boundaries

- Create plans only under the project plan root; never in an arbitrary user
  directory. A global plan requires an explicit project convention or request.
- Never put or publish secrets, tokens, raw logs, private environment values,
  customer data, or machine-local details in a plan. Persist repo-relative links;
  reserve an absolute local path for the final handoff.
- Missing cross-plan references warn as `not found`; they do not erase or invent
  dependencies. Ambiguous dependency direction is a user decision.
- Runtime tasks are an optional projection. Never infer support from a client
  name or cached tool list, and never let runtime state override plan files.
- Do not claim a phase complete without fresh evidence mapped to its success
  criteria. Do not write “update all callers”; state the count and list them.

## Output format

```markdown
Plan: <absolute path>/plan.md
Scope: <fast | standard | deep | parallel-ready>
Phases: <count and dependency order>
Acceptance: <whole-plan criteria>
Verification: <claims checked; unresolved facts/contradictions>
Next: vc:cook <absolute path>/plan.md
```

## Quality gates

- [ ] Opening outcome, constraints, non-goals, and acceptance criteria are explicit.
- [ ] Existing plans, repository rules, source, tests, and contracts were inspected.
- [ ] Every phase names concrete files, dependencies, implementation steps,
      regression commands, rollback/stop conditions, and testable success criteria.
- [ ] High-risk work is front-loaded or guarded by an observable stop condition.
- [ ] Every factual claim is verified, cited, or marked `[UNVERIFIED]`.
- [ ] Adversarial findings carry `file:line` evidence and are deduplicated.
- [ ] User decisions are preserved; unresolved contradictions equal zero.
- [ ] Hub, phases, optional runtime tasks, and final status agree.

## Workflow position

**Typically follows:** `vc:brainstorm` for an accepted approach and `vc:scout`
for owning evidence.

**Typically precedes:** `vc:cook <absolute-plan-path>/plan.md`; `vc:pm` may
track progress and reconcile durable state.

**Related:** `vc:code-review` reviews implemented code, while this skill's
red-team gate reviews whether the plan is factual, complete, and executable.
