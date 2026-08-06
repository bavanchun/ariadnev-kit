---
phase: 5
title: "Reshape the eight most compressed skills"
status: completed
priority: P2
effort: "1-2w"
dependencies: [2, 4]
---

# Phase 5: Reshape the eight most compressed skills

## Overview

Convert the 8 skills that remain the most compressed against their current upstream authored Markdown mass from flat-and-thin to router-thin/references-deep, restoring the operational substance that was deleted rather than deferred. Gated by the strict Phase 4 coverage command so restoration is verifiable rather than felt.

## Requirements

- Functional: each of the 8 has a SKILL.md that routes (~100–150 lines) and ≥1 `references/*.md` carrying the restored detail; strict `vcskill coverage --skill <name>` exits zero for each (no unclassified claims, no unmatched-but-not-rejected claims).
- Non-functional: references stay one level deep from SKILL.md — no nested reference chains. Restored content is traceable to the pinned upstream version, never to memory. One skill per commit.

## Architecture

The insight this phase acts on: AgentKit's heavy skills are **thin routers over deep references** (`ak-web-testing` is a 103-line SKILL.md over 24 reference files; 63 of 97 skills carry references). vcskill has 13 of 26 skills with zero references. The gap was never that ak writes more — it is that ak *defers* while vcskill *deleted*.

Selection is by measured compression ratio, not taste. The table was re-measured on 2026-08-06 after Phase 1 and current upstream changes; the same eight remain selected. Ratios are triage snapshots, while Phase 3's pin output owns the exact execution baseline:

| vc skill | ak source | ak version | ak LOC | vc LOC | ratio |
|---|---|---|---|---|---|
| `skill-creator` | `ak-skill-creator` | 4.0.0 | 2107 | 78 | 4% |
| `plan` | `ak-plan` | 1.4.0 | 2230 | 181 | 8% |
| `fix` | `ak-fix` | 2.2.0 | 1346 | 136 | 10% |
| `sequential-thinking` | `ak-sequential-thinking` | 1.0.0 | 806 | 92 | 11% |
| `code-review` | `ak-code-review` | 2.0.0 | 1330 | 162 | 12% |
| `docs-seeker` | `ak-docs-seeker` | 3.1.0 | 574 | 70 | 12% |
| `problem-solving` | `ak-problem-solving` | 2.0.0 | 676 | 88 | 13% |
| `bootstrap` | `ak-bootstrap` | 1.0.0 | 417 | 66 | 16% |

Excluded second tier: `ship` 21%, `review-pr` 23%, `cook` 26%, `scout` 31%.

**No cap change needed.** `REFERENCE_MAX_LINES = 300` is not binding — the kit's largest reference today is 177 lines and all references total 2007. Decision 0001's lean-kit identity was already reinterpreted by 0003 as "no low-quality/redundant skills", not "few skills".

Per-skill method: pin current canonical upstream tree (Phase 3 output) → review extracted claims, classify covered/rejected → keep SKILL.md as a router → place restored substance in `references/*.md` grouped by decision point, not by source order → run strict `vcskill coverage --skill <name>` → commit.

## Related Code Files

- Modify: `kit/skills/{skill-creator,plan,fix,sequential-thinking,code-review,docs-seeker,bootstrap,problem-solving}/SKILL.md`
- Create: `kit/skills/<name>/references/*.md` for each of the 8
- Modify: `kit/distill-decisions.json` — claim classifications per skill
- Modify: `docs/vc-skill-authoring-spec.md` — record router-thin/references-deep as the standard shape

## Implementation Steps

1. Start with `docs-seeker` (smallest source, 574 lines) to establish the pattern and calibrate reference granularity. Land it alone and review before continuing.
2. Then `problem-solving` (676) and `bootstrap` (417) — mid-size, low blast radius.
3. Then `sequential-thinking` (806) and `code-review` (1330).
4. Then `fix` (1346) and `plan` (2230) — the highest-traffic skills; reshape only after the pattern is proven on five.
5. Last `skill-creator` (2107, 4% — the most compressed): it governs how skills are authored, so it should absorb every lesson from the previous seven.
6. For each: classify claims, restore into references, require strict `vcskill coverage --skill <name>` exit 0, verify aggregate `vcskill validate` (coverage findings remain visible warnings during rollout), run `pnpm test`, commit.
7. After all eight pass the strict standalone command, flip only the aggregate validate mapping for finding kind `coverage` from `warn` to `error`; rerun the full suite and commit the policy flip.
8. Update the authoring spec with the standard shape, strict-versus-aggregate command contract, and the reference-granularity guidance learned in step 1.

## Success Criteria

- [x] All 8 have ≥1 `references/*.md`
- [x] All 8 SKILL.md bodies are ~100–150 lines and route rather than contain
- [x] Strict `vcskill coverage --skill <name>` exits zero for all 8 — zero unclassified claims, zero unmatched-but-not-rejected claims
- [x] During rollout, aggregate `vcskill validate` surfaces those same finding identities as warnings without changing the strict standalone result
- [x] After all 8 are clean, only the aggregate validate coverage mapping is flipped from `warn` to `error`, and the flip is committed

<!-- Updated: Validation Session 2 - standalone coverage stays strict; only aggregate validate is warn-first -->
- [x] No reference chain deeper than one level from SKILL.md
- [x] `vcskill validate` clean throughout; the Phase 2 bar still holds
- [x] One skill per commit, each independently revertible
- [x] `pnpm test` green at every commit
- [x] Authoring spec records the standard shape

## Completion Record — 2026-08-06

The eight skills landed independently in the planned order (`d818c69` through
`49687c2`). Their routers are 119–143 lines with 2–5 directly linked reference
files each. Strict coverage passes with no unclassified or unmatched claims;
the final classifications total 206 covered and 101 explicitly rejected claims.

Commit `d105bb2` promoted aggregate coverage from the tested rollout-warning
policy to the default error gate. The authoring spec now requires router-thin,
direct-reference structure and documents the ratchet's proof boundary.

## Risk Assessment

- **These are the most-used skills, and there are no golden tasks yet.** Mitigation: one skill per commit, ordered smallest-blast-radius first; `fix` and `plan` only after five are proven. Any regression is a single revert.
- **Restoration could reintroduce ak-specific content that does not apply** (AgentKit CLI dependencies, AgentWiki publishing, dashboards). Mitigation: that is precisely what the `rejected` classification is for — record the reason once, in the registry.
- **Token cost rises.** Mitigation: restored mass lands in `references/`, loaded conditionally; SKILL.md bodies get *shorter*, not longer. Verify by measuring SKILL.md line counts before/after.
- **Reference granularity is a judgment call** that compounds across 8 skills and later across 97. Mitigation: step 1 establishes the pattern on one skill and it is reviewed before the rest proceed.
- **Coverage gate is a ratchet, not proof of fidelity.** Restated here because this is the phase most likely to be mistaken for parity work. Outcome regression on golden tasks remains deferred.
