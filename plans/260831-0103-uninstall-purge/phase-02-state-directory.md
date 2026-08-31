# Phase 2 — State directory removal and the ownership guard

## Context

`~/.ariadnev` is the one place purge removes wholesale. Every other deletion in
this tool is justified by a receipt hash; this one is justified by the claim
that ariadnev owns the whole directory. The claim is true today —
`operational-paths.ts`, `projects/registry.ts`, `install/lifecycle-lock.ts`,
`history/store.ts` and the rest all write under it and nothing else does — but a
claim that only holds by convention is one a future commit breaks silently.

## Requirements

- `executeUninstall` handles `remove-tree`: `assertWithinRoots` first (unchanged
  guard), then recursive removal.
- **Ownership guard.** Before removing, the executor lists the directory's top
  level and compares against the known layout constant. An unrecognised entry
  does not abort the purge — it is downgraded to `report-kept` for that entry,
  the rest of the tree is removed, and the summary names what stayed. Aborting
  the whole purge over one stray file would make the command fail exactly when
  the machine is messiest.
- The known-layout constant lives beside the paths that define it, not in the
  uninstall module, so adding a new state directory forces touching it.
- Ordering: this pass runs after the provider and project passes have finished
  writing their backups into `~/.ariadnev/backups`.

## Files

- modify `packages/cli/src/uninstall/uninstall-execute.ts`
- modify `packages/cli/src/storage/operational-paths.ts` — export the layout
  constant
- modify `packages/cli/src/uninstall/uninstall-execute.test.ts`

## Steps

1. Add the layout constant and a `classifyStateEntries()` helper next to it.
2. Implement the `remove-tree` branch with the guard.
3. Tests: full removal of a known layout; a stray entry surviving and being
   reported; dry run removing nothing; `assertWithinRoots` rejecting a path
   outside the scope root.

## Validation

`pnpm vitest run packages/cli/src/uninstall packages/cli/src/storage`

## Risk / rollback

Highest-risk phase — recursive removal of a user directory. Mitigated by the
path guard, the layout guard, and dry-run-first. Revert = drop the `remove-tree`
branch; ops of that kind become no-ops.
