# 0015. `backups create` is reinstated, on new evidence

Date: 2026-08-28
Status: Accepted

## Context

This ADR reverses a verified decision, so it states the original verdict, the new
fact, and why the fact changes the conclusion. The repository's own review rules
require exactly that: a decision verified by source, tests, or an empirical check
is reversed only when new evidence arrives or the context changes — never because
a later reviewer finds it uncomfortable.

**The original verdict**, recorded as a non-goal in plan `260822-1407` after its
red team:

> `av backups create`. AgentKit's `create` snapshots a database; ariadnev has
> none. Porting it would ship dead surface.

That reasoning was correct when written. `av backups` had `list`, `show`,
`prune`, `restore`, and `verify` — all of them operating on backups produced as a
side effect of installs. There was no operational state to snapshot, so `create`
would have been a command that ran, reported success, and captured nothing worth
capturing.

**The new fact.** The verdict is a claim about *the absence of a subject*, not a
claim about databases. Plan `260828-0859-ak-2-14-parity` creates the subject: an
append-only activity event log, a projects registry with ownership manifests, an
analytics index, and content-search shards. Two of those are authoritative and
unreproducible — losing the activity log loses history that cannot be
recomputed, and losing an ownership manifest orphans an install.

The context changed. The reasoning did not have to be wrong for the conclusion to
stop following from it.

## Decision

**`av backups create` is reinstated, and it snapshots authoritative state only.**

| State | In a snapshot | Why |
|---|---|---|
| activity event log | yes | authoritative, unreproducible |
| projects registry | yes | authoritative |
| ownership manifests | yes | authoritative; losing one orphans an install |
| analytics index | no | derived — rebuild it |
| content-search shards | no | derived — rebuild them |

The exclusions follow from [0014](./0014-derived-state-is-never-authoritative.md)
and are asserted in both directions: a test proves every authoritative source is
present *and* that no derived file is. A snapshot that quietly grew to include
the index would be the dead surface the original verdict named, merely relocated,
and it would make the cache load-bearing again by the back door.

`backups verify --rebuild` covers the derived half by proving it can be
reconstructed, reusing the rebuild-equivalence machinery rather than a second
comparison implementation.

## Consequences

The reversal is narrow, and deliberately so. It licenses `create` over
authoritative operational state; it does not license snapshotting everything, and
it does not reopen any other non-goal in `260822-1407`.

Snapshots must be internally consistent. The activity log is captured
segment-wise — closed segments are immutable and the current one is copied once —
rather than by copying a file that is being appended to.

If a restore without the derived index turns out to be painful in practice, the
fix is a faster rebuild, not a fatter snapshot.

## Revisiting

If the operational data plane is ever cut back to nothing authoritative, the
original verdict applies again unchanged and `create` should be removed rather
than kept for symmetry with upstream. The command exists because there is
something to snapshot, not because AgentKit has a command of that name.
