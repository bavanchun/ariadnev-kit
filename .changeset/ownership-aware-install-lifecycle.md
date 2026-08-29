---
"ariadnev": minor
---

Install, update, and uninstall now respect files you have edited.

Every installed path is classified against the receipt. A file whose hash still matches
what ariadnev wrote is ours to replace or remove; a file you changed is yours. `update`
**skips** a modified file rather than overwriting it, and `uninstall` **refuses** to
delete one, both unless `--force` is passed. Neither ever touches a path that is not in
the receipt at all.

This is a behaviour change to commands that already shipped. Before, an edited skill
could be silently overwritten by an update, or deleted by an uninstall, with no way to
tell afterwards what had been lost.
