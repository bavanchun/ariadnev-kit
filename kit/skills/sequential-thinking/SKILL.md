---
name: vc:sequential-thinking
description: Apply structured, revisable step-by-step reasoning for complex problems. Use for multi-step analysis, hypothesis-driven debugging, or plans whose scope may change mid-way.
user-invocable: true
argument-hint: "<problem to reason through>"
metadata:
  author: vchun
  version: "1.0.0"
---

# Sequential Thinking

Structured reasoning for problems too tangled for a single pass: each step
builds on the last, can be revised when wrong, and branches when there are
real alternatives to weigh.

Handles: multi-step analysis, hypothesis-driven investigation, plans with
emerging scope.
Does not handle: simple questions (just answer them) — this is for problems
where jumping straight to a conclusion has already gone wrong once.

## Core rule

Every step must be falsifiable: state what evidence would prove it wrong.
A step that can't be wrong isn't reasoning, it's restating the question.

## Process

1. **Estimate loosely**: `Thought 1/~5: <first-pass analysis>`. Adjust the
   total as understanding grows — expand when new complexity surfaces,
   contract when it turns out simpler.
2. **One aspect per thought**: state assumptions and uncertainties
   explicitly; say what the next thought needs to address.
3. **Revise when wrong**, don't silently overwrite:
   ```
   Thought 5 [REVISION of Thought 2]: <corrected understanding>
   Original: <what was said> | Why revised: <new evidence> | Impact: <what changes>
   ```
4. **Branch for real alternatives**:
   ```
   Thought 4 [BRANCH A]: <approach A>
   Thought 4 [BRANCH B]: <approach B>
   ```
   Converge explicitly — state which branch won and why.
5. **Hypothesis → verification**:
   ```
   Thought 6 [HYPOTHESIS]: <proposed cause/solution>
   Thought 7 [VERIFICATION]: <what was checked, result>
   ```
   Loop until verified or eliminated — don't stop at "plausible."
6. **Finish only when ready**: mark `Thought N [FINAL]` — solution verified,
   no outstanding uncertainty, not just "confidence achieved."

## Modes

**Explicit** — show the numbered thoughts when the user asked for visible
reasoning, or the problem is genuinely contentious.
**Implicit** — apply the same discipline (falsifiable steps, revise instead
of silently pivot) internally for routine work, without cluttering the
response with thought markers.

## Output format

- **Explicit mode**: the numbered `Thought n/~N` trace (with any REVISION /
  BRANCH / HYPOTHESIS / VERIFICATION markers) ending in a `Thought N [FINAL]`
  that states the verified conclusion + residual uncertainty (or "none").
- **Implicit mode**: just the conclusion, but reached under the same discipline.

Proof/risk: the reasoning itself is not a proof — a `[HYPOTHESIS]` becomes a
finding only after its `[VERIFICATION]` names real evidence. When the conclusion
drives a change, the change still owes its own proof layer.

## Quality gates

Before marking `[FINAL]`:

1. Every step stated what would falsify it — no step that merely restates the
   question.
2. Every hypothesis was verified or eliminated against real evidence, not left
   at "plausible".
3. Revisions were shown (Original / Why / Impact), not silently overwritten.
4. Branches converged explicitly — the losing branch and the reason are on record.

## Workflow position

**Typically follows:** a problem where jumping to a conclusion already failed
once — inside `vc:fix`, `vc:scout`, or a tangled `vc:plan`.
**Typically precedes:** the action the reasoning justifies (`vc:cook`, `vc:fix`)
or `vc:plan` once the path is clear.
**Related:** `vc:problem-solving` reframes a *stuck* state; this skill *reasons*
through a complex-but-moving one. `vc-debugger` and `vc-planner` apply this shape
naturally — use explicit mode when either must show its work.
