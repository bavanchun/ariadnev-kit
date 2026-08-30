# Phase 1 — Purge planner

## Context

`uninstall-plan.ts` is a pure planner: receipt in, `UninstallOp[]` out, no
writes. `uninstall-execute.ts` applies it. Purge keeps that split — a new pure
planner enumerates the residue and emits ops; the executor stays the only thing
that touches disk.

## Requirements

- New op kinds, added to the `UninstallOp` union:
  - `remove-tree` — `{ action, path, reason }`, a wholesale directory removal.
    Only `~/.ariadnev` (and a project's `.ariadnev/`) ever produces one.
  - `remove-binary` — `{ action, path, alias?: string }`.
  - `report-kept` — `{ action, path, reason }`, for a thing purge deliberately
    did not delete. Distinct from `preserve-file`, which means "ours but
    edited"; this means "not provably ours".
- New module `packages/cli/src/uninstall/purge-plan.ts`, exporting
  `planPurge(ctx, deps, opts): PurgePlan`, where `PurgePlan` groups ops by pass
  so the summary can print them in order.
- Injected fs reads only, matching `PlanUninstallDeps` style (`fileExists`,
  `readFileContent`, `listFiles`, plus `readLink` and `platform` for the
  binary pass). No `node:fs` import in the planner.

## Files

- create `packages/cli/src/uninstall/purge-plan.ts`
- create `packages/cli/src/uninstall/purge-plan.test.ts`
- modify `packages/cli/src/uninstall/uninstall-plan.ts` — extend the op union

## Steps

1. Extend the op union and re-export from `uninstall-plan.ts` so both planners
   speak one vocabulary.
2. Write `planPurge` producing the five passes in fixed order. Each pass is a
   named group with its own ops; an empty pass is still present so the summary
   can say "nothing to do" per pass rather than silently omitting one.
3. Tests: each pass in isolation with a fabricated deps object; the fixed
   ordering; empty-pass shape; a foreign `av` producing `report-kept` not
   `remove-binary`.

## Validation

`pnpm vitest run packages/cli/src/uninstall/purge-plan.test.ts`

## Risk / rollback

Additive only — no existing behavior touched. Revert = delete two files and the
union extension.
