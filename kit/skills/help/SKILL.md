---
name: av:help
description: Open the ariadnev help index. Use when users ask how to use av, what skills are available, or which workflow to run.
metadata:
  origin: ported
---

# Help

Open the ariadnev help index when users ask how to use `av`, what skills are available, or which workflow fits their task.

Use the runtime's installed-skill catalog when available. Otherwise discover
current `SKILL.md` files from the active project and user skill roots, then read
frontmatter only for relevant candidates. Do not rely on a bundled catalog,
copied count, or remembered skill list.

Summarize only the candidates that fit the request. Route to the most specific
installed skill when the user's task is clear; state plainly when a referenced
skill is not installed.

When the user needs a command, read current `av --help` or the relevant command
help and keep examples scoped to the installed ariadnev kit. Help prose is not a
command registry.
