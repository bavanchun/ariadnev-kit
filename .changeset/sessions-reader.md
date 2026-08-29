---
"ariadnev": minor
---

Add `av sessions list | show` — a read-only reader over agent session logs.

Reads Claude Code and Codex session files in place and never writes to them. `list`
reports id, runtime, project, start time and turn count; `show` renders one session.
Nothing is copied into ariadnev's own storage, so deleting the runtime's log deletes the
data.
