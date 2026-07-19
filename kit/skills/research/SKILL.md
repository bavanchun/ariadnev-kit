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

## Report format

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
