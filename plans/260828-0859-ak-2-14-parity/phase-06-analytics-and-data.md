---
phase: 6
title: "analytics and data"
status: pending
priority: P1
effort: "5-8d"
dependencies: [3, 5]
---

# Phase 6: `analytics` and `data`

## Overview

The heaviest single phase: the derived SQLite index, its full lifecycle, and the
retention machinery. This is where the dual-driver storage adapter takes its
first real load, and where the **rebuild-equivalence invariant** stops being an
empty test and starts being the thing that keeps the plan honest.

## Requirements

**Functional**
- `av analytics status|enable|disable|refresh|rebuild|delete`.
- `av data status|retention|ingest`.
- A derived index over the phase-3 activity log and phase-5 session metadata.
- `rebuild` reconstructs the index from sources and produces equivalent output.

**Non-functional**
- **Opt-in.** The index is not created or populated until `enable`. Matching
  AgentKit, and correct on its own terms — this indexes the user's work.
- **Never authoritative.** Deleting the entire index and rebuilding must yield
  equivalent answers. Enforced by the standing CI invariant, not by convention.
- **Local only.** Nothing transmitted. `ak analytics --help` states the doctrine
  and it is also this plan's non-goal: *"no remote analytics are sent."*
- Mode 0600; no credentials indexed.
- `disable` stops indexed reads **without** deleting — the two are distinct verbs
  because they answer different user intents.

## Architecture

**Oracle.** `ak analytics --help`: *"Control AgentKit's private local SQLite
analytics index. Session and activity sources remain authoritative; no remote
analytics are sent."* Verbs: `status enable disable rebuild refresh delete`. On
this machine `~/.agentkit/analytics/analytics.db` is 7 MB with WAL companions,
and `ak analytics status` printed `Analytics: index (ready)`. `ak data status`
printed `classes=7 default=forever`.

That vocabulary — enable/disable/rebuild/delete, sources authoritative — is the
vocabulary of a cache, and it is exactly the doctrine phase 1's ADR adopted.

**`refresh` vs `rebuild`.** Incremental vs. full. Both must land on the same
state; that equality is itself worth asserting, because a drifting incremental
path is the classic way a cache quietly becomes authoritative.

**The invariant, now real:**

```
for each index-backed command:
  answer_with_index    = run(command)
  delete ~/.ariadnev/operational/derived/
  answer_without_index = run(command)      # falls back to source scan
  rebuild()
  answer_rebuilt       = run(command)
  assert all three equivalent
```

Note the middle step: **every index-backed command must also work with no index
at all**, by scanning sources. That is what makes the index optional rather than
load-bearing, and it is why phase 3 deliberately implemented `activity stats` as
a file scan with no index — that scan is now the reference answer.

Equivalence, not byte-identity: ordering within equal-ranked results may differ.
Define equivalence per command in its test, explicitly. A vague comparison here
is a gate that passes when it should not.

**Retention.** `data retention --class <c>` resolves, previews, and applies per
class. Applying deletes derived rows and unlinks whole activity segments — never
a partial rewrite of an append-only file. Default `forever`, matching the oracle:
retention is opt-in too.

## Related Code Files

- Create: `packages/cli/src/analytics/index-schema.ts`
- Create: `packages/cli/src/analytics/ingest.ts` + test
- Create: `packages/cli/src/analytics/rebuild.ts` + test
- Create: `packages/cli/src/analytics/lifecycle.ts` + test — enable/disable/delete state
- Create: `packages/cli/src/cli/analytics-command.ts` + test
- Create: `packages/cli/src/cli/data-command.ts` + test
- Create: `packages/cli/src/data/retention.ts` + test
- Modify: `packages/cli/src/storage/rebuild-equivalence.test.ts` — first real cases
- Modify: `packages/cli/src/cli/activity-command.ts` — read via index when enabled
- Modify: `packages/cli/src/cli/sessions-command.ts` — same
- Modify: `packages/cli/src/cli/doctor-command.ts` — index health
- Modify: `parity-manifest.json`

## Implementation Steps

1. **Oracle observation.** Capture `ak analytics <verb> --help`, `ak data <verb>
   --help`, and `--json` envelopes from `analytics status` and `data status`.
   Record the seven data classes and their default retention.
2. Add the first real cases to `rebuild-equivalence.test.ts` — **before** the
   index exists. They pass trivially (no index, source scan only). They must
   keep passing after the index lands; that is the whole design.
3. Implement `index-schema.ts` with a version and a migration path. A schema that
   cannot migrate forces a `delete` on every upgrade, which is survivable for a
   cache but a poor experience.
4. Implement `lifecycle.ts`: enable/disable/delete as explicit persisted state.
   `disable` must stop reads without removing data — asserted.
5. Implement `ingest.ts` (incremental) and `rebuild.ts` (full). Then assert the
   two converge: rebuild-then-compare against incrementally-built.
6. Wire `activity` and `sessions` reads to prefer the index when enabled and fall
   back to the source scan when not. **The fallback is not a degraded path** —
   it is the reference implementation the index is checked against.
7. Implement `av analytics` with all six verbs. `status` must work and report
   honestly when the index is absent, disabled, or corrupt — three distinct
   states, three distinct messages, because they need three distinct fixes.
8. Implement `av data status|retention|ingest`. Retention preview before apply;
   apply unlinks whole segments, never rewrites them.
9. Add the doctor check: index present / stale / corrupt / absent, reported
   distinctly.
10. Redaction test: no credential-shaped string reaches the index.
11. Measure. Index build time and size against the local corpus; if a rebuild
    takes minutes, `refresh` carries the daily load and `rebuild` becomes a
    recovery tool — record which in the phase notes.

## Success Criteria

- [ ] All six `analytics` verbs and all three `data` verbs work with `--json`
- [ ] **Delete the index → every command still answers, via source scan**
- [ ] **Rebuild → equivalent answers.** Standing CI invariant, real cases
- [ ] `refresh` and `rebuild` converge on the same state — asserted
- [ ] `disable` stops reads without deleting data
- [ ] `status` distinguishes absent / disabled / corrupt
- [ ] Index is opt-in, 0600, credential-free
- [ ] Retention applies by unlinking segments, never partial rewrites
- [ ] The compiled binary still builds and runs on every target
- [ ] `pnpm test` green

## Risk Assessment

**The index becomes authoritative.** Someone writes a value that lives only in
SQLite; a year later a rebuild silently loses it.
*Signal:* a rebuild-equivalence case fails, or a command errors with the index
deleted. *Response:* the invariant is the response, and step 2 adds the real
cases before the index exists so the gate is never shaped around the
implementation. A failing case blocks the merge; it is never relaxed to green.

**Incremental ingest drifts from full rebuild.** The subtle version of the same
failure — both paths exist, only one is exercised daily.
*Signal:* step 5's convergence assertion fails. *Response:* it runs in CI, not
once by hand. Divergence is a bug in `ingest`, never a reason to loosen the test.

**The dual-driver adapter breaks under real load.** Phase 1 proved it opens; this
phase is the first that writes meaningfully through it, under both runtimes.
*Signal:* the conformance suite passes but the real workload fails on one driver.
*Response:* the FTS5 and WAL behaviors phase 1 smoke-tested are exercised here
for real. A driver-specific failure is a phase-1 regression and goes back there —
it does not get worked around in `ingest`.

**Privacy.** An analytics index over session data is a file full of the user's
work.
*Signal:* the redaction test fires. *Response:* opt-in, 0600, local-only, and the
test is a success criterion. AgentKit ships `sessions redact` for this reason.

**Rebuild is too slow to be a real option.** If rebuilding takes minutes, "just
delete it" stops being advice a user will follow, and the index becomes
load-bearing in practice even if not in principle.
*Signal:* step 11's measurement. *Response:* record it honestly. If rebuild is
slow, `refresh` carries the load and `rebuild` is documented as recovery — but
the equivalence invariant still holds, because that is what makes the index safe
to delete at all.
