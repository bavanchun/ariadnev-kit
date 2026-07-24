---
phase: 6
title: "Distill vc:ship from ak-ship"
status: done
priority: P2
effort: "4h"
dependencies: [4, 5]
---

# Phase 6: vc:ship

## Overview
An orchestrator skill: take a finished branch through test → review → commit →
push → PR in one pass. Distinct from `vc:git` (raw git ops) — `vc:ship` is the
pipeline that sequences test/review/git.

## Requirements
- Functional: merge-main → test (`vc:test`) → review (`vc:code-review`) → commit/push/PR (`vc:git`); supports official (main) + beta branch targets; single command from feature branch to PR URL.
- Non-functional: cook-grade bar; description clearly an *orchestrator* (distinct vs `vc:git`).

## Architecture
- Distill from AgentKit `ak-ship`. `kit/skills/ship/SKILL.md` → `name: vc:ship`; body: workflow sequences the three skills; `## Output format` (pipeline step table + PR URL); `## Workflow position` (follows cook/code-review/test; terminal → PR).
- Coupling (resolved, validate): **documented sequence** — *references* `vc:test`/`vc:code-review`/`vc:git` by name (loose coupling, KISS); does not hard-invoke.

## Related Code Files
- Create: `kit/skills/ship/SKILL.md` (+ references if needed)
- Modify: `README.md` kit list
- Reference (read-only): AgentKit `ak-ship` source; existing `vc:git` references

## Implementation Steps
1. Read `ak-ship`; kept/dropped table + ≥1 improvement.
2. Author SKILL.md; sequence the pipeline; wire graph.
3. Ensure description distinct from `vc:git` (collision <0.4).
4. `vc validate` + `vc eval --skill vc:ship`.

## Success Criteria
- [ ] `vc:ship` passes all gates + eval tier-1
- [ ] References `vc:test`/`vc:code-review`/`vc:git` without dangling links
- [ ] `references/parity.md` written + linked from SKILL.md (no orphan); README updated; `vc validate --check` green

## Risk Assessment
- **Collision with `vc:git`.** Mitigation: frame as orchestrator; git = mechanics, ship = pipeline. Allowlist entry only if a justified similar pair remains.
