# 0011 — Upstream is a one-time fork, not a tracked branch

- Status: accepted. Amended 2026-08-28 by
  [0017](./0017-parity-amends-the-one-time-fork-decision.md) — the core decision
  (no upstream ref, no re-sync) stands; a named-version *behavioral* parity
  target now exists, pursued by reimplementation.
- Date: 2026-08-15

## Context

ADR 0008 settled how ported content is judged. It did not settle what happens
when the kit this content came from releases its next version.

The question is not theoretical. The kit is 1454 files against roughly 24k lines
of engine code this project actually wrote; by file count the repository is
mostly someone else's writing. Whatever posture is taken toward upstream governs
the larger half of the repository.

Three postures were available:

| Posture | What it costs to hold |
|---|---|
| One-time fork | Nothing ongoing |
| Occasional cherry-pick | A judgement call per upstream release |
| Tracked re-sync | A recorded upstream ref, a clean ported/authored boundary maintained forever, and a rebase whenever upstream moves |

The machinery for the third already half-exists: `metadata.origin: ported` marks
ported skills and the absence of the `av-` prefix marks ported agents. What does
not exist is any record of *which upstream commit* the copy was taken from. Six
months from now there would be nothing to diff against.

This is a private tool with one maintainer and no external users.

## Decision

**The copy is final. Upstream is not a source this project tracks.**

No upstream ref is recorded, and none should be added. Recording one is the first
step of the posture this ADR declines, and a ref that exists but is never used
is worse than no ref: it implies a sync path that nobody maintains.

The markers from ADR 0008 stay, but their meaning narrows. They are provenance —
a true statement about where a file came from and which authoring rules apply to
it. They are not the input to a synchronisation mechanism, because there is none.

If a specific upstream skill is ever wanted, port *that skill*, by hand, as new
content. That is an ordinary content change, not a sync.

## Consequences

Improvements made upstream after 2.12.0 do not arrive. That is the accepted cost,
and it is the whole cost — there is no maintenance burden to carry in exchange.

`ariadnev validate` continues to report the ported corpus under ADR 0008's split
rules. Nothing about validation changes; this ADR only removes a future
obligation that was never written down but was implied by the markers.

The corpus is free to drift. A ported file that gets rewritten to fit this
project's needs should lose its marker, per ADR 0008's own revisiting clause,
and there is no longer any reason to preserve a file in its original shape purely
to keep a diff clean.

## Revisiting

If this project ever gains users who expect upstream's newer content, the
calculation changes — but the answer is still not "turn on re-sync". It would be
to port the specific wanted content by hand, and only then, if that happens
repeatedly and mechanically, to ask whether a real sync path is worth building
from what is by then a known, concrete need.
