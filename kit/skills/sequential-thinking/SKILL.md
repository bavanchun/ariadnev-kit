---
name: av:sequential-thinking
description: Apply structured, revisable step-by-step reasoning for complex problems. Use for multi-step analysis, hypothesis-driven debugging, or plans whose scope may change mid-way.
user-invocable: true
argument-hint: "<problem to reason through>"
metadata:
  author: vchun
  version: "1.0.0"
---

# Sequential Thinking

Reason through a complex, changing problem as a revisable evidence trail. Each
step handles one aspect, preserves corrections, and says what the next step
must resolve. The method prevents a polished first guess from becoming an
unexamined conclusion.

Handles: adaptive analysis, architecture trade-offs, hypothesis-driven
investigation, unclear scope, and multi-constraint decisions.

Does not handle: ordinary one-step questions or a stuck frame. Answer simple
questions directly; use `av:problem-solving` when reframing is the real need.

## Core record

Each reasoning step contains:

```text
Step N/~T [TYPE]: <concise claim or decision>
Evidence: <observation, source, command, or "not checked">
Uncertainty/falsifier: <what could make this wrong>
Next: <what the next step should address>
```

Types are `ANALYSIS`, `HYPOTHESIS`, `VERIFICATION`, `REVISION`, `BRANCH`,
`CONVERGENCE`, and `FINAL`. A loose total is a navigation aid, not a promise.

For dynamic totals, revisions, branching, uncertainty, and convergence, read
[reasoning patterns](references/reasoning-patterns.md). For compact API,
architecture, and debugging demonstrations, read
[worked examples](references/worked-examples.md).

## Workflow

1. **Frame the decision.** State the question, known facts, constraints, and
   finish condition. Separate evidence from assumptions.
2. **Estimate loosely.** Start with `Step 1/~5`; expand when complexity or a new
   verification appears, contract when a key insight removes work.
3. **Advance one aspect.** Build explicitly on relevant prior steps and signal
   what the next thought should address.
4. **Revise visibly.** When evidence invalidates an earlier step, name the
   original, reason, and downstream impact. Never silently overwrite it.
5. **Branch deliberately.** Explore at most 2–3 real alternatives or hypotheses
   under the same criteria; do not branch merely to list possibilities.
6. **Verify.** Test hypotheses against code, sources, commands, or measurements.
   Record eliminated explanations as well as the surviving one.
7. **Converge.** Compare branches, select or synthesize an approach, and explain
   why losing branches were rejected.
8. **Finish on evidence.** Mark `FINAL` only when critical uncertainties are
   resolved or explicitly listed with a safe next action.

## Revision format

```text
Step 5/~8 [REVISION of Step 2]: <corrected understanding>
Original: <earlier claim>
Why revised: <new evidence>
Impact: <which later steps or decisions change>
Next: <rebuild or verify>
```

A foundational revision triggers a reassessment of every dependent step. Keep,
adjust, or invalidate each one explicitly before continuing.

## Branch format

```text
Step 4/~7 [BRANCH A from Step 2]: <approach or hypothesis A>
Step 4/~7 [BRANCH B from Step 2]: <approach or hypothesis B>
Step 5/~7 [VERIFICATION]: <same-quality evidence for both>
Step 6/~7 [CONVERGENCE]: <winner/hybrid and rationale>
```

Evaluate branches with shared constraints and comparable evidence. If critical
information is unavailable, find a solution robust to both scenarios or name
the minimum information required.

## Visibility modes

- **Explicit audit trail:** show the concise step records when the user asks for
  a breakdown or the decision needs reviewable evidence.
- **Implicit:** apply the method internally and return the conclusion, evidence,
  alternatives, and residual uncertainty without exposing private scratch work.

The av distribution does not bundle optional thought-history and formatting
scripts. Do not claim persistent history or deterministic formatting unless
an equivalent installed tool actually ran.

## Output format

```markdown
Conclusion: <verified result or current best decision>
Evidence: <checks that support it>
Revisions: <material corrections, or "none">
Alternatives eliminated: <branch + reason>
Residual uncertainty: <items or "none">
Next action: <observable follow-up>
```

Proof/risk: reasoning organizes evidence; it is not evidence itself. A
`HYPOTHESIS` becomes a finding only after `VERIFICATION` names a real source,
command, measurement, or test result.

## Quality gates

Before `FINAL`, confirm:

1. Every material step states evidence and a falsifier or uncertainty.
2. Dynamic expansion/contraction reflects changed complexity, not impatience.
3. Revisions preserve original claim, new evidence, and downstream impact.
4. Branches use common criteria and converge explicitly.
5. Every hypothesis is verified or eliminated; “plausible” is not final.
6. Residual uncertainty is explicit and paired with a safe next action.
7. The public response is a concise audit trail, not raw private chain-of-thought.

## Workflow position

**Typically follows:** `av:scout`, `av:fix`, or `av:plan` encountering a complex
but still progressing analysis.

**Typically precedes:** the evidence-backed action in `av:fix`, `av:plan`, or
`av:cook`.

**Related:** `av:problem-solving` changes a stuck frame; this skill develops and
corrects a viable frame step by step.
