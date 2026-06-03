---
name: vc:echo-tool
description: >-
  Sample skill exercising frontmatter tool adaptation. Use when you need to
  echo input back and orchestrate a sub-task across providers.
allowed-tools:
  - Task
  - AskUserQuestion
  - TodoWrite
argument-hint: "[text to echo]"
metadata:
  author: vcskill
  version: 0.1.0
---

# Echo Tool

Echo `$ARGUMENTS` back to the user.

Orchestration notes: use the `Task tool` to spawn `Task(Explore)` when input is
ambiguous, ask via `AskUserQuestion`, and track steps with `TodoWrite`. The
runnable helper lives at `.claude/skills/echo-tool/scripts/echo.ts`.
