---
"ariadnev": minor
---

Store operational data in SQLite, with the runtime gated on it.

A dual-driver adapter runs against either available SQLite binding and is held to the same
behaviour by a shared conformance suite. `av doctor` now reports SQLite, FTS5 and WAL
availability and fails when the environment cannot support them, so a missing capability
surfaces at diagnosis rather than mid-command.
