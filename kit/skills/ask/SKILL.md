---
name: vc:ask
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
4. If action follows, point to it: `vc:brainstorm` (open-ended design),
   `vc:plan` (agreed multi-phase work), `vc:cook` (direct change),
   `vc:fix` (there is a concrete bug).

## Output format

- **Verdict** — one or two sentences.
- **Why** — the load-bearing reasons, with file/doc citations.
- **Trade-offs / when not to** — what this costs, when to choose otherwise.
- **Next step** — a skill handoff or "none".
