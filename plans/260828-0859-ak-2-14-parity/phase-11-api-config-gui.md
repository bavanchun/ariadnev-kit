---
phase: 11
title: "api, config, gui"
status: completed
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

## Corrections to this phase document

Written after the work, from evidence the document could not have had.

**`av config start | status | stop` were not built, and should not be.** The
Requirements section asked for them. Two things already in the repository said
otherwise and both are older than this phase. The parity manifest's note on
`config` says ariadnev's `config` keeps its own meaning and the dashboard half
goes to `gui`. And `command-surface.test.ts` pins those three names as
*phantoms* — names kit prose references that this CLI deliberately does not have
— because the kit inherited "start it with `av config start --port 3456`" from
upstream, where it opens a **plans dashboard**. Registering the names would not
make that sentence true. It would only stop the av-invocation lint from
reporting that it is false, turning a caught phantom into an uncaught wrong
promise. The three tests that failed when the aliases were briefly registered
are the record of this.

The Architecture section had already reached the same place without saying so:
it describes exactly one daemon, under `operational/api/`, and gives the
browser-opening job to `gui`.

**`--no-window` was not added.** It exists upstream to skip a native window on
Wails builds. ariadnev has no native window on any build, so the flag could only
ever be a no-op. `gui --no-open` covers the real need.

**Upstream's exit 7 is spelled `usage` (2) here.** `ak` uses a dedicated code for
"security violation: non-loopback bind without auth token". ariadnev's exit table
has four values and inventing a fifth for one command would be a second contract;
a bind that cannot be honoured without a token is a flag combination that cannot
be honoured, which is what `usage` means.

**The doctor check does not probe the port.** It reports the two states provable
from the pidfile — running, and a stale record for a dead pid — and stops there.
Confirming that the process on the port is really ours means an HTTP request with
a timeout, and `runDoctor` is synchronous by contract; making it async so that
`av doctor` could spend two seconds on a dead socket is a bad trade for one line.
The third state, a port held by something foreign, is what `av api status`
performs the probe to answer and what `av api start` refuses on.

## Open question 2, answered: the `ariadnev-web` binding does not exist

The phase expected `av gui` to open the sibling web project against this API, and
recorded a degrade path in case the binding could not be made. It could not.
`ariadnev-web` is `apps/docs` plus `apps/site` — a static documentation and
marketing site. There is no dashboard route and no client for a local API
anywhere in it; the only matches for a loopback address in the whole repository
are in Playwright config and test harnesses.

So the documented degrade is what shipped: the daemon serves its own status page
at `/`, and `av gui` opens that. It is a real page, served by the process the
command just started. What was ruled out is the thing upstream does when its GUI
assets are missing — print a link to a desktop-app download — because ariadnev
operates no such endpoint, and a command whose success case is a dead link is
worse than one that opens something small and true.

## What binary verification caught

Both defects were invisible to a green suite, because both live in the gap
between the parent process and the daemon it spawns.

**`--auth-token` was silently dropped by the detach.** `av api start
--auth-token secret` validated the token in the parent and then spawned a child
that received neither the flag nor the environment variable, so the daemon came
up serving every route unauthenticated — while the user had every reason to
believe it was protected. Proven on the binary (`no token -> 200`), fixed by
forwarding the resolved token through the child's environment, and pinned by
splitting the argv-and-environment construction into `daemonSpawnPlan`, which is
pure and can be asserted without starting anything. The same test asserts the
token does **not** appear on argv, which is the fix a hurry would have reached
for and which would publish the token to every process listing on the machine.

The non-loopback half of this failed closed rather than open: the child ran its
own bind check, found no token, and refused — so `--bind 0.0.0.0 --auth-token`
never produced an exposed daemon, only a misleading "the port is already held by
something else". Two layers of the same guard, and the outer one was the broken
one.

**A daemon with a token could not be stopped from a shell without it.** `stop`
probes `/health` to prove identity, gets a 401, cannot confirm the daemon and
correctly refuses to signal it — but reported "nothing identified itself", which
sends the user hunting for a stray process instead of for their own token. Fixed
by recording `tokenRequired` (the fact, never the token) in the pidfile so the
refusal can name the real cause. The guard was not weakened; only the message
was.

## What was verified live, not just in tests

- `start` twice → one daemon (`pgrep` count 1), and `gui` on a running daemon
  starts no second one.
- Every declared route answers; `POST` is 405; `/api/projects` is byte-identical
  to `av projects list --json`.
- A stale pidfile: doctor warns, `stop` cleans it, nothing is signalled.
- A **foreign** process (a `python3 -m http.server`) on the recorded port:
  `status` reports it, `stop` refuses, `start` refuses — and the foreign process
  was still alive afterwards, which is the property that matters.
- A port collision with no pidfile: reported, no record written, no port
  incremented, zero orphans.
- Token enforced (401/401/200 for none, wrong, right).
- **Zero orphaned daemons after every one of the above.**

## Ratchet

8 → 6. `api` and `gui` registered; `changelog`, `content`, `feedback`,
`orchestrate`, `self-update` and `watch` remain.

