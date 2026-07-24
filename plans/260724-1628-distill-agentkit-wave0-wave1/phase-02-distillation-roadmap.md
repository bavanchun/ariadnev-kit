---
phase: 2
title: "Distillation roadmap — enumerate all remaining ak-* by tier/category/status"
status: done
priority: P2
effort: "3h"
dependencies: [1]
---

# Phase 2: Distillation roadmap

## Overview
Create the missing "not yet distilled" tracking doc: every AgentKit skill mapped
to a vcskill status, grouped by tier + category, so waves are picked from a list
not from memory.

## Requirements
- Functional: table of all `ak-*` skills → status + target `vc:<slug>` + tier + category + one-line rationale. Per validate (full 1:1 mirror), status ∈ {distilled ✓ / planned / rejected-runtime-incompatible}; **no `deferred-by-use`** bucket — everything not-yet-done is `planned`.
- Non-functional: single source of truth; cheap to update per wave; no automation.

## Architecture
One doc `docs/distillation-roadmap.md`. Rows sourced from the AgentKit catalog (already inventoried in the brainstorm's Tier map). Categories: core-loop · meta/authoring · frontend · backend · data · devops/deploy · mobile · security/intel · media/content · docs/publishing · browser/automation · misc.

## Related Code Files
- Create: `docs/distillation-roadmap.md`
- Reference: `plans/260724-1628-.../plan.md`, brainstorm report

## Implementation Steps
1. List all 21 already-distilled `vc:*` with status ✓ (map back to `ak-*` source name).
2. List Tier-1 remaining (code-review, ship, review-pr, test, handoff → **planned, this wave**; use-mcp, retro, watzup → planned).
3. List Tier-2 meta/authoring (repomix, preview, find-skills, folder-context, mcp-builder, agentize, context-engineering, issue-to-plan, xia, interview-docs, orchestrate/team/vibe, llms, mermaidjs, excalidraw, tech-graph) → planned.
4. List Tier-3 domain/media by category → planned (note: heavy; later waves).
5. Mark only runtime-incompatible skills as `rejected` + reason (e.g., deep-swe, codex-goal, agentwiki if tied to a runtime vcskill can't target). Default is `planned`.
6. Add a "wave log" section: Wave 0/1 = this plan.

## Success Criteria
- [ ] Every `ak-*` skill appears exactly once with a status
- [ ] 21 current `vc:*` correctly marked ✓ with source mapping
- [ ] Wave 1's 5 skills marked `planned`
- [ ] Doc ≤ its own size budget; linked from README or 0002

## Risk Assessment
- **Staleness.** Mitigation: doc is the wave-picker; each future wave updates statuses as its first step.
