---
name: vc:problem-solving
description: Break out of stuck states with systematic reframing. Use when circling a bug, over-complicating a design, hitting recurring failures, or unable to choose a direction.
user-invocable: true
argument-hint: "<what you're stuck on>"
metadata:
  author: vchun
  version: "1.0.0"
---

# Problem Solving

For when direct effort stopped working. Pick the technique that matches the
stuck-pattern, apply it explicitly, and produce a next concrete action —
this skill ends with a decision, not a meditation.

## Diagnose the stuck-pattern first

| Symptom | Technique |
|---|---|
| Same fix attempted 3+ times, still failing | **Assumption audit** |
| Solution keeps growing branches and special cases | **Simplification cascade** |
| Can't choose between options for days | **Inversion** |
| Problem feels too big to start | **Decomposition ladder** |
| "It should work" but doesn't | **Reality reconstruction** |
| Requirements feel contradictory | **Constraint interrogation** |

## Techniques

**Assumption audit** — list every assumption the current approach rests on
(env, API behavior, data shape, ordering). Rank by "least verified". Verify
the top one empirically before another fix attempt. Repeated failure almost
always lives in an unverified assumption, not in effort.

**Simplification cascade** — ask in order: (1) can we delete the feature
causing the complexity? (2) solve for the 80% case only? (3) use a boring
existing tool instead? (4) hardcode what we're making configurable? Stop at
the first "yes" and try that version.

**Inversion** — instead of "what's the best option", ask "which option would
be clearly stupid, and why?" The reasons expose the criteria that actually
matter; score remaining options on those criteria only.

**Decomposition ladder** — write the end state, then the last step before
it, then the step before that, until you reach something doable today. Do
that thing. (Backward decomposition beats forward planning when the path is
foggy.)

**Reality reconstruction** — throw away the mental model; rebuild only from
observed facts: real output, real logs, real code read line by line. Mark
every "I think" and turn each into a check. Pairs with `vc:fix`'s root-cause
loop for bugs.

**Constraint interrogation** — for each constraint ask: who set it, is it
still true, what does violating it actually cost? Most deadlocks contain one
assumed constraint nobody owns.

## Output

1. Named stuck-pattern and chosen technique.
2. The technique's work, shown (the list, the ladder, the audit table).
3. One next action, concrete enough to start now — or the honest conclusion
   that the task should be dropped/rescoped, said plainly.
