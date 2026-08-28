# 0014. Derived state is never authoritative

Date: 2026-08-28
Status: Accepted

## Context

Plan `260828-0859-ak-2-14-parity` adds an operational data plane: an activity
event log, a projects registry, an analytics index, and per-project content
search. Roughly ten new commands read or write it. The obvious implementation is
a SQLite database that owns all of it, and that is the decision this ADR exists
to prevent, because it is very hard to reverse once commands start depending on
it.

The upstream being reimplemented already answered this, and its answer is worth
copying. `ak analytics --help` states plainly: *"Session and activity sources
remain authoritative; no remote analytics are sent."* Its lifecycle verbs for the
analytics store are `enable`, `disable`, `rebuild`, `delete` — the vocabulary of
a cache, not of a system of record. Inspecting `~/.agentkit/` on 2026-08-28
matched that: `projects.json` is plain JSON with a lockfile, `backups/` is
directories with manifests, `sessions list` reads Claude Code's own JSONL files
and keeps no store at all, and the two SQLite files present in normal operation
(`plans/plans.db`, `analytics/analytics.db`) are both reconstructible.

A single-binary CLI that a user installs with `curl | bash` has a specific
failure profile. A corrupt cache should be a deleted directory, not a support
request. That is only true if nothing is lost by deleting it.

## Decision

**Files are authoritative. SQLite is a disposable index, rebuildable at any time
from the files.**

Concretely, under `~/.ariadnev/operational/`:

- Authoritative sources are files, and they are append-only or atomically
  replaced: the activity event log, the projects registry, ownership manifests.
- Every derived artifact lives under a `derived/` subdirectory that can be
  deleted wholesale at any moment, and the next command rebuilds what it needs.
- No command may store the only copy of anything in the index.

This is enforced by a standing CI invariant rather than by convention: a
rebuild-equivalence test that deletes the derived state, rebuilds it, and asserts
equivalent output. The test is written before the first command that would use
the index, over an empty set of cases, and gains a case per command. A gate added
afterwards gets shaped around whatever was already built, which is how this kind
of rule quietly stops meaning anything.

## Consequences

Some queries are slower than they would be with an authoritative relational
store, because the index can always be reconstructed and therefore may not hold
anything unique. That is the accepted cost.

Backups get simpler and smaller: snapshots capture authoritative sources only,
and prove the rest by rebuilding it. A snapshot that included a multi-megabyte
reproducible cache would be shipping dead weight and would quietly make the cache
load-bearing again.

Storage-substrate problems become recoverable rather than fatal. If the index
cannot be built on some platform, the fallback is a slower access path over the
same files, not a lost feature and not a lost user's data.

## Revisiting

If a future feature genuinely needs state that cannot be derived from files, that
feature does not get to quietly break this rule. It adds a new *authoritative*
file-backed source, and the index continues to be derived from it. If the day
comes that this is impossible, the honest move is to amend this ADR with the
concrete case rather than to make an exception nobody wrote down.
