# Plan File Templates

Read any existing hub and every phase stub before applying these shapes. Keep
frontmatter keys stable so `av:cook` and `av:pm` can consume the files.

## `plan.md` — concise hub

```markdown
---
title: "<one-line goal>"
description: "<observable result when complete>"
status: pending            # pending | in-progress | completed | cancelled
priority: P2               # P1 urgent | P2 normal | P3 nice-to-have
effort: "<total estimate>"
branch: "<current branch>"
tags: []
blockedBy: []              # plan directory names
blocks: []
created: "<YYYY-MM-DD>"
---

# <title>

## Overview
<context, accepted approach, and owning report/spec links>

## Goals
- <goal>

## Phases
| # | Phase | Status | Depends on | Risk |
|---|---|---|---|---|
| 1 | [<human name>](./phase-01-<slug>.md) | Pending | — | normal |

Dependency order: <1 → 2; 3 and 4 independent>.

## Non-goals
- <deliberately excluded work>

## Constraints
- <compatibility, safety, ownership, project rules>

## Acceptance Criteria
- [ ] <verifiable whole-plan outcome>

## Risks
| Risk | Signal | Mitigation / rollback |
|---|---|---|

## Open Questions
None.
```

## `phase-NN-slug.md` — executable slice

```markdown
---
phase: 1
title: "<phase name>"
status: pending            # pending | in-progress | completed
priority: P1
effort: "<estimate>"
dependencies: []           # phase numbers
---

# Phase 1: <name>

## Overview
<why this slice exists and what done means>

## Requirements
- Functional: <behavior>
- Non-functional: <quality/compatibility boundary>

## Architecture
<data flow, contracts, ownership, and accepted rationale>

## Related Code Files
- Modify: `path/one.ts` — <change and owner>
- Create: `path/two.test.ts` — <coverage>
- Delete: `path/old.ts` — <migration/rollback>, or omit

## Implementation Steps
1. Tests before: <failing/regression evidence>
2. <smallest implementation step>
3. Verify: `<exact command>`

## Success Criteria
- [ ] <observable check with evidence>

## Risk Assessment
- <risk> — signal: <observable>; response: <mitigate, roll back, or replan>

## Stop Conditions
- <specific evidence that requires a material user decision>

## Validation Log
- <commands/results or `Not started`>
```

## Naming and links

- Directory: `plans/{yymmdd-hhmm}-{kebab-slug}/`.
- Phases: `phase-NN-{kebab-slug}.md`, ordered by dependency.
- Reports: use the repository's configured reports location.
- Use human-readable link labels and repo-relative targets inside plan files.
- Never reuse a plan directory for another goal.
