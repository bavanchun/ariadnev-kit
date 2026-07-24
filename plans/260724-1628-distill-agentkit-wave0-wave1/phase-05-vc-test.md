---
phase: 5
title: "Distill vc:test from ak-test"
status: done
priority: P1
effort: "3h"
dependencies: [1]
---

# Phase 5: vc:test

## Overview
Standalone test/coverage/QA runner skill — run and validate tests outside a full
cook cycle. Today only the `vc-tester` agent + cook's test-gate exist.

## Requirements
- Functional: run unit/integration/e2e; coverage analysis; build verification; QA report using the shared proof vocabulary (`unit`/`integration`/`e2e`/`platform`).
- Non-functional: cook-grade bar; reuse `vc-tester` agent; distinct description vs `vc:cook`.

## Architecture
- Distill from AgentKit `ak-test`. `kit/skills/test/SKILL.md` → `name: vc:test`; body per spec with `## Output format` (test summary + coverage table + gate verdict) and `## Workflow position` (follows cook/fix; precedes ship/git).
- Reuse cook's proof-vocabulary + risk lanes (DRY, already shared in kit rules).

## Related Code Files
- Create: `kit/skills/test/SKILL.md` (+ references if needed)
- Modify: `README.md` kit list
- Reference (read-only): AgentKit `ak-test` source

## Implementation Steps
1. Read `ak-test`; kept/dropped table + ≥1 improvement (proof-vocabulary alignment).
2. Author SKILL.md; wire graph position.
3. Description distinct from `vc:cook` (collision <0.4); add allowlist entry only if a *justified* similar pair remains (Phase 3).
4. `vc validate` + `vc eval --skill vc:test`.

## Success Criteria
- [ ] `vc:test` passes all gates + eval tier-1
- [ ] `references/parity.md` written + linked from SKILL.md (no orphan); graph edges declared; README updated
- [ ] `vc validate --check` green

## Risk Assessment
- **Overlap with cook's test-gate + vc-tester.** Mitigation: standalone framing (validate an arbitrary target now), share agent + vocabulary.
