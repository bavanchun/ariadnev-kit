---
name: vc:brainstorm
description: Explore solutions with trade-off analysis before building. Use for ideation, architecture decisions, feature exploration, or when requirements are fuzzy.
user-invocable: true
argument-hint: "<topic or problem statement>"
metadata:
  author: vchun
  version: "1.0.0"
---

# Brainstorm

Turn a fuzzy idea into a decided approach. This skill produces a short written
report with 2-3 evaluated options and one recommendation — it never produces
implementation code.

Handles: solution ideation, architecture choices, build-vs-buy calls,
feasibility checks, scope shaping.
Does not handle: implementation (hand off to `vc:cook`), detailed phased
planning (hand off to `vc:plan`).

## Hard rules

1. **Scout before opinions.** Never propose approaches for a codebase you have
   not looked at. Run the scout step first, every time.
2. **Present before asking.** Each question to the user must carry your
   findings and a recommended option — never ask open-ended questions the
   repo could have answered.
3. **Problem first.** If the user arrives with a solution ("let's add Redis"),
   restate the underlying problem and validate that the solution fits before
   evaluating variants of it.
4. **Honesty over agreement.** If every option is bad, or the best option is
   "do nothing", say so plainly.

## Workflow

1. **Scout** — inspect the repo: project type, existing modules touching the
   topic, current patterns, in-flight plans in `plans/`, related docs in
   `docs/`. Summarize in 3-6 bullets to the user.
2. **Frame** — state the problem in one sentence and the constraints you
   found (stack, contracts, deadlines). Confirm with the user via
   `AskUserQuestion` only for what the repo cannot answer.
3. **Generate** — develop 2-3 genuinely different approaches. For each:
   what it is, effort, risks, what breaks, what it wins.
4. **Compare** — one table: approach × (pros, cons, effort, risk). Pick a
   recommendation and defend it in 2-3 sentences.
5. **Decide** — let the user choose via `AskUserQuestion` (recommended option
   first). Record the decision.
6. **Report** — write the report (format below) to
   `plans/reports/brainstorm-{yymmdd-hhmm}-{slug}-report.md`.
7. **Handoff** — offer the next step: `vc:plan` for multi-phase work,
   `vc:cook` for small direct implementation.

## Report format

```markdown
# Brainstorm: <topic>

## Problem statement
One paragraph. What hurts, for whom, why now.

## Evidence
What the scout found: files, patterns, usage data, constraints.

## Approaches considered
| # | Approach | Pros | Cons | Effort | Verdict |

## Decision
Chosen approach + why, user-confirmed.

## Risks
Numbered, each with a mitigation.

## Next steps
Concrete handoff (plan phases or direct cook scope).

## Unresolved questions
List them, or "none".
```

## Quality gates

- [ ] Scout summary shown to the user before the first question
- [ ] Every approach names concrete files/modules it would touch
- [ ] Recommendation exists — never end with "it depends"
- [ ] Report saved under `plans/reports/` with the naming pattern
- [ ] User decision recorded, not assumed
