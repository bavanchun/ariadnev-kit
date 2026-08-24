---
name: av:help
description: "Use when answering how to use av, what skills are currently installed, which workflow fits, or where to find command help."
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

## Output format

Return the most specific installed capability, why it matches, its invocation or
current command help, and one fallback when no installed capability fits.

## Quality gates

- [ ] Installed skill catalog and current CLI help were read, not recalled.
- [ ] Suggested skill exists and its trigger matches the request.
- [ ] Command examples use registered commands and current flags.
- [ ] Answer is scoped to relevant candidates rather than dumping the catalog.
- [ ] Missing capabilities are stated plainly without inventing commands.

## Workflow position

**Typically follows:** an ambiguous request about ariadnev capability or usage.

**Typically precedes:** the selected installed skill or direct CLI command.

**Related:** `av:find-skills` for external capability discovery and
`av:ariadnev` for kit-level operation and troubleshooting.
