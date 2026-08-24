---
phase: 7
title: "Install lifecycle locking"
status: completed
priority: P2
effort: "1-2d"
dependencies: [3, 6]
---

# Phase 7: Install lifecycle locking

## Overview

Add an advisory lock so two mutating commands cannot interleave. Lands after
phases 3 and 6 because it wraps the action bodies those phases edit.

Deliberately small — the threat is one human racing themselves. But the draft's
version was wrong in four ways that all made it *look* protective while
protecting nothing.

## Requirements

**Functional**
- Lock the **physical roots the command will actually write**, not the scope root.
- Async-safe: the lock is held until the awaited work finishes.
- Acquired **after** interactive prompts, before the first write.
- Held by a live process → fail fast, exit 3, touch nothing.
- Stale by dead pid → recovered. Stale by age → **reported, never stolen**.
- Lock file contents are untrusted input.

**Non-functional**
- No native dependency (Bun single-binary, 5 targets incl. windows-x64).
- Released on the error path.

## Architecture

**Primitive:** `fs.openSync(path, "wx")` — atomic create-if-absent, portable.
`flock()` is not portable to Windows without a native dep.

**Not reusable despite the name:** `src/skill-env/lockfile.ts` is a PEP-508
dependency-pin format. Nothing to do with a mutex.

### Scope: per written root, not per scope root

The draft asserted "a project install and a `--global` install never contend —
they touch disjoint trees". **False.** `resolver.ts:53-56` returns `ctx.home` for
codex for every artifact kind except rules, at every scope, and
`install-execute.ts:109` sets `allowedRoots = [ctx.home, ctx.cwd]` precisely
because project-scope installs write home paths — `backup.ts:33-37` documents the
same overlap.

So `av install` in `~/work/repo-a` and in `~/work/repo-b` take two different
locks and both write `~/.agents/skills/av-*`. With phase 3's heal added, one
deletes while the other writes.

**Derive the lock set from the resolved install plan's target roots.** At minimum,
always take the home lock as well when any selected provider is codex.

`av update` needs its own: it mutates `process.execPath`
(`update-command.ts:130-141`), one file shared by every project and outside every
scope root. Two `av update` runs in different directories are otherwise entirely
unserialized. Key a second lock on `dirname(process.execPath)`.

### Async

Two of the eight action bodies are `async` (`register-install-commands.ts:19`,
`register-maintenance-commands.ts:78`). A synchronous
`withLifecycleLock<T>(root, fn: () => T): T` wrapping an async body returns a
pending promise and runs `finally` immediately — releasing the lock microseconds
in, leaving the longest-running command unguarded. Ship the wrapper **async**.

### Acquire after the prompts

`install`'s body awaits `promptProviders()` (`:23-26`) and
`confirmHookSettingsMerge()` (`:29-32`) before touching disk. Holding the lock
across an unbounded human wait is what makes an age ceiling dangerous. Acquire
immediately before `runInstall`.

### Staleness — one check that recovers, one that reports

- **Dead pid** (`process.kill(pid, 0)` → `ESRCH`): stale. Delete and retry once.
- **Age beyond the ceiling**: **report, do not steal.** The draft had it silently
  override a lock whose pid was provably alive — so a slow download or a paused
  interactive install past 15 minutes would let a second process start a
  concurrent binary replace. That is the lock *causing* the corruption it exists
  to prevent. Print `lock held for 41m by pid 812 — av unlock to clear` and exit 3.

Add `av unlock` as the explicit escape hatch (register it in `KNOWN_COMMANDS`).

### The lock file is untrusted

For project scope it lives at `<cwd>/.ariadnev/locks/…` — inside a repository, so
it can be committed. Both checks read attacker-controllable values.

- `{"pid":1}` — `process.kill(1,0)` succeeds, never stale, every mutating command
  bricked in that directory.
- `{"pid":"x"}` or `1e400` — Node throws `ERR_INVALID_ARG_TYPE`/`ERR_OUT_OF_RANGE`,
  **not** `ESRCH`; an `ESRCH`-only handler lets it escape as a stack trace.
- `{"pid":-1}` — targets a process *group*.
- A future `startedAt` never exceeds any ceiling.

So: validate `Number.isInteger(pid) && pid > 0`; treat any parse/shape failure as
stale; treat a future `startedAt` as stale; wrap `process.kill` and treat any
throw except `EPERM` as stale.

**Commands that take it:** install, uninstall, update, migrate, backups
restore/prune, adapters regenerate, doctor --fix (`doctor-command.ts:111` mutates).
**Commands that do not:** list, validate, audit, contract, eval,
backups list/show/verify, doctor without `--fix`.

**`--dry-run` does not take the lock** — it writes nothing, and blocking it
defeats its purpose. Judgment call, recorded.

**Exit code 3.** `UnavailableError` (`exit-codes.ts:37-43`) already means
"environment not ready". AgentKit uses 4, but av's table has no 4 slot.

## Related Code Files

- Create: `packages/cli/src/install/lifecycle-lock.ts` + test
- Modify: `packages/cli/src/cli/register-install-commands.ts` (acquire post-prompt)
- Modify: `packages/cli/src/cli/register-maintenance-commands.ts` (+ execPath lock)
- Modify: `packages/cli/src/cli/migrate-command.ts`, `register-tier1-commands.ts`
- Modify: `packages/cli/src/cli/contract-command.ts` (`unlock` in `KNOWN_COMMANDS`)
- Modify: `README.md` (exit code, `av unlock`)

## Implementation Steps

1. Write the tests first, including the hostile-lock cases: `pid:1`, `pid:"x"`,
   `pid:-1`, future `startedAt`, malformed JSON.
2. Implement `acquireLifecycleLock` and an **async** `withLifecycleLock`.
3. Derive the lock set from resolved target roots; add the execPath lock for
   `update`.
4. Wrap the eight bodies, acquiring after prompts.
5. Add `av unlock`.
6. Integration tests: held lock → exit 3, receipt untouched.

## Success Criteria

- [x] An async command holds the lock until its awaited work finishes — proven
      by a test that asserts the lock file still exists mid-await.
- [x] Two project-scope installs in different directories **do** contend. The
      case the draft's design missed.
- [x] Two `av update` runs in different directories contend, via
      `dirname(execPath)`.
- [x] A live lock past the age ceiling is reported, not stolen.
- [x] Each hostile lock-file shape is treated as stale or rejected cleanly —
      twelve of them, none escaping as an unhandled throw.
- [x] The lock is acquired after interactive prompts.
- [x] `--dry-run` proceeds with a lock held; read-only commands never block.
- [x] Lock released when the wrapped command throws, and on a partial acquire.
- [x] `pnpm test` green — 1322 vitest, 153 node, lint / validate / brand clean.

## What the design got right, and the one thing it did not

All four named defects are covered by a test that fails when the guard is
removed, each mutation-checked: the sync wrapper, single-root locking, stealing
a live lock past the ceiling, and install not taking the lock at all.

**Lock roots: both, always, rather than derived from the plan.** The phase said
"derive the lock set from the resolved install plan's target roots, at minimum
always take the home lock when any selected provider is codex". Taking
`[home, cwd]` unconditionally is simpler, can never under-lock, and avoids
planning the install twice to find out what to lock. The cost is a rare false
contention between two ariadnev commands running at once — which is the
situation the lock exists for.

**`pid: 1` needed a defence the phase's own list did not supply.** The phase
prescribed `Number.isInteger(pid) && pid > 0`, and `1` passes that:
`process.kill(1, 0)` answers `EPERM` for an ordinary user, which the liveness
check reads as alive. A lock naming it would never go stale and would brick
every mutating command in that directory, permanently. Rejected explicitly.

That is also the honest limit of a pid-based check, recorded in the source: a
lock naming any *other* live pid is equally unfalsifiable. Two things keep it
from mattering — `.ariadnev/` is gitignored, so committing one takes a
deliberate `git add -f`, and `ariadnev unlock` clears it in one command.

**Commands that take it:** install, uninstall, update, migrate,
`backups restore|prune`, `recover`, `adapters regenerate`, `doctor --fix`.
**Commands that do not:** everything read-only, including
`backups list|show|verify` — those are what someone reaches for to find out what
is going on — and anything under `--dry-run`.

## Risk Assessment

**A lock that reports success and protects nothing.** All four draft defects had
this shape — the tests would have passed because they exercised the sync,
single-root, well-formed case. *Signal:* every lock test uses a synchronous
double and a well-formed lock file. *Pre-decided response:* Success Criteria 1-3
each name a case the draft would have failed.

**A leaked lock bricks the CLI.** *Response:* `av unlock` is the explicit escape
hatch; reporting rather than stealing means the user is told exactly what to run.

**Over-engineering.** Retry queues, backoff, fairness are theater here.
*Response:* the file stays under ~120 LOC (raised from 80 for the validation and
multi-root logic). Past that, the design drifted.
