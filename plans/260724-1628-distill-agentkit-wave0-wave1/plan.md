---
title: "Distill AgentKit → vcskill — Wave 0 (foundation) + Wave 1 (5 dev-loop skills)"
description: >-
  Kick off the full-parity distillation program. Wave 0 rewrites kit identity
  (decision 0001), adds a distillation roadmap, and recalibrates the
  description-collision gate + category taxonomy for scale. Wave 1 distills 5
  Tier-1 dev-loop skills (code-review, test, ship, review-pr, handoff) from
  AgentKit sources, each cook-grade + parity-or-better.
status: done
priority: P1
branch: main
tags:
  - kit
  - distillation
  - agentkit
  - governance
blockedBy: []
blocks: []
created: '2026-07-24T09:28:00.000Z'
createdBy: 'ak:plan'
source: skill
---

# Distill AgentKit → vcskill — Wave 0 + Wave 1

## Overview

Begin the program to distill AgentKit (`ak-*`, the kit run daily) into vcskill,
toward full-parity coverage delivered in waves. **Wave 0** lays governance +
tooling foundation so scaling from 21 → ~86 skills stays coherent and gate-safe.
**Wave 1** ships the 5 highest-value dev-loop skills that vcskill lacks today.

Source brainstorm: [`../reports/brainstorm-260724-1615-distill-agentkit-into-vcskill.md`](../reports/brainstorm-260724-1615-distill-agentkit-into-vcskill.md)

## Contract (from accepted brainstorm)

- **Outcome:** 5 new Tier-1 skills live + foundation that makes the larger program safe.
- **Constraints:** every new skill passes `skill-lint` (name==`vc:<slug>`, desc 20–200 chars w/ trigger verb, ≤300 lines, frontmatter allowlist), `reference-integrity`, `description-collision`, `eval` tier-1; carries a parity-or-better kept/dropped table vs its `ak-*` source; stays provider-agnostic (no adapt-matrix breakage); CLI changes need TDD ≥95%.
- **Non-goals:** no automated ak→vc extraction pipeline; no adapt-engine/CLI changes beyond the collision/taxonomy tooling; Tier 2/3 skills are later waves (only enumerated here, not built).
- **Acceptance:** see per-phase Success Criteria; `vc validate --check` green; README "What's in the kit" + provider matrix regenerated; decision 0001 updated.

## Phases

| # | Phase | Priority | Deps | Type |
|---|-------|----------|------|------|
| 1 | Identity & governance — rewrite decision 0001 | P1 | — | docs |
| 2 | Distillation roadmap — enumerate all remaining `ak-*` by tier/category | P2 | 1 | docs |
| 3 | Scale tooling — justified-collision allowlist + `metadata.category` taxonomy | P1 | — | code (TDD) |
| 4 | `vc:code-review` | P1 | 1 | skill |
| 5 | `vc:test` | P1 | 1 | skill |
| 6 | `vc:ship` | P2 | 4,5 | skill |
| 7 | `vc:review-pr` | P2 | 4 | skill |
| 8 | `vc:handoff` | P2 | 1 | skill |

Build order: **1 → 3 → (2 ∥ 4 ∥ 5) → 6, 7, 8**. Phase 1 sets the AgentKit baseline every parity table needs; Phase 3 makes the collision gate correct before/while descriptions multiply.

## Key decisions baked in
- **Source baseline = AgentKit** (`ak-*`), replacing the ClaudeKit baseline in decision 0001 (Phase 1).
- **Scope = full 1:1 AgentKit mirror** (validate 2026-07-24): distill *every* ak skill eventually, not a personal-use-curated subset. Phase 2 marks all as `planned`; only runtime-incompatible skills are `rejected`.
- Collision gate: **do NOT loosen thresholds**; add a *justified-similar allowlist* + re-run calibration (respects the file's stated design intent, `packages/cli/src/kit/description-collision.ts:6–8`).
- Reuse existing agents: `vc-reviewer` (code-review, review-pr), `vc-tester` (test) — standalone skills route to them (validate: "skill độc lập, reuse agent"); no new agents unless a phase proves need.
- **`vc:ship` = documented sequence** (loose coupling): references `vc:test`/`vc:code-review`/`vc:git` by name, does not hard-invoke.
- **Parity kept/dropped table → `kit/skills/<slug>/references/parity.md`** per skill, linked from SKILL.md (keeps SKILL.md under the ≤300-line gate; link avoids orphan-ref failure).

## Risks (plan-level)
- **Identity contradiction (HIGH):** Tier-3 expansion reverses decision 0001's founding "lean / anti-bloat / quality-moat" stance — and the validate choice of a **full 1:1 mirror** removes the personal-use curation safety-valve. The moat now rests entirely on the quality gates + a per-skill parity-or-better proof. Phase 1 must state this deliberately, or the kit becomes an AgentKit clone with no differentiator. Natural checkpoint to reconsider.
- **Description-collision at scale (MED):** domain skills (frontend-development vs frontend-design, backend vs web-frameworks) are legitimately similar; forcing artificial differentiation degrades descriptions. Phase 3's allowlist is the mitigation.
- **Skill vs existing agent/gate overlap (MED):** `vc:code-review`/`vc:test` overlap `vc-reviewer`/`vc-tester` + cook's embedded gates; descriptions must be distinct (invoke standalone, outside a cook cycle) or they trip collision vs `vc:cook`.
- **`vc:ship` vs `vc:git` (MED):** both touch commit/PR; ship must be framed as an orchestrator (test→review→git) with a distinct description.

## Resolved in validation (2026-07-24)
1. **Identity doc** → new `0002-comprehensive-distillation-identity.md` supersedes 0001 in part; 0001 kept as history. *(default-resolved)*
2. **`metadata.category`** → add the field now as additive/optional; no lane enforcement yet. *(default-resolved)*
3. **`vc:ship` coupling** → documented sequence (loose), not hard-invoke. *(validate)*
4. **Scope** → full 1:1 AgentKit mirror. *(validate)*
5. **code-review/test** → standalone skills that reuse `vc-reviewer`/`vc-tester`. *(validate)*
6. **Parity table** → `references/parity.md` per skill, linked from SKILL.md. *(validate)*

## Open questions
None.
