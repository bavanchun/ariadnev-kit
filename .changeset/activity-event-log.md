---
"ariadnev": minor
---

Add `av activity list | tail | stats` over a new append-only event log.

Events are JSONL under `~/.ariadnev/operational/activity/`, one file per UTC day so
retention is a file unlink rather than a rewrite. Every event carries a monotonic,
lexicographically sortable ID, which is what `list --since <cursor>` reads — a poller
never replays or skips. `tail` follows that cursor rather than a file handle, so it keeps
streaming across the midnight segment rollover.

`stats` aggregates by kind, runtime and kit over a `--window` (`24h`, `7d`, `2w`) and
reports coverage: how many records it read and how many were unreadable.

Install, update, and workflow execution now emit events. Emission is fire-and-forget —
a broken log never fails the command it observes — and event fields are an allowlist, so
a caller's credentials cannot reach disk.
