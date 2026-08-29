---
"ariadnev": minor
---

Add `av backups create | recover | diagnostics | versions`.

`create` takes a named snapshot, `versions` lists what a path has looked like over time,
`diagnostics` reports the store's health and what it is holding, and `recover` replays a
snapshot (previewing by default — see the recovery entry). Restores verify digests and
take a pre-restore safety copy first, so a failed restore is recoverable.
