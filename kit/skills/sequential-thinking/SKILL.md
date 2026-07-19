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

## Pairs well with

`vc-debugger`'s hypothesis-elimination loop and `vc-planner`'s verification
discipline both fit this shape naturally — use this skill's explicit mode
when either needs to show its work.
