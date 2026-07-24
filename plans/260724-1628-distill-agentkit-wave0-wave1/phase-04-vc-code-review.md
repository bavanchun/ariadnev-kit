---
phase: 4
title: "Distill vc:code-review from ak-code-review"
status: done
priority: P1
effort: "4h"
dependencies: [1]
---

# Phase 4: vc:code-review

## Overview
Standalone, evidence-based code review skill for diffs/PRs/commits/codebase —
usable *outside* a cook cycle (review code you didn't write). Fills the biggest
gap: today vcskill only has the `vc-reviewer` agent + cook's embedded review-gate.

## Requirements
- Functional: input modes pending-changes | PR# | commit | codebase-scan; output = ranked findings (bug/regression/maintainability/verification-gap) with severity + file:line; no auto-fix by default.
- Non-functional: cook-grade bar; reuse `vc-reviewer` agent for heavy analysis; distinct description vs `vc:cook`.

## Architecture
- Distill from AgentKit source `~/.claude/skills/ak-code-review` (read its SKILL.md + references as inert reference; adapt to vc format, do not copy verbatim).
- `kit/skills/code-review/SKILL.md` → `name: vc:code-review`; body: opening → hard rules (evidence-based, no nitpicks, confidence filter) → workflow (pick input mode → scout → review via `vc-reviewer` → rank) → `## Output format` (findings table + verdict) → `## Quality gates` → `## Workflow position` (follows cook/fix; precedes git/ship).
- references/ if needed: `severity-rubric.md`, `input-modes.md`.

## Related Code Files
- Create: `kit/skills/code-review/SKILL.md` (+ `references/*` as needed)
- Modify: `README.md` kit list; regenerate provider matrix if artifact counts shown
- Reference (read-only): AgentKit `ak-code-review` source

## Implementation Steps
1. Read `ak-code-review` source; build kept/dropped-with-reason table + ≥1 improvement (e.g. vcskill risk-lane vocabulary integration).
2. Author SKILL.md to spec; wire `## Workflow position` into the graph.
3. Ensure description distinct from `vc:cook`/`vc:fix` (collision Jaccard <0.4).
4. `vc validate` + `vc eval --skill vc:code-review`.

## Success Criteria
- [ ] `vc:code-review` passes lint + reference-integrity + collision + eval tier-1
- [ ] `references/parity.md` written (kept/dropped + ≥1 improvement) and linked from SKILL.md (no orphan)
- [ ] Graph edges declared; README updated; `vc validate --check` green

## Risk Assessment
- **Overlap with cook's review-gate.** Mitigation: frame as standalone/any-target review; share the `vc-reviewer` agent + risk lanes (DRY), differentiate the trigger.
