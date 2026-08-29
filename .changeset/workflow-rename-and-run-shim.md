---
"ariadnev": minor
---

Rename the workflow harness to `av workflow` and reserve `av run` for skill dispatch.

`av workflow run|resume|status|cancel` is now the canonical spelling. `av run <workflow>`
keeps working for one release, warning on stderr so `--json` stdout is byte-identical, and
stops working in 1.4.0. `av run <kit>/<skill>` is reserved for skill dispatch and refuses
rather than being misrouted to a workflow that cannot exist.

`av run resume|status|cancel` moved outright to `av workflow …` — dispatch grammar has no
subcommands to collide with, so there was nothing to disambiguate and no second spelling
worth keeping alive.
