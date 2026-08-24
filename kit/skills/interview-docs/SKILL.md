---
name: av:interview-docs
description: "Use when extracting a user's vision and decisions into README, ADR, strategy, principles, or another durable structured document through an interview."
user-invocable: true
when_to_use: Invoke when the user's answers, not AI proposals or code inspection, should become the document.
category: utilities
keywords: [interview, documentation, adr, strategy, vision]
license: MIT
argument-hint: "<vision | document-path | topic>"
metadata:
  origin: ported
  author: upstream
  version: "1.0.0"
  upstream: "Pinned MIT source archive: brain-to-docs and interview-style-doc-building@ce70edaa26247b84c2b9491a0cdb4964f65cf3a5"
---

# Interview Docs

Turn the user's own knowledge, taste, and decisions into maintained documents.
This skill does not invent content, prioritize an unordered user list, or derive
documentation from source code.

## Select a Mode

- Use vision mode for project vision, README direction, and ADR decisions.
- Use structured-doc mode for one user-authored document such as principles,
  strategy, reviews, or a framework.
- If the request fits both modes, ask one concise question before writing.

## Vision Mode

1. Read README.md and the existing docs/adr directory before asking anything.
2. Ask a batch of five high-variety questions unless the user requests another
   number or a focused area.
3. After every answer, re-read the affected document and patch the user’s words
   into README.md or an ADR before processing the next answer.
4. Keep README.md to vision. Put decisions in short numbered ADR files with
   Status, Context, Decision, and Consequences.
5. Continue until the user ends the interview. Keep replies concise and in
   plain English.

## Structured-Doc Mode

1. Read nearby documents and create a minimal skeleton once.
2. Ask exactly one specific, open question.
3. Wait for the answer, re-read the target section, and patch the document
   before asking the next question.
4. Treat a user-provided list as an unordered set. Ask explicitly before
   assigning rank, sequence, or priority.
5. Preserve user wording and edits. Never overwrite an existing document or
   add speculative sections.

## Boundaries and Safety

- Use av-brainstorm when the AI should propose options; use av-docs when
  documentation should be derived from code.
- Do not write secrets, personal data, or credentials into docs.
- Never use an ADR to make an unapproved architectural decision. Record only a
  decision the user has explicitly made.

## Output format

Return the interview mode, questions answered, document paths/sections updated,
decisions recorded verbatim or faithfully paraphrased, and unresolved questions.

## Quality gates

- [ ] Mode and target documents were selected from the user's intent.
- [ ] Existing documents were read before edits and after each user answer.
- [ ] No priority, sequence, rationale, or decision was invented.
- [ ] README and ADR content stay in their respective authority boundaries.
- [ ] User wording and edits are preserved; sensitive data is excluded.
- [ ] Every recorded decision is explicitly attributable to the user.

## Workflow position

**Typically follows:** a request to externalize user knowledge rather than infer
it from code.

**Typically precedes:** `av:plan` when approved decisions now need execution.

**Related:** `av:brainstorm` when the agent should propose options and `av:docs`
when documentation should be derived from repository evidence.
