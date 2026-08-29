# Local read-only API daemon and gui

**Date**: 2026-08-29 12:27
**Component**: api
**Status**: Resolved

## What happened

Phase 11 of the AgentKit 2.14.0 parity plan. Ratchet 8 to 6.

`av api start|status|stop` runs a daemon on 127.0.0.1:8767 serving health,
status, version, a dashboard page, and read-only views of activity, projects,
sessions and analytics. `av gui` starts it if needed and opens it. No LLM proxy:
upstream's proxy routes model traffic through a vendor account reached by
`login`, a stated non-goal.

Every data route returns byte-for-byte what the matching `av … --json` command
prints, because it calls that function. No query layer means a route cannot
drift from an implementation it does not have.

Three divergences, each on evidence older than this phase. `av config
start|status|stop` were NOT built: the parity manifest gives the dashboard half
to `gui`, and command-surface.test.ts pins those names as phantoms because the
kit's inherited prose promises a plans dashboard behind that spelling.
Registering them would have stopped the lint reporting a promise that is still
false. `--no-window` was omitted: ariadnev has no native window on any build.
Upstream's exit 7 is spelled `usage` (2), since a fifth value in a four-value
exit table would be a second contract.

Open question 2 answered: the ariadnev-web binding does not exist. That project
is a static docs and marketing site with no client for a local API, so the
phase's documented degrade shipped — the daemon serves its own status page.

Two defects the green suite could not see, both in the gap between the parent
and the daemon it spawns. `--auth-token` was silently dropped by the detach, so
the parent validated a token the child never received and the daemon came up
unauthenticated; proven live, fixed by forwarding it through the child's
environment, pinned by extracting a pure `daemonSpawnPlan` whose test also
asserts the token never reaches argv. And a daemon with a token could not be
stopped from a shell without it — the refusal was correct, the message was not;
the pidfile now records that a token is required, never the token itself.

Verified with pgrep, not only in tests: two starts leave one daemon, a foreign
http server on the recorded port survives `stop`, a port collision is reported
rather than incremented around, and no path leaves an orphan.
