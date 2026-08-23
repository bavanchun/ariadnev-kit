---
name: av:web-design-guidelines
description: Review UI code for Web Interface Guidelines compliance. Use when asked to "review my UI", "check accessibility", "audit design", "review UX", or "check my site against best practices".
user-invocable: true
when_to_use: "Invoke for accessibility and UX guideline reviews."
category: frontend
keywords: [ui-review, accessibility, ux-audit]
argument-hint: "[file-or-pattern]"
metadata:
  origin: ported
  author: upstream
  version: "1.0.0"
---

# Web Interface Guidelines

Review files for compliance with Web Interface Guidelines.

## How It Works

1. Fetch the latest guidelines from the source URL below
2. Read the specified files (or prompt user for files/pattern)
3. Check against all rules in the fetched guidelines
4. Output findings in the terse `file:line` format

## Guidelines Source

Fetch fresh guidelines before each review:

```
https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md
```

Use web_search capability to retrieve the latest rules. The fetched content contains all the rules and output format instructions.

## Usage

When a user provides a file or pattern argument:
1. Fetch guidelines from the source URL above
2. Read the specified files
3. Apply all rules from the fetched guidelines
4. Output findings using the format specified in the guidelines

If no files specified, ask the user which files to review.

## Output format

Return terse `file:line` findings grouped by severity or guideline, followed by
a short scope and limitations note. Include no finding when the inspected code
already complies.

## Quality gates

- Fetch the current source guidelines and distinguish them from project-specific conventions.
- Inspect the cited line and surrounding code before reporting a violation.
- Keep the review read-only unless the user separately asks for implementation.

## Workflow position

Use after UI code exists and before final frontend review or release. Route
implementation work to `av:frontend-development` and accessibility execution
to `av:web-testing`.
