# Phase 4 — MCP residue and the binary

## Context

Two residues that the receipt cannot describe, for opposite reasons: the MCP
entries because ariadnev never claimed to own them, the binary because it
predates every receipt.

### MCP

`av install` writes no MCP servers — verified: no `mcp` reference in
`install-plan.ts`, `install-execute.ts`, or `install-surface.ts`. Only the
user's own `av mcp add` writes to `~/.claude.json` (`mcp-command.ts:119`), and
nothing in the file marks a server as ours. So this pass splits into a part that
is provable and a part that is not:

- **Provable, deleted:** `~/.claude.json.ariadnev-backup` and the project
  equivalent. `writeConfig()` creates them under exactly that name; nothing else
  does.
- **Not provable, gated:** a server entry is removed only if its `command`
  resolves to the ariadnev binary path this run is about to delete. Anything
  else is `report-kept` with the reason spelled out. Deleting a user's
  hand-configured MCP server because it happened to be in a file we once edited
  would be the worst bug this command could ship.

### Binary

`install.sh` writes `${INSTALL_DIR}/ariadnev` (default `~/.local/bin`) plus an
`av` symlink, and refuses to clobber a foreign `av`. `install.ps1` writes
`%LOCALAPPDATA%\Programs\ariadnev\ariadnev.exe` plus an `av.exe` **copy**, and
appends the directory to the user `Path` (`install.ps1:77`) — the only PATH
mutation either installer makes.

## Requirements

- Binary path comes from `process.execPath`, not from a guessed default. The
  running binary is the one to remove.
- `av` is removed only when it is a symlink pointing at `ariadnev`, or a
  byte-identical copy. Mirrors `install.sh`'s rule. Otherwise `report-kept`.
- POSIX: unlink both, last of all passes. Unlinking a running executable is
  safe; the process finishes normally.
- **Windows**: do not delete. Report both `.exe` paths and the PATH entry with
  the exact commands to remove them. A purge that claimed to have deleted a
  locked file would be lying.
- Lock the executable's directory via the existing `executableRoot()`.

## Files

- modify `packages/cli/src/uninstall/purge-plan.ts`
- modify `packages/cli/src/uninstall/uninstall-execute.ts`
- modify `packages/cli/src/cli/register-install-commands.ts` — add
  `executableRoot(process.execPath)` to the purge lock roots
- tests alongside

## Steps

1. MCP pass: backup-file removal + command-resolution gate.
2. Binary pass: symlink/copy check, platform branch, `remove-binary` op.
3. Tests: foreign `av` kept; our symlink removed; our copy removed; win32
   reporting without deletion; third-party MCP server kept with reason;
   ariadnev-command server removed; backup file removed.

## Validation

`pnpm vitest run packages/cli/src/uninstall packages/cli/src/cli/mcp-command.test.ts`

## Risk / rollback

Self-deletion is irreversible and unbacked-up by design — a copy of the binary
in `~/.ariadnev/backups` would be deleted by Phase 2 in the same run anyway. The
reinstall command is one line and the summary prints it. Revert = drop both
passes.
