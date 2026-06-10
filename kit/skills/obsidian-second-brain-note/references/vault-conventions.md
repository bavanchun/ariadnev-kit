# Vault Conventions — your-vault

Concrete conventions for the known vault. Read this first when working in it. If working in a *different* vault, detect its conventions instead (do not assume these).

## Vault

- Path: `~/Codes/Docs/Obsidian/your-vault`
- Separate git repo, branch `main` → `origin/main`. Commit only when user asks (skill default).
- Bilingual: Vietnamese + English. Match the note's language to its source/user. Do not switch arbitrarily.

## Frontmatter Schema (in use — conform to this)

```yaml
---
type: note            # or moc, concept-note, literature-note, project-note, pipeline-note
aliases: []
tags:
  - <domain>
  - <domain>/<subtopic>
status: seedling       # seedling | budding | evergreen  (older notes use draft — migrate to seedling)
topic: <Topic>
domain: <Domain>
source: <source or blank>
os: all                # legacy keys kept for backward consistency — keep, do not drop
level: all             # legacy — keep
created: thứ bảy, 16/05/2026     # Vietnamese: "thứ <2..7|nhật>, DD/MM/YYYY"
updated: thứ bảy, 16/05/2026
related:
  - "[[Path/To/Note|Alias]]"
---
```

- Date format is **Vietnamese day-of-week**: `thứ hai/ba/tư/năm/sáu/bảy` (Mon–Sat), `chủ nhật` (Sun), then `DD/MM/YYYY`. Compute the weekday for the real date.
- `os` / `level` are legacy keys the user kept — preserve them, do not silently delete.
- Body starts directly with `# <Title>`. **NO `# 📅 Daily —` header** on knowledge notes (that was a template bug, now fixed).

## Template Bug (history — do not reintroduce)

`Templates/create-new-note.md` originally copied `# 📅 Daily — <date>` from the journal template, so every generated note looked like a diary entry. Fixed 2026-05-16. The genuine daily-journal template is `Templates/daily.md` and real daily notes live in `Daily/` — only those keep the Daily header.

## Folder Taxonomy

```
00-Inbox/            unsorted captures (has 00-Inbox.md hub)
<Domain>/
  <Domain> MOC.md    domain map (MANDATORY per domain)
  Concepts/          atomic reusable ideas
  <Topic-Slug>/      pipelines / deep dives / course sections
  Projects/
Templates/           excluded from audits
Daily/               real daily journals only
Dashboard.md         vault homepage (root) — links every MOC
```

Known domains: `AI` (+ `AI/Tools/AI Tools MOC.md` sub-MOC), `Backend`, `DevOps`, `FPT`, `Frontend`, `Flutter-and-Dart`. Root must contain only `Dashboard.md`.

## MOC + Hub Conventions

- Every domain has `<Domain>/<Domain> MOC.md`, `type: moc`, grouped navigational links, kept < ~150 lines.
- `Dashboard.md` Command Center table links every MOC + has a "Learning Domains" dataview per domain. When adding a new domain, add it to both.
- Concept notes use bidirectional `related:` (path links with aliases) + in-body links. Pipeline/hub notes link OUT to canonical `Concepts/` notes instead of re-explaining them.

## Audit Tooling

Use the connectivity scan in `quality-checklist.md`. Python venv with deps: `~/.claude/skills/.venv/bin/python3`. Exclude `.obsidian/` from commits (plugin metadata churn) — stage content files explicitly, never `git add -A`.
