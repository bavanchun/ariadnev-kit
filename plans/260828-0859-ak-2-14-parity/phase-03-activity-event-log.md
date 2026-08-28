---
phase: 3
title: "Activity event log"
status: pending
priority: P1
effort: "2-4d"
dependencies: [1, 2]
---

# Phase 3: Activity event log

## Overview

The data plane's first authoritative source, and its proof of life. An
append-only event log plus `av activity list|tail|stats`, with the *existing*
install, update, and workflow paths instrumented to emit events — so the log has
a real producer and a real consumer before anything else depends on it.

Everything derived in phases 6-8 is derived from here. If the append-only shape
is wrong, it is much cheaper to find out now.

## Requirements

**Functional**
- `av activity list [--limit N] [--since <cursor>]` — finite snapshot, newest
  first, default limit 100.
- `av activity tail` — live stream of new events only.
- `av activity stats [--window 7d] [--kit <id>] [--runtime <name>]` — usage
  aggregates by coding agent, with a `coverage` block naming what was read and
  what was skipped.
- Install, update, and workflow paths emit events.
- All three support `--json` with a stable versioned envelope.

**Non-functional**
- **Append-only.** Events are never mutated or deleted in place; retention is a
  separate, explicit sweep (phase 6's `data retention`).
- The log is authoritative — it is a file, not an index. No SQLite here.
- Emission never fails the operation it observes. A broken log must not break an
  install.
- Mode 0600. No credentials, no command arguments that could contain secrets.
- Bounded: a session that emits thousands of events must not produce an unbounded
  file or an unbounded read.
- **Every event carries a monotonic, total, lexicographically sortable `id`.**
  `--since` is a cursor over it. Timestamps cannot serve: they collide within a
  millisecond and move backwards when the wall clock is adjusted.

## Oracle observation — captured 2026-08-28 against 2.14.0

Step 1, done before any code. Three things here were **not** in this phase as
written, and two of them change the data shape rather than the surface.

### `list`

```
Usage: ak activity list [flags]
  --limit int      Maximum events to return (default 100)
  --since string   Return events with IDs greater than this cursor
  --json
Exit status: 0 success, 1 command failure, 2 invalid flags or arguments
```

**`--since` is a cursor over event IDs, not a timestamp.** This phase planned a
timestamped JSONL line and nothing else. A cursor needs an identifier that is
**monotonic and total** — two events in the same millisecond must still order,
and the ordering must survive a day-segment rollover. So each event carries an
`id` that sorts lexicographically in emission order, and `list --since <id>`
means strictly-greater-than. Without deciding this now, `--since` either cannot
be built or gets bolted on as a second identity later.

Timestamps alone cannot do this job: they collide under load, and they are
wall-clock, so a clock adjustment can move them backwards.

### `tail`

```
Usage: ak activity tail [flags]
  --json
Effects: Read-only. Streams local activity events.
Output:  Streams events as they occur until interrupted.
```

No `--since`, no `--limit`. `tail` is new events only.

### `stats`

```
Usage: ak activity stats [flags]
  --kit string       Filter by kit ID
  --runtime string   Filter by coding-agent runtime (codex, claude-code, opencode)
  --window string    Lookback window (24h, 7d, 2w) (default "7d")
  --json
```

Two filters this phase did not list, and a window grammar to match: `24h`,
`7d`, `2w`.

### The envelopes

```json
{ "schema_version": 1, "kind": "activity.list",
  "data": { "events": [], "schema_version": 1, "total": 0 } }
```

This is **the shared envelope**, dot-namespaced — so `activity` uses
`jsonEnvelope()` and does not join `LEGACY_JSON_COMMANDS`. The inner
`schema_version` is a second, payload-level version and is deliberate: the
envelope and the payload move independently.

`stats` carries a `coverage` block that reports what it could and could not read:

```json
{ "rows": [], "total": 0,
  "coverage": {
    "sources": [ { "source": "activitylog", "parsed": 0, "skipped": 0 },
                 { "source": "claude-session", "parsed": 0, "skipped": 0 } ],
    "no_parser_runtimes": ["codex", "opencode"] },
  "schema_version": 1 }
```

Worth copying, and worth trimming. **Copy** the honesty: an aggregate that
cannot say what it failed to read is an aggregate that silently under-reports.
**Trim** the second source — `claude-session` is the sessions reader, which is
phase 5. Phase 3's `stats` reads its own activity log and reports exactly that
one source, so the block starts truthful and grows a source in phase 5 rather
than lying about one it does not have.

### Empty state

```
$ ak activity list
[i] No activity events found.
$ echo $?
0
```

Clean message, exit 0, as the phase already assumed.

## Architecture

**Oracle.** `ak activity --help` describes exactly three verbs: *"Use list for a
finite snapshot, tail for a live stream, and stats for skill usage aggregates."*
On this machine `ak activity list` printed `No activity events found` — so the
empty state is a clean message, not an error, and ariadnev should match that.

**Shape: JSONL, one event per line, under `~/.ariadnev/operational/activity/`.**
Chosen over SQLite deliberately — this is the authoritative source, and phase 1's
ADR says authoritative state lives in files. JSONL also makes `tail` trivial and
makes the file readable when the CLI cannot run, which is exactly when a user
most needs it.

```
{ "v": 1, "ts": "...", "kind": "install.completed",
  "agent": "claude-code", "project": "<id>", "detail": { … } }
```

Segmented by day (`activity-YYYYMMDD.jsonl`) so retention is a file unlink rather
than a rewrite — an append-only log that has to be rewritten to prune is not
really append-only.

**Emission must be fire-and-forget.** Wrap every emit so a failure logs and
returns. The rule is stated in the phase-1 ADR and enforced here by test: an
install with an unwritable log directory still succeeds.

**`stats` is the one aggregate.** Reading every segment in a window is fine at
this scale and keeps phase 3 free of the index entirely. Phase 6 may later back
it with the derived store — and the rebuild-equivalence invariant then requires
that the indexed answer equals the file-scan answer, which is precisely the
property worth asserting.

## Related Code Files

- Create: `packages/cli/src/activity/event-log.ts` + test — append, read, segment
- Create: `packages/cli/src/activity/event-types.ts` — the versioned event union
- Create: `packages/cli/src/activity/emit.ts` + test — the fire-and-forget wrapper
- Create: `packages/cli/src/cli/activity-command.ts` + test
- Modify: `packages/cli/src/cli/register-maintenance-commands.ts`
- Modify: `packages/cli/src/install/install-execute.ts` — emit
- Modify: `packages/cli/src/cli/update-command.ts` — emit
- Modify: `packages/cli/src/cli/register-harness-commands.ts` — emit
- Modify: `packages/cli/src/storage/operational-paths.ts` — activity root
- Modify: `parity-manifest.json`

## Implementation Steps

1. **Oracle observation.** Capture `ak activity list|tail|stats --help` and a
   sample `--json` envelope from each into this phase file. That capture is the
   behavioral contract the tests encode — not a recollection of it.
2. Failing tests first for `event-log.ts`: append, read-back, day segmentation,
   and concurrent appends from two processes not interleaving a partial line.
3. Implement the log. Append with `O_APPEND` and a single write per event. Be
   precise about what that buys: `O_APPEND` guarantees atomic *offset*
   advancement, not atomic *content* for a write exceeding the filesystem's
   atomic-write size, and guarantees nothing on NFS. So **cap the serialized
   event size** (the `detail` field is otherwise unbounded) and state the
   local-filesystem assumption in the module header. Without the cap, the
   "concurrent appends never tear a line" criterion asserts something the
   mechanism does not provide.
4. Implement `emit.ts` as fire-and-forget. Write the test that asserts an install
   succeeds with an unwritable log directory **before** the wrapper, so the
   property is proven rather than assumed.
5. Instrument install, update, and workflow. Keep the event vocabulary small and
   closed — a `kind` union, not free strings, so `stats` can group without
   guessing and a typo is a type error.
6. Implement `av activity list` with a bounded default and `--limit`.
7. Implement `tail`: follow the current segment, handle the midnight rollover to
   a new file. The rollover is the case that will be missed if it is not written
   down here.
8. Implement `stats --window`: scan segments in range, aggregate by agent and
   kind. No index.
9. Assert the empty state prints a clean message and exits 0, matching the oracle.
10. Redaction test: no event body contains a credential-shaped string.

## Success Criteria

- [ ] `av activity list|tail|stats` all work, with `--json` envelopes
- [ ] `list --since <id>` returns strictly later events, across a day rollover
- [ ] `stats --kit` and `--runtime` filter, and `--window` parses `24h|7d|2w`
- [ ] `stats` reports coverage honestly — one source in this phase, not two
- [ ] Empty state is a clean message, exit 0
- [ ] Install, update, and workflow emit events
- [ ] An install with an unwritable log directory still succeeds — asserted
- [ ] Concurrent appends never tear a line — asserted
- [ ] `tail` survives the midnight segment rollover
- [ ] Log files are 0600 and contain no credentials
- [ ] `pnpm test` green

## Risk Assessment

**Instrumentation breaks the operation it observes.** The classic telemetry
failure: an install fails because a log write failed.
*Signal:* any test where an emit failure propagates.
*Response:* step 4 writes that assertion before the wrapper exists. Emission is
fire-and-forget, always.

**The log grows unbounded.** An agent-driven tool can emit a great many events.
*Signal:* segment sizes growing without a ceiling in normal use.
*Response:* day segmentation now makes retention a file unlink; the retention
sweep itself is phase 6's `data retention`. Phase 3 must not paint that into a
corner by writing one giant file.

**Events capture secrets.** Command arguments and environment values are exactly
where credentials live.
*Signal:* the redaction test finds a token-shaped string.
*Response:* the event union is closed and its `detail` fields are explicit — no
"just serialize the options object". Reviewed per event kind.

**`tail` misses the rollover.** Following a file by handle silently stops at
midnight.
*Signal:* a `tail` that goes quiet after a date change.
*Response:* named as step 7 with its own test, because this is the bug that
otherwise ships and is found by a user at 00:01.
