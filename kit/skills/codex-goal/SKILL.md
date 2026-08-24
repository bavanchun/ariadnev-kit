---
name: av:codex-goal
description: Guide long-running Codex goal work with a verifiable stop condition. Use when users mention /goal, goal mode, durable objectives, or autonomous multi-turn Codex runs.
user-invocable: true
when_to_use: Invoke for Codex-native /goal guidance, not generic iteration loops or multi-CLI orchestration.
category: utilities
keywords: [codex, goal, autonomous, validation, long-running]
license: MIT
argument-hint: "<objective | goal draft>"
metadata:
  origin: ported
  author: upstream
  version: "1.0.0"
  upstream: "Pinned MIT source archive: codex-goal-loop@ce70edaa26247b84c2b9491a0cdb4964f65cf3a5"
---

# Codex Goal

Use Codex /goal for a durable objective that has a clear stopping condition and
a validation loop. It is not a safety boundary, a replacement for product
decisions, or a way to run an unbounded backlog.

## Availability Check

Confirm /goal appears in the Codex slash-command list. If it does not, enable
the documented feature flag in config.toml:

    [features]
    goals = true

Alternatively run: codex features enable goals

As verified on 2026-07-11, the official guide documents setting a goal with
/goal <objective>, checking it with /goal, and controlling it with /goal pause,
/goal resume, and /goal clear. Re-check the current documentation before relying
on any behavior not stated here:
https://learn.chatgpt.com/use-cases/follow-goals

## Use Test

Use a goal only when all three are true:

1. The task is longer than one normal turn and mainly mechanical.
2. The stop condition is verifiable through tests, an eval, a build, or another
   explicit artifact.
3. The scope is sufficiently clear that Codex can make progress without a
   product or architecture decision at each checkpoint.

Do not use it for exploratory work, vague improvement requests, production
credential changes, destructive shared infrastructure, or unrelated backlogs.

## Draft the Goal Contract

Give Codex one objective, files to read first, constraints, a validation command,
checkpoints, and a stop condition:

    /goal Complete <objective>.
    Read first: <plan, issue, files>.
    Constraints: <unchanged contracts and scope boundary>.
    Validate after each checkpoint: <command>.
    Keep a brief progress log.
    Stop when <verifiable end state>, or when further work needs human input.

Include a prohibition against weakening, narrowing, skipping, or deleting tests
to satisfy the goal. Pause for ambiguity instead of inventing a product decision.
Review the final diff before merging.

## Boundaries

- Before multi-hour or high-dependency goals, prefer `av:goal-warmup` to lock
  an outcome contract and preflight blockers; it does not start `/goal` for you.
- Use `av:loop` for local metric-driven iteration.
- Use `av:orchestrate` for dispatch across multiple coding-agent CLIs.
- Do not claim undocumented versions, authentication restrictions, or internal
  lifecycle states. Treat the official documentation as the source of truth.

## Output format

The deliverable is a goal draft the user pastes into Codex, with the use-test
verdict that justifies it:

```markdown
## Codex /goal draft
- Use test: mechanical=<yes/no> · verifiable stop=<yes/no: via <tests|eval|build|artifact>> · decision-free scope=<yes/no>
- Verdict: GOAL | NOT A GOAL (<which test failed> → <av:goal-warmup | av:loop | av:orchestrate | normal turn>)
- Availability: /goal listed | enable `[features] goals = true` (or `codex features enable goals`) first

/goal Complete <objective>.
Read first: <plan, issue, files>.
Constraints: <unchanged contracts and scope boundary>. Do not weaken, narrow, skip, or delete tests.
Validate after each checkpoint: <command>.
Keep a brief progress log.
Stop when <verifiable end state>, or when further work needs human input.

Controls: /goal (check) · /goal pause · /goal resume · /goal clear
After: review the final diff before merging.
```

## Quality gates

- [ ] All three use-test answers are `yes`; a `no` produces NOT A GOAL and a
      route, never a weakened goal.
- [ ] The stop condition names an artifact Codex can check itself (test suite,
      eval score, build, file state) — "when it looks done" is not verifiable.
- [ ] The validation command is one Codex can run at every checkpoint without
      a human (no interactive prompts, no credentials it does not have).
- [ ] The test-weakening prohibition is inside the draft text, not only in this
      file.
- [ ] No `/goal` behavior beyond set / check / pause / resume / clear is
      asserted; anything else points at the official guide URL above.
- [ ] The objective is not exploratory, a credential change, or shared-infra
      destruction — those are excluded by the use test, whatever the user
      called them.

Proof/risk: N/A — drafts an instruction; the validation command in the draft
sets the proof the run must produce.

## Workflow position

**Typically follows:** `av:goal-warmup` when the outcome needed locking and
preflight first, or `av:plan` when an accepted plan phase is mechanical enough
to hand to Codex whole.
**Typically precedes:** the user starting `/goal` in Codex, then `av:code-review`
or `av:review-pr` on the resulting diff.
**Related:** `av:loop` is the local metric loop; `av:orchestrate` dispatches
across coding-agent CLIs; `av:autoresearch` routes generic bounded iteration.
