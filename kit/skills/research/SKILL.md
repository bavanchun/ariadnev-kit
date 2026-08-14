---
name: vc:research
description: Research technologies, libraries, and best practices with sourced findings. Use for tech evaluation, solution comparison, or gathering current docs before building.
user-invocable: true
argument-hint: "<topic or technology to research>"
metadata:
  author: vchun
  version: "1.0.0"
---

# Research

Produce a decision-ready research report: current facts, real sources, and a
recommendation scored against this project's constraints — not a generic
listicle.

Handles: technology evaluation, library comparison, best-practice surveys,
"how do others solve X".
Does not handle: deciding architecture (`vc:brainstorm` consumes this),
implementing (`vc:cook`).

## Rules

1. **Recency beats memory.** For anything that moves (frameworks, APIs,
   pricing, versions), verify against current documentation or the source
   repo; note the date/version checked. Training-data recall alone is not a
   finding.
2. **Project context in.** Read enough of the repo to weight findings by
   fit: stack, constraints, team conventions. A "best" library that fights
   the existing stack is not best here.
3. **Primary sources first.** Official docs, changelogs, source code, issue
   trackers — then community posts as color, never as sole evidence.
4. **Contradictions are findings.** When sources disagree, report the
   disagreement and which one you weighted, and why.

## Workflow

1. Frame: what decision will this research feed? 1-3 questions max.
2. Gather: docs lookups, targeted web searches, source reading. Track
   (claim, source, date) as you go.
3. Evaluate candidates against project-fit criteria (maintenance health,
   API stability, license, bundle/runtime cost, learning curve).
4. Write the report to
   `plans/reports/research-{yymmdd-hhmm}-{slug}-report.md`; summarize
   verbally with the recommendation up front.

## Output format

```markdown
# Research: <topic>

## Question
What decision this feeds.

## Recommendation
One paragraph, committed (conditions that would change it noted).

## Findings
Per candidate/claim: evidence + source + checked date/version.

## Comparison
| Option | Fit | Maturity | Cost | Notes |

## Sources
Links, versions, dates.

## Unresolved questions
Or "none".
```

When the recommendation implies building, name the proof layer the eventual
change will need (`unit`/`integration`/`e2e`/`platform`, see
`../cook/references/risk-lanes.md`) — e.g. "adopting library X needs an
integration proof against the real API, not just a unit mock". This hands the
downstream `vc:plan`/`vc:cook` a proof expectation instead of a bare verdict.

## Quality gates

Before delivering, confirm:

1. Every moving-target claim (version, API, pricing) carries a checked
   date/version — no un-dated "X supports Y".
2. Every important claim has ≥2 independent sources, or is flagged as
   single-source.
3. Findings are weighted by *this* project's stack and constraints, not ranked
   in the abstract.
4. Source disagreements are reported, not silently resolved to the tidier answer.
5. The recommendation is committed (names the condition that flips it), not an
   "it depends" survey.

## Workflow position

**Typically follows:** `vc:ask` (a question grew into "I need to evaluate
options"), the research phase of `vc:brainstorm`.
**Typically precedes:** `vc:brainstorm` (consumes findings to pick an approach),
`vc:plan` (turns the chosen tech into phases).
**Related:** `vc:docs-seeker` — use it for pinpoint "what's the API for X in the
version we already use"; use `vc:research` for open evaluation across options.
