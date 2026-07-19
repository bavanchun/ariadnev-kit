# Plan File Templates

Copy these shapes verbatim when scaffolding; keep frontmatter keys stable so
other tools (vc:cook, vc:pm) can parse them.

## plan.md (hub — keep short, link out)

```markdown
---
title: "<one-line goal>"
description: "<what ships when this plan is done>"
status: pending            # pending | in-progress | completed | cancelled
priority: P2               # P1 urgent · P2 normal · P3 nice-to-have
branch: "<git branch>"
tags: []
blockedBy: []              # other plan dirs that must finish first
created: "<ISO timestamp>"
---

# <title>

## Overview
2-4 sentences: context, chosen approach, link to the brainstorm report.

## Phases
| Phase | Name | Status |
|-------|------|--------|
| 1 | [<name>](./phase-01-<slug>.md) | Pending |

Dependency notes: <"1 → 2 → 3" or parallel groups>.

## Acceptance Criteria (whole plan)
- [ ] <verifiable outcome 1>
- [ ] <verifiable outcome 2>

## Dependencies
Cross-plan / external dependencies, or "none".
```

## phase-NN-slug.md (one per phase — executable alone)

```markdown
---
phase: 1
title: "<phase name>"
status: pending            # pending | in-progress | completed
priority: P1
effort: "<estimate, e.g. 3h>"
dependencies: []           # phase numbers this depends on
---

# Phase 1: <name>

## Overview
Why this phase exists and what "done" looks like.

## Requirements
Functional + non-functional, each one sentence.

## Related Code Files
- Modify: `path/one.ts`
- Create: `path/two.ts`
- Delete: (or omit)

## Implementation Steps
1. Tests first: <what failing test proves the gap>
2. <step>
3. Verify: <exact command(s)>

## Success Criteria
- [ ] <testable check>

## Risk Assessment
- <risk> → <mitigation / rollback>
```

## Naming

- Plan dir: `plans/{yymmdd-hhmm}-{kebab-slug}/` (timestamp of creation)
- Reports produced during execution: `plans/reports/{type}-{yymmdd-hhmm}-{slug}-report.md`
- Never reuse a plan dir for a different effort — new goal, new dir.
