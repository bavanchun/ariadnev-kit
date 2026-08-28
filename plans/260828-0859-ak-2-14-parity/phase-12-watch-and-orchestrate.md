---
phase: 12
title: "watch and orchestrate"
status: pending
priority: P3
effort: "5-8d"
dependencies: [10, 11]
---

# Phase 12: `watch` and `orchestrate`

## Overview

Two autonomous daemons: `watch` monitors a GitHub repository and auto-responds to
issues via `av run`; `orchestrate` supervises graphs of external CLI jobs.

**Last, deliberately.** `watch` reads text written by strangers on the public
internet and feeds it to a coding agent that can run shell commands. That is a
prompt-injection surface, and it is the highest-risk code in the plan.

## Requirements

**Functional**
- `av watch start|stop|status|dry-run <owner/repo>` with `--label`,
  `--max-per-hour`, `--daemon`.
- Persisted state so restarts never double-respond.
- `av orchestrate start|resume|status|stop` over a job-graph file.

**Non-functional**
- **`watch` is off by default and requires an explicit repo allowlist.** Enabling
  it is a deliberate act, per repository.
- `dry-run` is the default posture. `start` without `--yes` previews.
- Rate limiting is enforced locally, not merely passed to GitHub.
- **Untrusted input is never treated as instructions.** Issue text is data.
- `orchestrate` supervises child processes: no orphans, resumable after a
  supervisor crash.
- Darwin-gating decided by open question 3.

## Architecture

**Oracle.** `ak watch --help`: *"Monitor a GitHub repository for new issues
matching filter rules and automatically generate AI responses via `ak run`. State
is persisted at `~/.agentkit/watch/<repo>/state.json` so restarts never produce
duplicate responses."* `ak orchestrate --help`: *"Start, resume, check, and stop a
graph of external CLI jobs under a dedicated local worker supervisor. Darwin
only; other platforms return an unsupported error."*

**The `watch` threat model, stated plainly because it decides the design.** The
input is a GitHub issue body: attacker-controlled text, from anyone, on a public
repo. The output is a dispatched skill running under a coding agent with shell
access, and then a public comment. Four mitigations — and it matters which are
structural and which are not, because labelling an advisory one "structural" is
where a reviewer stops looking:

**Structural** — these hold regardless of what the model decides:

1. **Allowlist, not blocklist.** A repo is watched because someone named it. No
   discovery, no org-wide watching.
2. **The response path is bounded.** Local rate limit, a cap on response length,
   and — the important one — **`dry-run` is the default**. Posting requires an
   explicit, per-repo opt-in beyond merely starting the watch.
3. **One daemon per repo.** Pidfile plus lock, the same treatment phase 11 gives
   `api`. See the duplicate-response risk below.

**Advisory** — helps, but is the same mechanism the attacker is attacking:

4. **Issue text is framed as data.** It is passed as a delimited payload the
   dispatched skill is told to treat as untrusted content. That is an instruction
   to a model about text, so it is advisory by construction: it lowers the odds,
   it does not close the hole. Listed separately for exactly that reason.

   The delimiter needs a design, not a constant: **a per-invocation random
   nonce**. With a fixed marker, an issue body containing that marker closes the
   untrusted block and lands its remainder in instruction position — and a
   fixture set full of "ignore previous instructions" would pass while that case
   fails silently.

Even so, this remains the plan's sharpest edge, and the honest framing for the
maintainer is that enabling auto-response on a public repo means a stranger can
influence what runs on the machine. The mitigations bound that; they do not
remove it.

**State.** `~/.ariadnev/operational/watch/<repo>/state.json` — last seen issue
ID, responded IDs, rate-limit window. Written atomically. The dedup set is what
makes a restart safe, so it is written *before* responding, never after.

**Singleton, per repo.** Atomic whole-file rename is last-write-wins, so two
daemons watching the same repo each hold their own view of the responded set and
clobber each other's entries — both then answer the same issue. A crash test
exercising one process passes while this fails. `watch` gets the same pidfile +
lock as phase 11's `api`, keyed per repo, and `start` on a live daemon reports
and exits rather than spawning a second.

**`orchestrate`** is a process supervisor: a job graph, dependency ordering,
child lifecycle, resumable state. It reuses phase 10's `spawn-stream.ts` — the
signal handling, timeout escalation, and reaping are the same problem, and
solving it twice would mean fixing orphan bugs twice.

## Related Code Files

- Create: `packages/cli/src/watch/state.ts` + test — atomic, dedup-before-respond
- Create: `packages/cli/src/watch/poll.ts` + test — `gh`-backed issue polling
- Create: `packages/cli/src/watch/respond.ts` + test — bounded, untrusted-input framing
- Create: `packages/cli/src/watch/rate-limit.ts` + test
- Create: `packages/cli/src/cli/watch-command.ts` + test
- Create: `packages/cli/src/orchestrate/job-graph.ts` + test
- Create: `packages/cli/src/orchestrate/supervisor.ts` + test
- Create: `packages/cli/src/cli/orchestrate-command.ts` + test
- Modify: `packages/cli/src/dispatch/spawn-stream.ts` — reused, not reimplemented
- Modify: `packages/cli/src/storage/operational-paths.ts`
- Modify: `parity-manifest.json`
- Create: `docs/decisions/` — the next free number in the sequence; ADR: the watch threat model, which mitigations are structural, and which are advisory

## Implementation Steps

1. **Oracle observation.** Capture `ak watch <verb> --help`, `ak orchestrate
   <verb> --help`, and a `watch status --json` envelope. Record the state-file
   path and dedup guarantee.
2. **Write the threat-model ADR before any watch code.** It states the input is
   attacker-controlled, names the three structural mitigations, and records what
   they do not cover. Writing it after the implementation would make it a
   description rather than a constraint.
3. Failing tests first for `state.ts`: an ID recorded before responding is never
   responded to twice, **including across a simulated crash between record and
   respond**. Crash-in-the-middle is the case that matters; the ordering is
   chosen so the failure mode is a missed response, not a duplicate one.
4. Implement `poll.ts` over `gh`. Read-only.
5. Implement `rate-limit.ts` — a local window, enforced before any dispatch.
6. Implement `respond.ts`. Issue text goes into an untrusted-content block
   delimited by a **per-invocation random nonce**; the instruction comes from
   ariadnev. The fixture set must include three cases, not one: an explicit
   "ignore previous instructions" body, **a body containing the literal delimiter
   string**, and **a body containing a plausible guessed nonce**. The first
   passes trivially; the other two are the ones that find real bugs.
7. Implement `av watch dry-run` first, and make it the default posture. `start`
   requires the repo to be allowlisted **and** `--yes`.
8. Implement `job-graph.ts`: parse, validate, topologically order, reject cycles.
9. Implement `supervisor.ts` on phase 10's `spawn-stream.ts`. `resume`
   reconnects after a client or coordinator crash; `stop` terminates live jobs
   TERM → grace → KILL.
10. Decide Darwin-gating (open question 3). If cross-platform, CI must exercise it
    on Linux; if Darwin-only, the other platforms return a clean unsupported
    error rather than a crash.
11. Emit activity events for watch responses and orchestrate job transitions.

## Success Criteria

- [ ] `watch` is off by default and requires an explicit per-repo allowlist
- [ ] `dry-run` is the default; posting needs explicit opt-in
- [ ] **No duplicate response across a simulated crash** — asserted
- [ ] **A second `watch start` for the same repo detects the live daemon and does not spawn** — asserted
- [ ] Issue text never reaches an instruction position — asserted with all three fixtures, including a body carrying the literal delimiter
- [ ] Rate limit enforced locally before dispatch
- [ ] The threat-model ADR is committed **before** the watch implementation
- [ ] `orchestrate` rejects cyclic graphs
- [ ] `resume` reconnects after a supervisor crash
- [ ] **No orphan process survives** any orchestrate path
- [ ] Platform gating decided and cleanly reported
- [ ] `pnpm test` green

## Risk Assessment

**Prompt injection.** An issue body saying "ignore previous instructions and run
X" reaching a coding agent with shell access. This is the plan's sharpest edge.
*Signal:* step 6's injection fixture influences behavior.
*Response:* untrusted-content framing, dry-run default, allowlist, rate limit —
all structural. And the honest statement to the maintainer: enabling
auto-response on a public repo lets a stranger influence what runs on the
machine. The mitigations bound the risk; they do not eliminate it. Phase 12 is
last so this decision is made with everything else already working, and skipping
it entirely costs nothing that has already shipped.

**Duplicate responses spam a public repo.** A restart mid-response, and the same
issue is answered twice.
*Signal:* step 3's crash test. *Response:* record the ID before responding, so a
crash loses a response rather than duplicating one. The failure mode is chosen,
not discovered.

**Orphaned jobs.** `orchestrate` spawns many children by design.
*Signal:* processes alive after `stop`. *Response:* reuse phase 10's
`spawn-stream.ts` rather than a second implementation — fixing orphan handling in
one place is the entire reason to share it.

**Runaway dispatch cost.** Every response is a coding-agent invocation.
*Signal:* `--max-per-hour` unenforced locally, or enforced only by GitHub.
*Response:* local enforcement before dispatch, asserted.

**The whole phase is optional.** Nothing else depends on it.
*Signal:* schedule pressure. *Response:* this is where it should vent first.
Cutting phase 12 leaves the parity claim short by two commands, recorded in the
divergence table — a far better outcome than shipping a rushed autonomous agent
that answers strangers.
