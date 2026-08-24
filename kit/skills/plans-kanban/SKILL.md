---
name: av:plans-kanban
description: Use to inspect plan progress and navigate plan files with ariadnev's plan CLI.
user-invocable: true
when_to_use: "Invoke to open or inspect the plans dashboard."
category: dev-tools
keywords: [plans, dashboard, kanban, progress, timeline]
argument-hint: "[deprecated flags are accepted with warnings]"
metadata:
  origin: ported
  author: upstream
  version: "2.0.0"
---

# plans-kanban

Use the plan CLI to inspect progress and navigate the files that remain the
source of truth. Ariadnev does not ship a plans dashboard server.

## Workflow

1. Run `av plan list` to locate active plans and their phase progress.
2. Run `av plan show` for the plan currently selected by the branch, or
   `av plan use <name>` to select a plan directory under `plans/`.
3. Run `av plan phase <phase>` to read a phase before changing it.
4. Use `av plan update <phase> <status>`, `check`, or `uncheck` only after the
   phase's work and validation are complete.
5. Open the returned `plan.md` and `phase-*.md` paths in the editor when a
   visual kanban view would otherwise be useful.

`scripts/open-dashboard.cjs` is a compatibility launcher for the same
read-only plan listing; it does not create a server or open a browser.

## Output format

Return the selected plan path, its overall status, a table of phases with their
current statuses, and the next unblocked phase. State whether any plan mutation
was made and cite the phase file that records it.

## Quality gates

- Inspect `av plan --help` before relying on a command or flag.
- Read the target phase file before updating its status or checkboxes.
- Treat `plan.md` and phase files as canonical; do not infer state from a
  dashboard, issue, or stale report.
- Keep project plans scoped to the current repository unless the user asks for
  a global plan.

## Workflow position

**Typically follows:** `av:plan` when an accepted plan needs progress tracking.
**Typically precedes:** `av:cook` for the next unblocked implementation phase.
**Related:** `av:project-management` synchronizes plan state after delivery.
