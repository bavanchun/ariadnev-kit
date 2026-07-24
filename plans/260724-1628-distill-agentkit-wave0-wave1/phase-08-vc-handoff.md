---
phase: 8
title: "Distill vc:handoff from ak-handoff"
status: done
priority: P2
effort: "3h"
dependencies: [1]
---

# Phase 8: vc:handoff

## Overview
Produce a concise, redacted conversation/session handoff for a fresh agent
session — decisions, state, blockers, next steps. Distinct from `vc:pm` (plan
status) and `vc:journal` (post-mortem reflection).

## Requirements
- Functional: compact current session state (goal, decisions, files touched, blockers, next actions), redacting secrets/private paths; output a paste-ready handoff block.
- Non-functional: cook-grade bar; distinct description vs `vc:pm` + `vc:journal`.

## Architecture
- Distill from AgentKit `ak-handoff`. `kit/skills/handoff/SKILL.md` → `name: vc:handoff`; body: workflow (gather state → redact → format); `## Output format` (handoff template); `## Workflow position` (follows any session end; precedes a fresh session / teammate pickup).
- Redaction reuses the CLI's credential-redaction posture (reference only; skill is markdown).

## Related Code Files
- Create: `kit/skills/handoff/SKILL.md` (+ `references/handoff-template.md`)
- Modify: `README.md` kit list
- Reference (read-only): AgentKit `ak-handoff` source

## Implementation Steps
1. Read `ak-handoff`; kept/dropped table + ≥1 improvement.
2. Author SKILL.md + handoff template reference; wire graph.
3. Description distinct from `vc:pm`/`vc:journal` (collision <0.4).
4. `vc validate` + `vc eval --skill vc:handoff`.

## Success Criteria
- [ ] `vc:handoff` passes all gates + eval tier-1
- [ ] Redaction rules stated; template reference resolves
- [ ] `references/parity.md` written + linked from SKILL.md (no orphan); README updated; `vc validate --check` green

## Risk Assessment
- **Overlap with `vc:pm`/`vc:journal`.** Mitigation: handoff = forward-looking session compaction; pm = plan truth; journal = retrospective. Differentiate descriptions.
