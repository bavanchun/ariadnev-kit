# AgentKit 2.14.0 parity plan reaches its stopping line

**Date**: 2026-08-29 13:42
**Component**: parity
**Status**: Ongoing

## What happened

Phases 11, 12 and 13 shipped in one session. Ratchet 8 to 0.

Phase 11 (#96): av api and av gui — a local read-only HTTP view of the
operational data plane, no LLM proxy. Every data route returns byte-for-byte
what the matching --json command prints, because it calls that function.
Binary verification caught --auth-token being silently dropped by the detach, so
the daemon came up unauthenticated while the parent had validated a token the
child never received.

Phase 12 (#98): av watch and av orchestrate. ADR 0018 was committed before any
watch code and separates the five defences that hold whatever the model decides
from the one that is an instruction to a model about text. Preview is enforced
by construction: the sweep can only post when handed a post function, and a
preview is not given one. Three injection fixtures, including a body carrying a
correctly guessed nonce. Binary verification caught a running preview-mode
watcher being invisible to status, because status listed only the allowlist.

Phase 13 (#99): partial. Its step 1 is a stop, not a warning — skill import waits
on 260822-1407 phases 4 and 5 being released, and the latest tag is a beta. So
steps 2-6 did not start and the release is the maintainer's. What shipped is the
four vendor-facing commands and the audit.

THE AUDIT IS THE RESULT WORTH KEEPING. The name ratchet reached zero, and phase 1
wrote down in advance that this would be necessary and not sufficient. Comparing
the captured subcommand lists against the live surface finds 22 differences, nine
of them real gaps: plan add-phase/create/kanban/migrate/parse/validate, mcp link,
migrate prefs/rollback. A naive comparison would have reported fifteen more that
do not exist, because backups and skill take their verb as a positional argument
and Commander reports no subcommands for those.

Binary verification has now found a defect in every phase of this plan. In phase
13 it was av changelog rendering GitHub's zero date as 0001-01-01 — the same
sentinel-shaped defect phase 11 had explicitly rejected two phases earlier.
