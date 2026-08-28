---
phase: 8
title: "backups, recover, diagnostics, versions"
status: pending
priority: P2
effort: "3-5d"
dependencies: [6]
---

# Phase 8: `backups`, `recover`, `diagnostics`, `versions`

## Overview

Four maintenance commands, grouped because they share one theme: **telling the
user the truth about their install**, and letting them get back to a known state.

`260822-1407` phase 6 already shipped `av backups` verbs and a JSON envelope, and
that plan's phase 5 hardened the restore path. This phase **extends** that work —
it does not replace it. The new part is that `backups create` finally has a
subject: the operational state built in phases 3-7.

## Requirements

**Functional**
- `av backups create` — snapshot operational state. New, and now meaningful.
- `av backups list|show|prune|restore|verify` — extend the existing verbs.
- `av backups verify --rebuild` — prove derived state is reconstructible.
- `av recover [id] --latest|--dry-run|--allow-root` — top-level restore alias.
- `av diagnostics export [--offline]` — a redacted support bundle.
- `av versions [--local-only|--cache-ttl]` — CLI, kit, and skill versions.

**Non-functional**
- `recover` writes files to host paths. Manifest authority is verified against
  persisted bundle roots, and an absolute root outside them requires an explicit
  `--allow-root`.
- `diagnostics export` redacts credentials and machine-specific paths. It is
  meant to be pasted into an issue; it must be safe to paste.
- `versions` works **offline**. There is no ariadnev versions registry.
- Snapshots are consistent: a snapshot taken during a write must not capture a
  torn state.

## Architecture

**The reversed verdict.** `260822-1407`'s red team killed `av backups create`:
AgentKit's snapshots a database, ariadnev has none, so porting it ships dead
surface. That was a claim about *the absence of a subject*. Phases 3-7 create the
subject — an activity log, a projects registry, an analytics index, content
shards. Phase 1's ADR records the reversal beside the original verdict, with the
new fact, because the repo's own review rules say a verified decision reverses on
new evidence and not otherwise.

But the reversal is **narrow**. The derived index is still disposable, so:

| State | In a snapshot? | Why |
|---|---|---|
| activity log | **yes** | authoritative, unreproducible |
| `projects.json` | **yes** | authoritative |
| ownership manifests | **yes** | authoritative; losing one orphans an install |
| analytics index | **no** | derived — rebuild it |
| content shards | **no** | derived — rebuild them |

`backups create` snapshots authoritative state only. `verify --rebuild` covers
the rest by proving the derived half can be regenerated. A snapshot containing a
7 MB reproducible cache would be the dead surface the red team named, merely
relocated.

**Oracle.** `ak recover --help`: *"Replay files from a rollback snapshot back to
their original on-host paths… Manifest authority is verified against persisted
bundle roots"*, with `--allow-root` to authorize an absolute project root
explicitly. `ak backups` carries `create list prune restore show verify`, and
`ak versions --help` states plainly that live latest-version comparison is
*"disabled until the AgentKit versions registry endpoint is deployed"* — a useful
precedent: **shipping the local half and saying the remote half is unavailable is
the honest pattern**, and it is exactly what ariadnev should do, since it has no
registry either.

## Related Code Files

- Modify: `packages/cli/src/cli/backups-command.ts` — add `create`, `verify --rebuild`
- Modify: `packages/cli/src/cli/backups-inspect.ts`
- Create: `packages/cli/src/backups/snapshot-operational.ts` + test
- Create: `packages/cli/src/cli/diagnostics-command.ts` + test
- Create: `packages/cli/src/diagnostics/redact.ts` + test
- Create: `packages/cli/src/cli/versions-command.ts` + test
- Modify: `packages/cli/src/cli/register-maintenance-commands.ts`
- Modify: `packages/cli/src/storage/operational-paths.ts`
- Modify: `parity-manifest.json` — `backups create` moves excluded → in-scope, with the ADR cited

## Implementation Steps

1. **Oracle observation.** Capture `ak backups <verb> --help`, `ak recover
   --help`, `ak diagnostics export --help`, `ak versions --help`, plus `--json`
   envelopes from `backups list` and `versions`.
2. Read the existing `backups-command.ts` and the phase-5 restore hardening from
   `260822-1407` before touching either. This phase extends a hardened path; not
   reading it first is how hardening gets undone.
3. Failing tests first for `snapshot-operational.ts`: the snapshot contains every
   authoritative source and **no derived file**. Assert both directions —
   inclusion and exclusion — since a snapshot quietly growing to include the
   index is the failure this design exists to prevent.
4. Implement `create`. Consistency matters: take the activity log by segment
   (closed segments are immutable; the current one is copied once) rather than
   snapshotting a file mid-append.
5. Implement `verify --rebuild`: rebuild derived state into a temp location and
   compare against live, reusing phase 6's equivalence machinery rather than a
   second comparison implementation.
6. Implement `av recover` as a top-level alias over the hardened restore, keeping
   `--latest`, `--dry-run`, and `--allow-root` semantics. Default preview.
7. Implement `diagnostics export`. Redaction is allowlist-shaped: assemble known
   safe fields rather than collecting everything and blacklisting secrets. A
   denylist over an open field set fails silently and exactly once.
8. Implement `versions` — CLI, kits, skills, offline. Say the remote half is
   unavailable, following the oracle's own precedent, instead of pretending or
   omitting.
9. Emit activity events for snapshot and restore.

## Success Criteria

- [ ] `backups create` snapshots every authoritative source and **no derived file** — both asserted
- [ ] `verify --rebuild` passes, reusing phase 6's equivalence machinery
- [ ] `recover --dry-run` is the default; writing requires `--yes`
- [ ] **An invocation that used to write and now previews emits a one-release warning** — `recover` is an already-shipped command and this changes its behavior in a minor
- [ ] A root outside persisted bundle roots requires explicit `--allow-root`
- [ ] `diagnostics export` is allowlist-built and contains no credentials or home paths — asserted
- [ ] `versions` works with no network
- [ ] A snapshot taken during an active append is internally consistent
- [ ] The phase-5 restore hardening is intact — its tests untouched and green
- [ ] `pnpm test` green

## Risk Assessment

**`recover` overwrites something it should not.** It writes files to host paths —
the same consequence class as `uninstall`.
*Signal:* a restore touching a path outside the manifest's bundle roots.
*Response:* preview default, manifest authority verified, `--allow-root`
explicit. All of this exists already from `260822-1407` phase 5; step 2 requires
reading it before extending it, precisely so it is not weakened by accident.

**The snapshot grows to include derived state.** Convenient, and it quietly makes
the cache load-bearing again.
*Signal:* step 3's exclusion assertion fires.
*Response:* the assertion is a success criterion. If restoring without the index
is painful, the fix is a faster rebuild, not a fatter snapshot.

**`diagnostics export` leaks.** Its whole purpose is being pasted into a public
issue.
*Signal:* the redaction test finds a credential or a home path.
*Response:* allowlist, not denylist. A field is included because someone decided
it is safe, never because nobody thought to exclude it.

**A torn snapshot.** Copying an append-only file mid-write.
*Signal:* a restored log with a partial trailing line.
*Response:* segment-wise capture (step 4). Closed segments are immutable; only
the current one needs care.

**`recover` silently stops restoring.** It is already shipped; making preview the
default means a scripted `av recover <id>` becomes a no-op while reporting
success-shaped output. That is a worse surprise than the `run` rename, because
the user believes their restore happened.
*Signal:* an invocation that previously wrote now previews with no warning.
*Response:* warn for one release on exactly that path, and lead the 1.3.0 release
notes with it. The plan's semver-honesty constraint covers this command too, not
only `run`.

**Extending a hardened path undoes the hardening.**
*Signal:* a `260822-1407` phase-5 test needing edits to pass.
*Response:* that is a stop signal, not a merge conflict to resolve. Those tests
encode a security fix; if this phase breaks one, this phase is wrong.
