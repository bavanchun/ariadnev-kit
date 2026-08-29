---
"ariadnev": minor
---

Add nine subcommands the parity audit found missing.

`av plan create | add-phase | kanban | parse | validate | migrate` — scaffold a plan and
its phases, view every phase grouped by status, read a plan as structured data, check one,
and import plans from another directory. New phases take the highest existing number plus
one, never a gap, so a deleted phase cannot be reissued to something that depends on it.

`av mcp link` copies a server between the user and project config — a copy, never a move —
and refuses to write environment values into a repository config without `--allow-secrets`.

`av migrate prefs | rollback` — import a config left by the pre-rename install, and undo
what a migration moved. Rollback reuses the existing restore path rather than adding a
second one, so it inherits its digest checks and its refusal to write outside the install
surface.
