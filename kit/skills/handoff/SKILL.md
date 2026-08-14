---
name: av:handoff
description: Compact the current session into a redacted, paste-ready handoff of decisions, state, blockers, and next steps. Use when ending a session or passing work to a fresh agent.
user-invocable: true
argument-hint: "[next-session focus]"
metadata:
  author: vchun
  version: "1.0.0"
  category: support
---

# Handoff

Compress the *current conversation* into a factual handoff a fresh agent can act
on with minimal rediscovery. Preserve state and rationale — not a command list.

Distinct from its neighbours: `av:pm` reports plan-file truth (derived from
plans, not the chat); `av:journal` is a backward-looking post-mortem. Handoff is
the forward-looking snapshot of *this session's* live state.

## Workflow

1. **Read first.** Project instructions and any in-flight plans; the previous
   handoff for the same focus if one exists. Ground the handoff in the repo, not
   memory.
2. **Gather** goal, current state, key decisions + *why*, rejected approaches and
   traps, verification status (what is proven vs assumed), and pointers to source
   artifacts (plans, commits, diffs, tests).
3. **Reference, don't copy.** Link plans/commits/PRs instead of pasting them.
4. **Redact** secrets, tokens, passwords, private URLs, customer and personal
   data — see `references/handoff-template.md` for the redaction checklist and the
   full section template. Name only the safe *location* of credentials.
5. **Emit** one fenced Markdown block, and save the same content to
   `plans/reports/handoff-YYYYMMDD-HHmm-<slug>.md`. No plans dir → ask the user
   where to write it first.

## Output format

One fenced Markdown block following the section order in
`references/handoff-template.md`: title + generated line, then Goal · Why It
Matters · Current State · Key Decisions and Why · Rejected Approaches and Traps ·
Verification Status · Relevant Files and Pointers · Open Work and Dependencies.
End with a short fresh-agent prompt telling the next agent to read the listed
files and verify the handoff against the repo before acting.

Proof/risk: N/A — produces a document, changes no code.

## Quality gates

Before returning, confirm:
- No secret, token, private URL, or personal datum survives — redaction pass done.
- Open work is described as *state and dependencies*, not bare imperatives.
- Every claim of "done/verified" says how it was proven, or is marked unverified.
- Decisions carry their *why*; rejected approaches carry the trap that killed them.
- The block is paste-ready and also saved to the reports path (or a user-agreed one).

## Workflow position

**Typically follows:** any session end, or a context switch mid-task
**Typically precedes:** a fresh agent session or a teammate picking the work up
**Related:** `av:pm` (plan-file status, not chat state), `av:journal` (retrospective, not forward handoff)

