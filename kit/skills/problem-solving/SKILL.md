---
name: vc:problem-solving
description: Break out of stuck states with systematic reframing. Use when circling a bug, over-complicating a design, hitting recurring failures, or unable to choose a direction.
user-invocable: true
argument-hint: "<what you're stuck on>"
metadata:
  author: vchun
  version: "1.0.0"
  upstream: "ak:problem-solving"
  upstream_version: "2.0.0"
  upstream_digest: "sha256:5f11a581dc800b272adb744a6138dd384df1abe804e05a5c11b7e77faaa6c127"
  upstream_relation: "distill"
---

# Problem Solving

Break a genuine stuck state by matching its symptom to a reframing technique,
showing the work, and ending with one actionable move. This is not a substitute
for ordinary debugging or planning when the path is already clear.

## Diagnose before choosing

Name the observed stuck pattern, not the preferred technique:

| Symptom | Primary technique | Load |
|---|---|---|
| Same behavior implemented many ways; special cases keep growing | Simplification cascade | [patterns and simplification](references/patterns-and-simplification.md) |
| The same shape appears across three or more domains | Meta-pattern recognition | [patterns and simplification](references/patterns-and-simplification.md) |
| Solution feels forced; “must be done this way” | Inversion exercise | [inversion and collision](references/inversion-and-collision.md) |
| Conventional approaches are exhausted; breakthrough needed | Collision-zone thinking | [inversion and collision](references/inversion-and-collision.md) |
| Production limits or edge behavior are unknown | Scale game | [scale and recovery](references/scale-and-recovery.md) |
| No symptom fits or the first technique fails | Stuck recovery | [scale and recovery](references/scale-and-recovery.md) |

A wrong result, failing test, or unexplained runtime behavior belongs first to
`vc:fix`. Use this skill only when the investigation itself is stuck or a
problem needs reframing.

## Workflow

1. **Identify stuck-type.** Record the symptom, attempts already made, and the
   evidence that progress has stalled.
2. **Load the detailed reference.** Read only the specific technique linked by
   the dispatch table; do not preload every method.
3. **Apply systematically.** Follow the technique's process and write down its
   intermediate artifact: assumptions, collision, abstract pattern, or scale
   table.
4. **Document insights.** Separate what worked, what failed, and what changed
   in the mental model.
5. **Choose one next action.** Make it small and observable enough to start now.
6. **Combine if needed.** If the first attempt fails, select a second technique
   because of a newly observed symptom, not to avoid committing to a result.

## Combining techniques

Useful sequences include:

- meta-pattern → simplification: abstract the repeated shape, then collapse its
  implementations;
- collision → inversion: borrow a model, then question the model's assumptions;
- scale → simplification: expose what breaks at extremes, then remove machinery
  irrelevant at the real scale;
- meta-pattern → scale: test whether a supposedly universal pattern survives
  both minimum and maximum conditions.

Use one technique at a time. Preserve the output from the first so the second
has evidence to build on rather than restarting the discussion.

## Decision discipline

- Treat “should”, “probably”, and “must” as prompts for a check or inversion.
- Do not call a metaphor an answer until its boundary has been tested.
- Do not extract an abstraction merely because two names look similar; require
  one clean domain-independent rule and verify every existing case fits.
- A scale game is a thought experiment until measurements exist. Convert its
  highest-risk break point into a real test when implementation depends on it.
- Dropping or shrinking the problem is a valid result when the evidence says
  the original scope is not worth solving.

## Output format

```markdown
Stuck type: <observed symptom>
Technique: <selected technique and why it fits>

Work:
<assumption list, collision map, pattern table, or scale extremes>

Insight: <what changed>
Next action: <one concrete, observable step>
If it fails: <next technique or rescope condition>
```

Proof/risk: this skill produces a direction, not a code change. Any proposed
technical behavior remains a hypothesis until the downstream workflow runs the
appropriate unit, integration, e2e, or platform proof.

## Quality gates

Before returning, confirm:

1. The chosen technique matches an observed symptom from the dispatch table.
2. The technique's intermediate work is shown, not summarized as “considered.”
3. Assumptions and “should scale” claims are labelled as unverified until
   checked empirically.
4. Failed attempts and metaphor/abstraction boundaries remain visible.
5. The next action can start now and has an observable result, or the output
   explicitly recommends dropping/rescoping the problem.
6. A second technique is justified by new evidence from the first attempt.

## Workflow position

**Typically follows:** `vc:fix`, `vc:cook`, or `vc:brainstorm` reaching a real
stuck state after direct work stopped producing evidence.

**Typically precedes:** returning to the originating workflow with a concrete
experiment, or `vc:brainstorm` when the reframing changes the design space.

**Related:** `vc:sequential-thinking` for step-by-step reasoning when the frame
is sound; this skill when the frame itself is blocking progress.
