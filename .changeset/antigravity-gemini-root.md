---
"ariadnev": minor
---

Antigravity now installs to `~/.gemini/config/` — skills to
`~/.gemini/config/skills/`, agents to `~/.gemini/config/agents/` — instead of
the neutral `.agents/skills` root it inherited from codex, and its agents are
installed rather than skipped.

The old placement rested on two claims evidence has since falsified. The
upstream kit ships a dedicated emitter for this runtime whose own text says it
writes skills under `~/.gemini/config/skills` and that workspace
`.agents/skills` is *not* emitted — the one layout ariadnev was using. And the
`agent` cell's "no observation, and no neutral convention" is contradicted by 16
agent files sitting in `~/.gemini/config/agents/`, written before ariadnev
existed.

Both cells are `convention`, not `observed`: files being written to a path is
not the same as the provider reporting it read them, and every probe that would
settle it spends model credits.

Antigravity also leaves the shared `.agents/skills` root, so it no longer
collides with omp, cursor or codex there.

**Migration.** The pre-0.2.0 `.agent/skills` layout now migrates straight to the
new root, since that directory was antigravity's alone. Installs already sitting
in `.agents/skills` cannot be moved automatically: that root is shared with
cursor, omp, dsh, generic and global-scope codex, and a directory-level move
would take their files too. Uninstall antigravity with the old version first, or
remove its directories by hand — the new install records the new locations and
does not know about the old ones.
