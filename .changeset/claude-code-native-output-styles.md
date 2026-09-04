---
"ariadnev": minor
---

Output styles now install to Claude Code's own `~/.claude/output-styles/`
instead of riding in as a session-init hook sidecar. The cell that blocked this
recorded that the directory was observed on disk but nothing was seen to load
from it; the 2.1.259 binary carries the loader strings, a plugin schema key
documents the directory and the opt-out that suppresses auto-loading, and
`output-styles` sits in the artifact-kind set beside commands, agents and
skills. A style planted in the otherwise-empty native directory was picked up.

The claude-code row's observation date and version were re-taken at the same
time. Nothing else in that row moved: a re-observation re-dates the cells it
actually re-checked, and each row now carries its own date so one cell's edit
cannot silently re-date the rest.
