---
"vcskill": minor
---

vcskill CLI v2: install receipt + doctor + uninstall + backups + update.

- **New**: every install writes `.vcskill/receipt.json` — an inspectable
  record of every file written (with a sha256 hash), hook bindings, and
  AGENTS.md management, per provider. Foundation for everything below.
- **New**: `vcskill doctor [--global]` — health-checks the install against
  its receipt (missing files, hooks that fail to spawn, hook bindings
  removed from `settings.json`, version drift). Exit 0 healthy / 1 degraded
  / 2 not-installed.
- **New**: `vcskill uninstall [--provider a,b] [--global] [--dry-run]` —
  removes exactly what the receipt says was written. A file you've edited
  since install is preserved, never deleted (detected via content hash).
  Reverses the hook-settings and AGENTS.md merges exactly, backing up both
  before rewriting. Proven byte-exact by round-trip tests and a live run.
- **New**: `vcskill backups list [--global]` /
  `vcskill backups restore <timestamp> [--file <rel>] [--dry-run]` — restore
  any backed-up file, safety-backing up the current state first. Backups
  created before this release (no manifest) are listed but not
  auto-restorable — reported explicitly, never guessed.
- **New**: `vcskill update [--global]` — offline-safe check against the npm
  registry for a newer release; never fails the command on a network error.

vcskill now ships 8 CLI commands. See README's command table.
