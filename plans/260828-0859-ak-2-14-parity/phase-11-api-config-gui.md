---
phase: 11
title: "api, config, gui"
status: pending
priority: P2
effort: "5-10d"
dependencies: [6, 8]
---

# Phase 11: `api`, `config`, `gui`

## Overview

A local HTTP daemon exposing health, status, version, and dashboard endpoints
over the data plane; a `config` command to start/stop it and inspect resolved
preferences; and `av gui`, which starts the API and opens **`ariadnev-web`** in
the browser.

Two deliberate divergences from AgentKit live here, both recorded in phase 1's
ADR — see below.

## Requirements

**Functional**
- `av api start|status|stop` — local API daemon.
- `av config [--no-window]` plus `config start|status|stop|prefs`.
- `av gui` — start the API, open the browser at the dashboard.
- Endpoints: health, status, version, and read-only data-plane views over
  activity, projects, sessions, and analytics.

**Non-functional**
- **Binds `127.0.0.1` by default.** A non-loopback bind requires an auth token,
  matching AgentKit's own rule.
- Read-only endpoints in this phase. No mutation over HTTP.
- Pidfile plus lock, per the process-management rules: a deterministic port per
  install, and on "address in use" identify and stop the stale owner rather than
  incrementing to a new port.
- `stop` actually stops. `start` twice does not spawn a second daemon.
- **No LLM proxy.**

## Architecture

**Divergence 1 — the proxy is excluded by dependency.** `ak api --help`: *"Proxies
LLM requests and exposes local health, status, and version endpoints."* The proxy
exists to serve AgentKit's licensed routing and depends on `login` credentials
that are explicitly out of scope. Porting it would ship a credential-handling
daemon with no possible client. **Ship the local half; document the proxy as
excluded-by-dependency.**

**Divergence 2 — `gui` opens a web dashboard, not a native window.** `ak gui
--help`: *"Open the AgentKit desktop UI in a native window backed by the same
binary… When built without GUI assets, download the desktop app from
agentkit.best."* Cloning that means a second product, a webview-native-dependency
swamp inside a Bun binary, and a download endpoint ariadnev does not operate.

ariadnev has something better available: **`ariadnev-web`**, a sibling project
that just completed a seven-phase UI plan. `av gui` starts the API and opens the
browser at it. Parity of function — a GUI launches — not of window chrome.

The caveat is real and is open question 2: `ariadnev-web`'s data contract to this
new API **is unbuilt**. If that binding cannot be made in this phase, `av gui`
degrades to opening the API status page. That degrade is acceptable and
documented; what is not acceptable is `av gui` printing a link to a download that
does not exist.

**Daemon lifecycle** is the part most likely to go wrong, because it is stateful
and long-lived:

```
~/.ariadnev/operational/api/
  api.pid        pid + port + start time
  api.lock       held for the lifetime of the daemon
```

Deterministic port per install. `start` checks the pidfile: a live matching
process means already-running (report and exit 0), a stale pidfile is cleaned
and replaced. **Never increment the port on collision** — that is exactly how the
process-management rule describes ghost processes accumulating.

**Endpoints read through the same code paths as the CLI**, not a parallel query
layer. The rebuild-equivalence invariant then covers them for free; a second
query implementation would need its own gate and would drift.

## Related Code Files

- Create: `packages/cli/src/api/server.ts` + test
- Create: `packages/cli/src/api/routes.ts` + test — health/status/version/data views
- Create: `packages/cli/src/api/daemon-lifecycle.ts` + test — pidfile, lock, stop
- Create: `packages/cli/src/cli/api-command.ts` + test
- Create: `packages/cli/src/cli/gui-command.ts` + test
- Modify: `packages/cli/src/cli/config-command.ts` — start/status/stop; keep `prefs`
- Modify: `packages/cli/src/cli/register-config-commands.ts`
- Modify: `packages/cli/src/storage/operational-paths.ts` — api root
- Modify: `parity-manifest.json` — `api` partial (proxy excluded), `gui` divergent
- Modify: `docs/` — the two divergences, with their ADR references

## Implementation Steps

1. **Oracle observation.** Capture `ak api|config|gui --help` and `ak api status
   --json`. Record the bind/auth-token rule verbatim — it is a security default
   worth copying exactly.
2. Failing tests first for `daemon-lifecycle.ts`: start writes a pidfile; a
   second start detects the live daemon and does not spawn; a stale pidfile is
   cleaned; stop terminates and removes the pidfile; a port collision with a
   **foreign** process is reported, never worked around by incrementing.
3. Implement the lifecycle. Stop cleanly first (TERM), escalate to KILL only if
   ignored. Only ever stop a process this install started — proven by the
   pidfile, never by matching a command line.
4. Implement `server.ts` bound to `127.0.0.1`. Assert by test that a non-loopback
   bind without a token is refused.
5. Implement `routes.ts` **through the CLI's own query paths**. Read-only; a
   mutating verb is out of scope for this phase.
6. Implement `av api start|status|stop`.
7. Extend `av config` with start/status/stop, preserving the existing `prefs`
   surface unchanged.
8. Implement `av gui`: start the API if needed, resolve the dashboard URL, open
   the browser. If `ariadnev-web` cannot be bound, open the API status page and
   say so — no dead links, no phantom downloads.
9. Add a doctor check: daemon running / stale pidfile / port held by a foreign
   process.
10. Emit activity events for daemon start and stop.

## Success Criteria

- [ ] `av api start|status|stop` work; `start` twice does not spawn a second daemon
- [ ] A stale pidfile is cleaned; a foreign port holder is **reported, not worked around**
- [ ] `stop` terminates the daemon and removes the pidfile
- [ ] Default bind is loopback; non-loopback without a token is refused
- [ ] Endpoints go through the CLI's query paths — no parallel query layer
- [ ] `av gui` opens a real page, and degrades honestly when the binding is unavailable
- [ ] No LLM proxy; the exclusion is documented with its ADR reference
- [ ] `av config prefs` unchanged
- [ ] No daemon survives the test suite
- [ ] `pnpm test` green

## Risk Assessment

**Ghost daemons.** The exact failure the process-management rules describe:
processes started, abandoned, port taken, next run picks another port, repeat.
This machine has already been rebooted once by runaway processes.
*Signal:* more than one `av api` process, or a port incremented after a
collision. *Response:* deterministic port, pidfile + lock, and step 2's
assertion that a collision is reported rather than routed around. The suite must
also leave no daemon behind — a success criterion.

**Stopping a process ariadnev does not own.** A pidfile can go stale and its PID
be reused.
*Signal:* a stop targeting a process that is not the daemon.
*Response:* the pidfile records start time and port; verify identity before
signalling. If identity cannot be confirmed, report and refuse.

**`ariadnev-web` cannot bind, and `gui` ships pointing at nothing.**
*Signal:* step 8 cannot resolve a working dashboard URL.
*Response:* degrade to the API status page and document it. Open question 2 asks
the maintainer to confirm this is acceptable before the phase starts.

**The API becomes a second query implementation.** Convenient, and it drifts from
the CLI within a release.
*Signal:* a route querying storage directly rather than through a CLI path.
*Response:* step 5 is explicit; a route that needs new query code is a signal the
CLI is missing that query, and it should be added there first.

**Scope creep into mutation.** A read-only dashboard invites "just one write
endpoint".
*Signal:* any non-GET route. *Response:* out of scope here. Mutation over HTTP
needs an auth story, and auth is a non-goal of this whole plan.
