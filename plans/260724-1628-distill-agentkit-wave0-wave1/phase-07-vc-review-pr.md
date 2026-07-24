---
phase: 7
title: "Distill vc:review-pr from ak-review-pr"
status: done
priority: P2
effort: "4h"
dependencies: [4]
---

# Phase 7: vc:review-pr

## Overview
Review a GitHub PR by number/URL — diff correctness, security, breaking changes,
AI-slop patterns — with optional `--fix`, `--reply` (post review via `gh`), and
`--merge` (merge + watch CI). Sibling of `vc:code-review` specialized to GitHub PRs.

## Requirements
- Functional: fetch PR via `gh`; review diff; optional fix/reply/merge; readiness-gated merge (refuse on conflicts/red-CI/CHANGES_REQUESTED).
- Non-functional: cook-grade bar; reuse `vc-reviewer` + Phase-4 review rubric (DRY); distinct description vs `vc:code-review`.

## Architecture
- Distill from AgentKit `ak-review-pr`. `kit/skills/review-pr/SKILL.md` → `name: vc:review-pr`; body: workflow (resolve PR → review → optional actions); `## Output format` (findings + PR verdict); `## Workflow position` (follows a PR being opened; relates to `vc:code-review`, `vc:git`).
- Share severity rubric with `vc:code-review` via a reference (avoid duplication).

## Related Code Files
- Create: `kit/skills/review-pr/SKILL.md` (+ shared references)
- Modify: `README.md` kit list
- Reference (read-only): AgentKit `ak-review-pr` source; Phase-4 rubric

## Implementation Steps
1. Read `ak-review-pr`; kept/dropped table + ≥1 improvement.
2. Author SKILL.md; reuse Phase-4 severity rubric; wire graph.
3. Description distinct from `vc:code-review` (PR-specialized, `gh`-driven, action flags).
4. Confirm `gh`-dependent steps degrade gracefully when `gh` absent.
5. `vc validate` + `vc eval --skill vc:review-pr`.

## Success Criteria
- [ ] `vc:review-pr` passes all gates + eval tier-1
- [ ] Shared rubric reference resolves (no orphan/dangling)
- [ ] `references/parity.md` written + linked from SKILL.md (no orphan); README updated; `vc validate --check` green

## Risk Assessment
- **Collision with `vc:code-review`.** Mitigation: distinct trigger (GitHub PR + action flags) and description; shared rubric via reference, not copy.
- **`--merge`/`--reply` are outward actions.** Mitigation: readiness-gated + explicit user confirmation documented in the skill.
