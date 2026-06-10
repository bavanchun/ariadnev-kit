# Frontmatter Schema

Use YAML frontmatter for every durable Obsidian note.

## Reconcile Before Imposing (read first)

This standard schema is the *target*, not a blind override.

1. **Detect** the vault's existing frontmatter (read the template + 1-2 domain notes).
2. Decide:
   - Existing schema is sound → **conform**: reuse its exact keys and date format (including locale, e.g. Vietnamese `thứ bảy, 16/05/2026`). Add only additive, non-breaking keys (`aliases`, `related`, `updated`).
   - Existing schema is weak/inconsistent → **propose migration** to this standard and apply it uniformly.
3. Never run two competing schemas in one vault. Never silently discard keys the user relies on (e.g. `topic`, `os`, `level`) without flagging it.
4. State which path you took in the final report.

## Standard Schema

```yaml
---
title: Note Title
created: YYYY-MM-DD
updated: YYYY-MM-DD
status: seedling
type: concept-note
domain: artificial-intelligence
aliases:
  - Short Name
tags:
  - ai
  - ai/topic
  - second-brain/concept
related:
  - "[[AI/Concepts/Example|Example]]"
source:
---
```

## Status

- `seedling`: new idea, incomplete
- `budding`: useful but still growing
- `evergreen`: polished durable note

## Type

Use one:

- `concept-note`
- `literature-note`
- `project-note`
- `pipeline-note`
- `moc`
- `daily-capture`

## Tags

Use nested tags:

```yaml
tags:
  - ai
  - ai/speech
  - ai/asr
  - second-brain/concept
```

Avoid:

```yaml
tags:
  - important
  - note
  - random
```

## Related Links

Prefer path links with aliases:

```yaml
related:
  - "[[AI/Concepts/Voice Cloning|Voice Cloning]]"
```

This prevents duplicate files and keeps root vault clean.

