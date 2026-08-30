---
"ariadnev": minor
---

`av uninstall --purge` removes everything ariadnev put on the machine, not just
what a provider install wrote. Plain `uninstall` left the `.ariadnev` state
directory (backups included, deliberately), the project installs registered in
`projects.json`, the MCP residue, and the binary itself — with no command that
reached any of them. Purge adds four passes after the provider one, in the only
safe order: registered projects, MCP residue, state directory, binary.

It previews by default and applies with `--yes`, like the command it extends,
and it is **irreversible**: it deletes `.ariadnev/backups`, including the copies
its own earlier passes just took.

The ownership rule does not relax. The state directory is checked against its
known layout, so anything else found inside is kept and reported rather than
swept up; an MCP server whose `command` is not the ariadnev binary is left
alone, as is an `av` that is not our own symlink or copy. On Windows the
executable is reported instead of deleted, since a running one cannot be
unlinked. `--purge` cannot be combined with `--provider`. Without `--global` it
means this project only — its provider files and its `.ariadnev`, no registry
fan-out and no binary.

The `uninstall --json` envelope is now schema 2, carrying a `purge` object.
