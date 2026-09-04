---
"ariadnev": minor
---

Codex installs hooks now, into Codex's own registry rather than Claude Code's.

The hooks tree and the file that registers it are resolved per provider, so
`av install --provider codex` writes `~/.codex/hooks/av/*.cjs` and merges the
bindings into `~/.codex/hooks.json`. That file is shared — three other tools
were already writing to the one observed on disk — and Codex keys each hook's
trust on `<source>:<event>:<group>:<hook>`, so a foreign group is never moved:
ours are appended after whatever is there, and removing ours leaves the rest at
the indices their trust hashes were taken at.

Every hook's stdout goes through one emitter that knows which runtime is reading
it. Codex validates hook output against schemas that reject an unknown key
outright, so the same decision that Claude Code accepts fails the whole hook
under Codex when a field sits in the wrong place; the emitter renders per
runtime instead of hoping one shape passes both.

Two things a file list cannot show are now said out loud. A written Codex hook
does nothing until the user trusts it in Codex's TUI — there is no CLI
subcommand for that, and `--dangerously-bypass-hook-trust` is theirs to pass per
session, not something an install can set for them. And a stale third-party
wrapper left in the same shared `hooks.json` turns a clean deny into `Hook
failed`, so the install reports what it found there. Both are read from the
file, never run: a project-local `.codex/hooks.json` arrives with any clone.

Declining the merge now prints the block for the file the user's own provider
reads, in that provider's grouping, instead of a Claude Code `settings.json`
block they have nowhere to paste.
