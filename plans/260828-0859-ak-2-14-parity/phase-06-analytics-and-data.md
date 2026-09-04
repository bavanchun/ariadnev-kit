---
phase: 6
title: "analytics and data"
status: completed
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

## Oracle observation — captured 2026-08-28 against 2.14.0

Step 1, before any code. Four findings.

### The seven data classes, and their default

`ak data status --json` on this machine:

```
session_metrics, skill_invocations, ingestion_runs,
ingestion_failures, change_log, outbox, content_shard
```

Every one `mode: "forever"`, `forever: true`. Retention is opt-in, as the phase
assumed. Each class also carries a `forecast` — one/three/twelve-month byte
projections with an explicit `"confidence": "low"` and the assumption stated in
the payload: *"linear extrapolation of recent derived-data growth; not a
guarantee"*. Every forecast read `0` here, which is what an honest extrapolation
returns when the index has no growth history yet.

### `data status --json` is not an envelope at all

It returns a **bare JSON array**. Every other command captured across phases 3,
4, 5 and this one wraps its payload in `{ schema_version, kind, data }`.

ariadnev cannot follow this: `json-envelope.test.ts` gates every top-level
command onto the shared envelope, and that gate exists because five private
envelope shapes were the thing it was written to stop. **`av data status --json`
emits the envelope**, with the class array under `data`. Recorded here as a
deliberate divergence rather than discovered during phase 13's audit.

### `analytics status --json` repeats `schema_version` inside `data`

The same duplicate phase 3 dropped on `activity` and phase 4 confirmed absent on
`projects`. Upstream is inconsistent about it between its own commands. The
decision stands: one `schema_version`, at the top.

Its `data` fields are worth matching:

```
enabled, serving_mode, health, will_auto_sync,
staleness_reason, fact_count, last_successful_at
```

`serving_mode: "index"` and `health: "ready"` are the two that carry the
lifecycle state this phase needs, and `staleness_reason` was
`"generation-mismatch"` on a live index reporting `ready` — so staleness and
health are independent axes, not one scale.

### `retention --apply` deletes rows; `ingest` opens the database

`ak data retention --help`: *"Preview is read-only; `--apply` deletes eligible
derived rows from operational.db."* And `ak data ingest`: *"Opens operational.db
and runs one ingest sweep across Claude and Codex session files."*

Both are consistent with the derived-state doctrine — the rows deleted are
derived, and the sources stay authoritative. The phase's stricter rule still
applies to activity segments: retention unlinks a whole segment or leaves it
alone, never partially rewrites an append-only file.

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

- [x] All six `analytics` verbs and all three `data` verbs work with `--json`
- [x] **Delete the index → every command still answers, via source scan**
- [x] **Rebuild → equivalent answers.** Standing CI invariant, real cases
- [x] `refresh` and `rebuild` converge on the same state — asserted
- [x] `disable` stops reads without deleting data
- [x] `status` distinguishes absent / disabled / corrupt
- [x] Index is opt-in, 0600, credential-free
- [x] Retention applies by unlinking segments, never partial rewrites
- [x] The compiled binary still builds and runs on every target
- [x] `pnpm test` green

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


## What shipped, and where it diverged

### The enable/disable setting lives outside `derived/`

The one structural decision in the phase. "The user turned analytics off" is a
choice, not a cached fact. Under `derived/` it would be erased by deleting the
index — an operation ADR 0014 advertises as always safe — silently switching
analytics back on for someone who disabled it for privacy. So the index is
deletable and the decision about it survives, asserted by a test.

### `rebuild` is `refresh` with the skip-list emptied

Not two traversals. The phase's convergence risk is that an incremental path
drifts from a full one because both exist and only one runs daily; here there is
one `ingest` and a `full` flag, so there is nothing to drift. Only the full pass
prunes sources that disappeared, because an incremental one cannot tell
"deleted" from "not looked at".

### `data status --json` emits the envelope; the captured surface emits a bare array

Recorded in the oracle observation above. `json-envelope.test.ts` gates every
top-level command onto one shape, and matching a one-off array would have meant
either exempting this command from that gate or reintroducing the inconsistency
the gate exists to prevent.

### `analytics status`'s index version is `index_schema_version`

Found by a test: passing the status object straight through as `data` put a
bare `schema_version` inside the envelope, next to the envelope's own. They are
unrelated numbers that drift independently, so the inner one is named apart.

### Four health states, not three

The phase asked for absent / disabled / corrupt. `stale` is a fourth: an index
whose schema predates this build is readable and fixed by a rebuild, and calling
it corrupt would send someone to delete a file that only needed refreshing. Each
state prints the command that fixes it.

## Measurements (step 11)

Against the real local corpus — 30 Claude Code project directories and the Codex
rollout tree — on the **compiled binary**:

| | |
|---|---|
| sources | 217 |
| facts indexed | 649 |
| **rebuild** | **1,183 ms** |
| **refresh, nothing changed** | **4 ms** |
| index size | 328 KB |

**Rebuild is a daily-viable operation, not a recovery tool.** The phase's risk
item asked which it would be; at ~1.2 s "just delete it and rebuild" is advice a
user will actually follow, so the index stays genuinely optional rather than
load-bearing in practice. `refresh` is ~295× faster still and carries the
routine load.

### The index was world-readable, and is not now

Measured, not assumed: SQLite creates its own file, so it landed at 0644 under
the default umask. The index summarises the user's sessions. It and its WAL
companions are now chmod 0600 after every open — after, because `-wal` and
`-shm` are created by SQLite on its own schedule rather than once at creation.

## Verification

- 1746 tests passing; brand-drift, lint, typecheck and `validate --check
  --strict` all clean.
- **The invariant on real data, through the compiled binary:** `sessions stats`
  returned byte-identical output with the index served, with the index deleted,
  and after a rebuild — over a 70,329-message corpus.
- Twelve index-vs-scan agreement cases in the suite (four metrics × three
  dimensions), plus cases for falling back when the index is deleted mid-life
  and when analytics is disabled.
- `data retention` previews and applies through one body, so `--apply` cannot
  remove something the preview did not name; a test asserts no session file is
  touched by any class.
