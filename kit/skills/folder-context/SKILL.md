---
name: av:folder-context
description: "Use when creating compact subfolder CLAUDE.md and linked AGENTS.md files for durable local conventions beyond project-root instructions."
user-invocable: true
when_to_use: Invoke for subfolder-scoped agent context, not root project instructions or general docs.
category: utilities
keywords: [claude-md, agents-md, context, folder, conventions]
license: MIT
argument-hint: "<target-folder>"
metadata:
  origin: ported
  author: upstream
  version: "1.0.1"
  upstream: "Pinned MIT source archive: folder-specific-claude-and-agents-md@ce70edaa26247b84c2b9491a0cdb4964f65cf3a5"
---

# Folder Context

Create durable context only for a subfolder that carries decisions, conventions,
or ongoing work a future agent cannot reliably infer. This skill never edits the
root CLAUDE.md or root AGENTS.md.

## Workflow

1. Confirm the target is a subfolder and inspect its key source, configuration,
   Markdown, and local context files.
2. Apply a sanity gate: do not create files for static reference folders or
   folders whose context can be discovered on demand.
3. Propose a grouped outline and wait for user confirmation before writing.
4. Write a compact target-folder CLAUDE.md using only evidence from the folder
   or explicit user decisions. Omit empty sections.
5. Create target-folder AGENTS.md as a symlink to CLAUDE.md. If symlinks are
   unavailable, create a one-line pointer file that names CLAUDE.md and tell the
   user about the fallback.
6. When the user edits the context file, re-read it and flag contradictions.
   Never revert their edits without instruction.

## Useful Sections

- Purpose and essential files with one-line roles
- Constraints, especially explicit MUST NOT rules
- Conventions and naming
- Locked decisions with dates
- Context needed across sessions

Keep file content compact, specific, and local. Use bullets rather than a file
tree or generic project documentation.

## Boundaries and Safety

- Use av-docs for project documentation under docs.
- For the root CLAUDE.md/AGENTS.md, use `/av:docs agent-context`; this skill
  stays subfolder-only and never edits the root.
- Do not duplicate root instructions, invent constraints, write credentials, or
  create context files outside the confirmed target.
- Respect the user’s existing local instructions before adding new context.

## Output format

Return the target folder, evidence inspected, sections added or updated, the
CLAUDE.md path, AGENTS.md link/fallback status, and any contradiction or decision
that still needs the user.

## Quality gates

- [ ] Target is a subfolder with durable context that cannot be inferred cheaply.
- [ ] Existing root and local instructions were read and not duplicated.
- [ ] Every stated convention is supported by code, config, or a user decision.
- [ ] Content is compact, local, free of secrets, and omits empty sections.
- [ ] AGENTS.md resolves to CLAUDE.md or the fallback is reported accurately.
- [ ] User edits and contradictions are preserved and surfaced, not overwritten.

## Workflow position

**Typically follows:** `av:scout` of the target folder and user confirmation of
the proposed outline.

**Typically precedes:** implementation work in that folder.

**Related:** `av:docs` for project documentation and root agent-context work;
`av:handoff` for session state rather than durable folder conventions.
