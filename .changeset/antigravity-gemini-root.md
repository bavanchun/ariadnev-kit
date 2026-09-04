---
"ariadnev": minor
---

Antigravity now installs to `~/.gemini/config/` — skills to
`~/.gemini/config/skills/`, agents to `~/.gemini/config/agents/` — instead of
the neutral `.agents/skills` root it inherited from codex, and its agents are
installed rather than skipped.

The old placement rested on a claim evidence has since falsified: the upstream
kit ships a dedicated emitter for this runtime whose own text says it writes
skills under `~/.gemini/config/skills` and that workspace `.agents/skills` is
*not* emitted — the one layout ariadnev was using.

The `agent` cell is `observed`: `agy agent` on 1.1.25 enumerates an agent file
planted at exactly that path, so the runtime is reporting that it read it. The
`skill` cell stays `convention` — 1.1.25 ships no `skill` subcommand, so there
is no listing surface to hold it to the same standard, and every probe that
would settle it spends model credits.

Antigravity also leaves the shared `.agents/skills` root, so it no longer
collides with omp, cursor or codex there.

**Migration.** The pre-0.2.0 `.agent/skills` layout now migrates straight to the
new root, since that directory was antigravity's alone. Installs already sitting
in `.agents/skills` cannot be moved automatically: that root is shared with
cursor, omp, dsh, generic and global-scope codex, and a directory-level move
would take their files too. Uninstall antigravity with the old version first, or
remove its directories by hand — the new install records the new locations and
does not know about the old ones.
