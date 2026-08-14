---
name: av:ask
description: Answer technical and architecture questions with honest trade-offs. Use for design decisions, best-practice checks, or solution comparisons — analysis only, no code changes.
user-invocable: true
argument-hint: "<question>"
metadata:
  author: vchun
  version: "1.0.0"
---

# Ask

Expert answer mode: analysis only. This skill never edits code, config, or
docs — if the answer implies work, it names the follow-up skill instead.

## Rules

1. **Ground in the repo.** When the question concerns this codebase, read the
   relevant files before answering; cite paths and line refs. Guessing about
   code you could have opened is a failure.
2. **Answer first.** Lead with the direct answer or recommendation, then the
   reasoning. No "it depends" endings — pick, and state the conditions that
   would flip the choice.
3. **Honest trade-offs.** Name the costs of your recommendation, not only the
   benefits. If the user's premise is wrong, say so before answering the
   literal question.
4. **Right-size the answer.** One-line question → one-paragraph answer.
   Architecture comparison → short structured sections or a table. Never pad.
5. **Current facts.** For fast-moving libraries/APIs, verify against current
   docs rather than trusting memory; say when you verified.

## Workflow

1. Classify: conceptual question | codebase question | comparison | review of
   an idea.
2. Gather the minimum evidence (files, docs) that the answer depends on.
3. Answer: verdict → reasoning → trade-offs → conditions that change it.
4. If action follows, point to it: `av:brainstorm` (open-ended design),
   `av:plan` (agreed multi-phase work), `av:cook` (direct change),
   `av:fix` (there is a concrete bug).

## Output format

- **Verdict** — one or two sentences.
- **Why** — the load-bearing reasons, with file/doc citations.
- **Trade-offs / when not to** — what this costs, when to choose otherwise.
- **Next step** — a skill handoff or "none".

Proof/risk: N/A — analysis only, this skill changes nothing. When the answer
recommends work, the proof burden moves to the follow-up skill (`av:cook`,
`av:fix`), which classifies its own risk lane.

## Quality gates

Before returning, confirm:

1. The verdict answers the question actually asked — not an adjacent one that
   was easier to answer.
2. Every claim about this codebase cites a path (or admits it wasn't read).
   No confident assertions about code you could have opened.
3. The trade-off / "when not to" is present and specific — a recommendation
   with only upsides is unfinished.
4. Fast-moving library or API facts are verified against current docs, with the
   check noted; otherwise flagged as from-memory.
5. The answer is right-sized: no headers on a one-line question, no one-liner on
   an architecture comparison.

## Workflow position

**Typically follows:** a question mid-task, or `av:scout` (located the code, now
decide what to do with it).
**Typically precedes:** `av:brainstorm` (open-ended design), `av:plan` (agreed
multi-phase work), `av:cook` (direct change), `av:fix` (concrete bug).
**Related:** `av:brainstorm` — use it instead when the question is "which
approach", needs a design debate, or has no single right answer.
