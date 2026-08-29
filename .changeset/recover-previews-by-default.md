---
"ariadnev": minor
---

Snapshot recovery now previews unless you confirm.

`av recover` replays a snapshot back to its original paths, and it now prints what it
would write and stops. Pass `--yes` to apply.

This is a behaviour change to a command that already shipped, and it is the one most
worth reading twice: a script that called `av recover` and checked the exit code
previously restored files and now reports a plan. It exits 0 either way.
