---
"ariadnev": minor
---

`worktree.root` can now be set in a config file rather than only through
`--worktree-root` or the `WORKTREE_ROOT` environment variable. The env var and
the flag still win, in that order, so nothing that already works changes.

The two layers are not trusted alike. A project file is committed, so it arrives
with whoever cloned the repository, and this key decides where directories get
created on their disk — so a project-layer value is confined to the repository
that supplied it: relative only, no `~`, no control characters, nothing
resolving to the repository itself, a sibling of it, or anywhere inside its
`.git`. Symlinks are resolved on both sides before the comparison, and a value
whose target does not exist yet is resolved through its nearest existing
ancestor rather than accepted lexically. The same key in the user's own config
is unbounded and may be absolute — trust follows who wrote the file.

A refused value warns through the JSON envelope and falls through to the next
source. It never fails the command, because failing would hand a hostile clone a
denial of service on a repository the user has every right to work in.
