---
name: vc:fix
description: Fix bugs, test failures, and CI errors with proven root causes. Use for type errors, lint issues, failing tests, runtime bugs, or broken pipelines.
user-invocable: true
argument-hint: "<error or bug> [--quick|--review|--auto|--parallel]"
metadata:
  author: vchun
  version: "1.0.0"
---

# Fix

Repair a concrete failure by proving its cause, changing the smallest affected
behavior, and showing the original failure go red → green without regressions.
Symptom patches and guess-and-check edits are failures.

Handles: runtime bugs, failing tests, type/lint errors, CI failures, logs, and
broken workflows. New behavior belongs to `vc:cook`; unresolved design choices
belong to `vc:brainstorm` after diagnosis.

## Opening repair contract

Before mode selection or diagnosis, capture or reuse:

- **Outcome:** expected repaired behavior;
- **Constraints:** safety, compatibility, ownership, and time boundaries;
- **Non-goals:** adjacent behavior this fix must not absorb;
- **Acceptance criteria:** exact reproduction plus broader evidence proving the
  repair complete.

This gate frames the fix; it does not choose one. Scout and diagnose before
comparing solutions.

## Modes

| Mode | Use when | Behavior |
|---|---|---|
| default / `--auto` | Direct fix request with discoverable scope | Continue autonomously inside the repair contract; pause on material side effects or decisions |
| `--review` | Production/security/high-reversibility work | Present the diagnosed approach before implementation and every contract-changing choice |
| `--quick` | One mechanical type/lint/syntax issue | Minimal scout and diagnosis; all verification gates remain |
| `--parallel` | Two or more independent failures | Separate issue trees and disjoint ownership; the flag explicitly authorizes parallel delegation |

Mode affects pauses and execution shape, never cause proof or verification.

## Authoritative workflow

1. **Scout.** Map project type, symptom files, direct callers/dependents,
   related tests, recent touching commits, and local patterns. Read
   [diagnosis contract](references/diagnosis-contract.md).
2. **Diagnose.** Capture exact pre-fix evidence, reproduce, form competing
   hypotheses, and prove one root-cause mechanism at `file:line`. Do not propose
   or implement a fix before Steps 1–2 complete.
3. **Route.** Classify the proven issue and select quick, standard, deep, or
   parallel delivery from [fix routing](references/fix-routing.md). Multiple
   viable repairs require a post-diagnosis brainstorm; complex work gets a plan.
4. **Implement.** Make the smallest cause-aligned change, preserve constraints
   and non-goals, remove diagnostic probes, and keep the regression guard.
5. **Verify and prevent.** Follow
   [verification and side effects](references/verification-and-side-effects.md):
   exact repro, red-green guard, blast-radius tests, contracts, quality commands,
   review, and prevention.
6. **Finalize.** Report evidence, reconcile active plan state, evaluate docs
   impact, and keep Git actions authorization-bound using
   [finalization](references/finalization.md).

For a difficult mechanism, use the detailed
[root-cause loop](references/root-cause.md).

## Exact root-cause gate

Before editing, answer concretely:

1. exact symptom;
2. minimal reproduction and environment;
3. expected versus actual behavior;
4. root cause at a specific source boundary;
5. why it surfaced now;
6. blast radius across dependent/shared paths.

If any answer is “probably”, “I think”, or vague, gather logs/reproduction facts
or scout more. Ask only questions that cannot be answered from the workspace,
with options grounded in specific files, functions, commits, or environments.

## Hard boundaries

- No shotgun edits: test one hypothesis at a time.
- Never use `any`, suppressions, skipped tests, fake behavior, or mocks merely
  to make a gate green.
- Do not spawn subagents only because a skill says to. Delegate only when the
  user explicitly requested/permitted it; otherwise scout, diagnose, and verify
  in the main workflow.
- A side effect or public-contract change is a new decision, not an excuse for a
  silent follow-up patch.
- Three failed repair attempts mean the approach is wrong: stop, preserve the
  evidence, question architecture, and ask for direction.

## Output format

```markdown
Result: fixed | partially fixed | blocked
Root cause: <specific mechanism at file:line>
Why now: <introducer/condition>
Changes: <files and cause-aligned behavior>
Evidence: <exact pre-fix failure → post-fix result>
Regression guard: <test and red-green evidence>
Side-effect sweep: <callers/modules/contracts checked>
Prevention: <guard or "not applicable">
Residual risk: <items or "none">
```

Proof/risk: a changed file is not proof. Completion requires the original
symptom, regression guard, affected flows, and relevant lint/type/build/test
commands to produce fresh evidence.

## Quality gates

Before calling the repair complete, confirm:

1. Opening outcome, constraints, non-goals, and acceptance criteria stayed in scope.
2. Scout evidence preceded hypotheses and diagnosis preceded edits.
3. Root cause explains every observed symptom and why the failure appeared now.
4. Regression proof fails without the fix and passes with it in this session.
5. Every dependent caller/shared contract in the blast radius was checked.
6. Typecheck, lint, build, and tests ran where the project defines them.
7. `vc:code-review` or equivalent local review found no unresolved blocker.
8. Side effects were surfaced for a user decision rather than silently patched.
9. Plan/docs/Git/journal actions followed their own impact and authorization gates.

## Workflow position

**Typically follows:** a concrete failure from `vc:test`, `vc:cook`, CI, logs,
or a user reproduction.

**Typically precedes:** `vc:code-review`, broader `vc:test`, and optionally
`vc:git`/`vc:journal` after explicit authorization and final evidence.

**Related:** `vc:scout` for context, `vc:sequential-thinking` for hypotheses,
`vc:problem-solving` after repeated eliminations, and `vc:brainstorm` when the
diagnosed cause admits multiple materially different repairs.
