# Phase 5 — Wire the flag, the envelope, and the docs

## Context

Everything above is inert until `--purge` reaches it. This phase is the only one
that changes the public CLI surface.

## Requirements

- `--purge` on `uninstall`: *"also remove ariadnev's own state, registered
  project installs, and the binary — irreversible"*.
- Composes with existing flags: `--force` still widens provider-file
  classification; `--provider` still narrows the provider pass and, when passed,
  suppresses the state/binary passes (removing the binary while another provider
  is still installed is incoherent — reject that combination with a usage error
  naming the conflict).
- Preview shape: one block per pass, in execution order, each with counts and
  its kept-with-reason rows. Header states irreversibility. Footer repeats the
  `--yes` instruction, as today.
- `--json`: extend the `uninstall.run` envelope with a `purge` object keyed by
  pass. Bump `UNINSTALL_SCHEMA_VERSION` to 2 — the envelope gains a field, and
  a consumer pinned to 1 should see the change rather than infer it.
- Project scope: `--purge` without `--global` means "this project's provider
  files plus this project's `.ariadnev/`". No state dir, no binary, no fan-out.
  Documented in the flag's own help text so the narrower meaning is not a
  surprise.
- README table row updated; `docs/` uninstall reference if one exists.

## Files

- modify `packages/cli/src/cli/uninstall-command.ts`
- modify `packages/cli/src/cli/register-install-commands.ts`
- modify `README.md`
- modify `packages/cli/src/cli/command-surface.test.ts` (flag surface assertions)

## Steps

1. Thread `purge` through `UninstallHandlerOpts` → `runUninstall`.
2. Conflict check for `--provider --purge` at registration.
3. `renderPurgeSummary`, composing with `renderUninstallSummary` rather than
   replacing it.
4. Envelope v2 + schema bump.
5. Docs.
6. Manual end-to-end on a scratch `--home`: install, purge dry run, purge
   `--yes`, confirm nothing remains. Binary verification, not just green tests —
   every phase of the last parity plan shipped a defect past a green suite.

## Validation

- `pnpm vitest run packages/cli/src/cli packages/cli/src/uninstall`
- `pnpm test` before merge
- Manual: `ARIADNEV_HOME=$(mktemp -d) av install --global --yes` then
  `av uninstall --global --purge` then `--yes`, then `ls -la` the scratch home.

## Risk / rollback

Public surface change and a schema bump. Revert = remove the flag; every phase
below stays dormant and harmless.
