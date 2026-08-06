# Sequential Reasoning Patterns

Read this reference when the reasoning needs revision, branches, uncertainty
management, or a changing step budget.

## Dynamic adjustment

Expand the estimated total when new complexity, dependencies, alternatives, or
verification work appears. Contract it when a verified insight merges or
eliminates steps. State the change inline, for example `~5 → ~7: authorization
and revocation emerged`.

Never add filler to reach an estimate or force a conclusion because the initial
total was too small.

## Revision patterns

| Trigger | Revision action |
|---|---|
| Assumption disproved | Replace the foundation and reassess dependents |
| Scope larger/smaller | Update finish condition and step budget |
| Approach fails a requirement | Preserve failure evidence and shift approach |
| New interaction changes meaning | Revisit component-level conclusions |

Use:

```text
Step N [REVISION of Step K]
Original: <claim>
Why revised: <new evidence>
Impact: <dependent steps kept/changed/invalidated>
```

For a revision cascade, list every dependent step and classify it `keep`,
`adjust`, or `invalidate` before rebuilding from the corrected foundation.

## Branch patterns

- **Trade-off:** compare approaches under identical acceptance criteria.
- **Hypothesis:** test several explanations with evidence of equal quality.
- **Risk:** preserve a fallback for a high-risk primary path.
- **Independent constraints:** analyze each constraint, then intersect feasible
  solutions.

Limit active branches to 2–3. Converge before opening another. Branching
explosion is deferred decision-making, not rigor.

## Hypothesis loop

```text
Observation → Hypothesis → Discriminating check → Result
            ↘ eliminated / refined / confirmed ↗
```

A useful check can distinguish competing hypotheses. “Read more code” is too
vague; “profile query count” can separate N+1 from a missing-index theory.
Record eliminated hypotheses so the investigation does not circle back.

## Uncertainty management

When information is missing:

1. name the uncertain proposition;
2. branch on the meaningful scenarios;
3. seek a decision safe under both;
4. otherwise identify the minimum fact required;
5. make only reversible assumptions, labelled with their rollback condition.

Do not hide uncertainty behind a confidence label. Confidence without evidence
does not satisfy the finish condition.

## Spiral refinement

Revisit a concept only when a new constraint adds depth. A productive spiral is
`initial model → constraint → refinement → interaction → integration`; an
unproductive circle repeats the same claim without new evidence.

Use a `META` checkpoint after several steps without progress:

- what is missing;
- why the current method is not resolving it;
- which source, experiment, or reframing will change that;
- whether to hand off to `vc:problem-solving`.

## Completion conditions

Finish when the selected solution is verified, all critical aspects are
addressed, branches have converged, and no hidden uncertainty blocks safe
action. A residual uncertainty may remain only when it is explicit, bounded,
and paired with a verification or rollback step.

## Anti-patterns

- premature completion before verification;
- silent revision that erases how the decision changed;
- branches compared with unequal evidence;
- context loss that ignores earlier constraints;
- thought-count inflation without new complexity;
- treating a concise reasoning trace as behavioral proof.
