# Phase 3 — Cross-project fan-out

## Context

`~/.ariadnev/projects.json` indexes every directory `av init` registered:
`{ version, projects: [{ name, dir, registered_at, updated_at }] }`. Its own
header is explicit that it holds *where* projects are, never *what* is owned
inside them — ownership stays in each project's own receipt. The fan-out must
respect that: read the index for locations, read each project's receipt for
what to delete.

## Requirements

- For each registered `dir`: if `dir/.ariadnev/receipt.json` exists, run the
  existing `uninstallKit` with `cwd = dir`, then `remove-tree` on
  `dir/.ariadnev`.
- A registered directory that no longer exists, or has no receipt, is reported
  and skipped — not an error. Registries outlive the directories they name.
- The current `cwd` is not double-processed if it is also registered.
- Every path deleted in a foreign project appears in the preview under that
  project's heading. This pass is the one most likely to surprise, so its
  preview is per-project and never summarised into a single count.
- Locking: `lifecycleRoots` returns `[home, cwd]`. Fanning out writes under
  roots outside that set, so the roots passed to `withLifecycleLock` must
  include every project directory being visited. Precedent exists —
  `executableRoot()` was added for exactly this reason for `av update`.

## Files

- modify `packages/cli/src/uninstall/purge-plan.ts`
- modify `packages/cli/src/uninstall/uninstall-execute.ts`
- modify `packages/cli/src/install/lifecycle-lock.ts` — a `projectRoots()` helper
- tests alongside each

## Steps

1. `projectRoots(registry)` returning resolved dirs, deduped against `cwd`.
2. Planner pass emitting one group per project.
3. Executor loop reusing `uninstallKit` per project — no new deletion logic.
4. Tests: two registered projects both cleaned; a missing dir reported; a
   receiptless dir reported; `cwd` not visited twice; lock roots include every
   project.

## Validation

`pnpm vitest run packages/cli/src/uninstall packages/cli/src/install/lifecycle-lock.test.ts`

## Risk / rollback

Touches files outside the invocation directory. Preview-by-default plus
per-project reporting is the mitigation. Revert = drop the pass; purge falls
back to current-scope only.
