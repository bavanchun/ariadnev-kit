---
title: "uninstall-purge"
description: "`av uninstall --purge` — remove everything ariadnev put on this machine: provider files, the ~/.ariadnev state directory, project installs registered elsewhere, the MCP residue, and the binary itself."
status: completed
priority: P2
effort: "3-5d"
tags: [cli, uninstall, lifecycle]
created: 2026-08-31
---

# uninstall-purge

## Overview

`av uninstall` removes *files a provider install wrote*. It does that well —
receipt-driven ownership, preview by default, backup before unlink, edited files
preserved, orphans never touched. Verified on this machine: a global dry run
plans `claude-code: removed=1570`, `codex: 18`, `cursor: 18`.

What it does not remove is everything ariadnev put on the machine *outside* a
provider install. After a clean, complete `av uninstall --global --yes` the
following survives:

| Residue | Path | Why it survives |
|---|---|---|
| State directory | `~/.ariadnev/` — `backups/`, `operational/`, `locks/`, `adapters/`, `history.jsonl`, `receipt.json`, `projects.json` | `uninstall-command.ts` deletes only `receipt.json`, and only when the last provider goes. Its own comment: *"Backups are intentionally kept by default — the user can delete `.ariadnev/backups` manually."* |
| The binary | `~/.local/bin/ariadnev` (87 MB here) + `av` symlink; on Windows `%LOCALAPPDATA%\Programs\ariadnev\{ariadnev,av}.exe` | `install.sh`/`install.ps1` put it there; no command removes it |
| PATH entry (Windows only) | user `Path` env var | `install.ps1:77` appends `$installDir`; nothing reverses it. `install.sh` only *prints* a suggestion, so POSIX has no residue here |
| Project installs elsewhere | `.ariadnev/` + provider files in every registered project | `~/.ariadnev/projects.json` indexes where they are; uninstall never reads it |
| MCP residue | `~/.claude.json` server entries; `~/.claude.json.ariadnev-backup` | `av mcp add` writes them (`mcp-command.ts:119`); the receipt does not cover them |

There is no `purge` concept anywhere in the repo today — grep confirms it.

## Contract

**Outcome** — `av uninstall --purge` leaves a machine in the state it was in
before ariadnev was ever installed, up to the two things it is not allowed to
guess at (see Constraints). It previews by default like plain `uninstall`, is
applied with `--yes`, and its preview states plainly that purge is
**irreversible** where plain uninstall is not.

**Non-goals**
- No new top-level command. `--purge` is a flag on `uninstall` so it inherits
  the preview gate, `withLifecycleLock`, and the `--json` envelope unchanged.
- No change to how provider files are classified, backed up, or preserved.
  Purge runs the existing uninstall first and then adds passes; it does not
  re-decide ownership.
- Not a `--force` alias. `--force` widens deletion from `clean` to
  `clean | modified` *within provider files*. `--purge` widens the **set of
  things considered**, not the classification. The two compose.

**Constraints**
- **Ordering is load-bearing.** Passes run: providers → registered projects →
  MCP residue → `~/.ariadnev` → binary. `~/.ariadnev/backups` is where every
  preceding pass writes its safety copies, so it cannot be removed before them;
  the binary is the running process, so it goes last.
- **The orphan rule is not relaxed.** No pass deletes a file ariadnev did not
  write. `~/.ariadnev` is the single wholesale removal in the tool, and it is
  allowed *only* because ariadnev owns that directory by construction — nothing
  else writes there. That is an assertion, and Phase 2 tests it rather than
  assuming it.
- **Two things purge must not guess at**, and reports instead of deleting:
  1. MCP servers in `~/.claude.json` whose `command` does not resolve to the
     ariadnev binary. `av install` never writes MCP servers — only the user's
     own `av mcp add` does, and there is no ownership marker in the file. A
     server we cannot prove is ours is the user's.
  2. A `bin/av` that is not our symlink or copy. Mirrors `install.sh`'s own
     rule: *"Never clobber a pre-existing different `av`."*
- **Windows cannot unlink a running executable.** On `win32` the binary pass
  reports the two paths and the PATH entry rather than deleting; it does not
  claim success it did not achieve. POSIX unlinks both and finishes the run.
- `--dry-run` still forces a preview even alongside `--yes`, as today.
- CI green on every merge; each phase independently revertable.

**Acceptance**
- `av uninstall --global --purge` (no `--yes`) prints every pass with counts and
  the irreversibility notice, and changes nothing.
- With `--yes`: `~/.ariadnev` gone, `ariadnev` and `av` gone from the install
  dir, every project in `projects.json` cleaned, `*.ariadnev-backup` gone,
  ariadnev-owned MCP servers gone and foreign ones listed as kept.
- A foreign `av` on PATH and a third-party MCP server both survive, and the
  preview says why each was kept.
- `--json` emits one envelope covering all passes.

## Phases

| # | Phase | Depends on |
|---|---|---|
| 1 | [Purge planner](phase-01-purge-planner.md) | — |
| 2 | [State directory + ownership guard](phase-02-state-directory.md) | 1 |
| 3 | [Cross-project fan-out](phase-03-cross-project.md) | 1, 2 |
| 4 | [MCP and binary residue](phase-04-mcp-and-binary.md) | 1, 2 |
| 5 | [Wire the flag, envelope, docs](phase-05-wire-and-document.md) | 1-4 |

## Resolved

- **Project scope takes the narrow meaning** (maintainer's call): `--purge`
  without `--global` removes this project's provider files and its own
  `.ariadnev`, with no registry fan-out and no binary pass.
- **No `--keep-backups`.** Purge destroys `~/.ariadnev/backups` including copies
  its own provider pass took seconds earlier. The preview says so in as many
  words; a flag whose only user did not mean "tận gốc" is not worth the surface.

## Found during implementation

Two defects a green suite would not have caught, both found by running the
compiled binary against a fabricated home:

1. **Purge manufactured the residue it exists to remove.** Locking
   `executableRoot` created `~/.local/bin/.ariadnev/locks`, and lock release
   removes the file but not the directory — so the command left a brand new
   `.ariadnev` in the bin directory. The exec root is no longer locked; what it
   would have protected is a single unlink, and the home lock already excludes
   every other lifecycle command.
2. **The recorders resurrected the state directory.** `context.record` and
   `recordActivity` write to `~/.ariadnev/history.jsonl` and the activity log
   *after* the state pass deleted them, recreating the directory to hold one
   event saying it had been removed. Both are skipped on an applied purge.
