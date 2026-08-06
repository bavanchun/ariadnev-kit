---
title: "vc skill-set update compliance sweep and tier-1 reshape"
description: "Bring all 26 vc skills to their stated bar, add canonical whole-tree upstream provenance, reshape the 8 most-compressed skills, and benchmark every vc skill with an honest static scorecard."
status: completed
priority: P1
effort: "2-3w"
tags: [kit, skills, distillation, quality-gates]
created: 2026-08-04
blockedBy: []
blocks: []
---

# vc skill-set update compliance sweep and tier-1 reshape

## Overview

The kit passed `validate` at plan creation only because `validate` did not check the bar the README claimed. 8 of 26 skills met it; `cook` (the reference implementation) lacked `## Workflow position` and `skill-creator` lacked all three required sections. Phase 1 closed that structural gap. Separately, the same 8 skills remain the most compressed against their AgentKit source's authored Markdown mass (4–16% when re-measured on 2026-08-06 after Phase 1) — compressed by **deleting** rather than **deferring** — and nothing links a vc skill back to a canonical upstream source-tree identity.

This plan closes that in six phases: fix the content, turn on enforcement, add provenance, build a coverage gate, reshape the 8 worst-compressed skills using that gate, then benchmark all 26 skills individually.

Accepted contract: `plans/reports/brainstorm-260804-1033-vc-skill-update-a-plus-b.md` (scope A + B).
Evidence: `plans/reports/scout-260804-0853-vcskill-kit-state-and-harness.md`, `scout-260804-0909-agentkit-2.8-reference-study.md`, `advise-260804-1005-core-harness-distillation.md`, and 4 research reports dated 260804-0944/0959.

**Two constraints previously assumed to block this do not exist.** `REFERENCE_MAX_LINES = 300` is not binding (all kit references total 2007 lines; largest single file is 177). Decision 0001's "lean kit" identity was already reinterpreted on 2026-07-24 by decision 0003 as *"no low-quality/redundant skills"*, not *"few skills"*. No cap change and no decision amendment are needed.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | All 26 skills meet the 4-section bar; `validate` enforces it | P1 |
| 2 | Zero unresolved `vc:*` skill references, checked mechanically | P1 |
| 3 | Every skill carries verifiable upstream provenance (version + canonical authored-tree digest) | P1 |
| 4 | A deterministic static coverage ratchet prevents operational claims from disappearing silently | P1 |
| 5 | The 8 most-compressed skills are router-thin with substance restored into `references/` | P2 |
| 6 | Every vc skill has an individually recorded benchmark result with the proof tier stated honestly | P2 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Compliance sweep](./phase-01-start.md) | Completed |
| 2 | [Phase 2: Enforce the bar in validate](./phase-02-enforce-the-bar-in-validate.md) | Completed |
| 3 | [Phase 3: Provenance fields and distill-decisions registry](./phase-03-provenance-fields-and-distill-decisions-registry.md) | Completed |
| 4 | [Phase 4: Checklist coverage checker](./phase-04-checklist-coverage-checker.md) | Completed |
| 5 | [Phase 5: Reshape the eight most compressed skills](./phase-05-reshape-the-eight-most-compressed-skills.md) | Completed |
| 6 | [Phase 6: Benchmark all vc skills](./phase-06-benchmark-all-vc-skills.md) | Completed |

Dependency chain is strict: 1 → 2 (enforcement would fail on a non-compliant kit), 3 → 4 (the checker reads the registry), 2+4 → 5 (reshaping without a gate has no acceptance evidence), 5 → 6 (benchmark the delivered skill set, not an intermediate tree).

## Non-goals

- New distillation toward the 97-skill mirror (Wave 2) — separate plan.
- Golden-task eval harness and outcome regression — the validated fidelity technique, deliberately deferred; this plan ships only the cheap structural half.
- Treating static lint, LOC, or an optional prose judge as behavioral parity. Phase 6 reports those proof limits explicitly.
- `vcskill graph` command — harness work, not skill-set work.
- Trimming `vc:git`'s GitHub-achievement gamification content.
- Recalibrating `description-collision` thresholds. Verification found it is **already** an error-level gate (`ERROR_THRESHOLD = 0.6`, calibration test, `kit/collision-allowlist.json`) — the advice's "promote from advisory to blocking" premise was wrong. Tightening it for a 97-skill catalog belongs to the expansion wave.
- Distilling `vc:debug` (source is 1315 lines; it stays in its own wave).
- Reshaping `ship` (21%), `review-pr` (23%), `cook` (26%), `scout` (31%) — second tier, excluded.
- Any harness/provider-matrix work from `advise-260804-1005`.

## Constraints

- `agentskills.io` is the authoring baseline: `name` required, ≤64 chars, lowercase-alphanumeric-hyphen, must equal the directory name; `description` ≤1024 chars. `metadata` is a string→string map — all provenance fields must be strings.
- Restoration traceable to a pinned upstream version + canonical whole-tree digest. Never from memory. The digest includes paths + raw bytes for all authored regular files and excludes only an explicit tested list of volatile/generated paths.
- No LLM-judge gate anywhere in this plan.
- TDD: failing test first, then implementation. `pnpm test` green at every phase boundary.
- Files <200 LOC, kebab-case.
- The coverage checker must run **offline** — no dependency on a locally installed `ak`.

## Success Criteria

- [x] `vcskill validate` passes 26/26 with the 4-section bar enforced (baseline: 8/26)
- [x] Zero unresolved `vc:*` skill references; lint fails on introduction of a new one under finding kind `skillref` (distinct from the pre-existing `dangling`/`orphan` kinds, which mean reference-file links)
- [x] `vcskill add-skill` still emits a loadable skill after section and provenance enforcement; a failed post-write verification leaves no partial scaffold directory
- [x] Heading vocabulary single-valued: `## Output format` only — across all 26
      `kit/skills/*/SKILL.md` (Phase 1). Residual `## Output Format` in 2 agents
      and 1 git reference file is out of Phase 1's scope; Phase 2 decides the
      lint's scope.
- [x] All 26 skills carry `metadata.upstream`, `upstream_version`, `upstream_digest`, and `upstream_relation`; no-upstream skills use the explicit all-`"none"` sentinel
- [x] Canonical upstream digest is path-sensitive and covers scripts/workflows/assets/config/tests/licenses as well as Markdown; cache/generated exclusions are explicit and tested
- [x] `kit/distill-decisions.json` exists with extracted claims + rejected claims per distilled skill
- [x] Strict standalone `vcskill coverage --skill <name>` runs offline and exits zero for all 8 reshaped skills; aggregate `vcskill validate` maps the same findings to warnings during rollout and errors only after the eight-skill gate is complete
- [x] Each of the 8 reshaped skills has ≥1 `references/*.md` and a SKILL.md that routes rather than contains
- [x] All 26 skills have an individual benchmark row recording tier-1 result, tier-3 result or explicit `not run`, structural metrics, provenance, and coverage applicability
- [x] `pnpm test` green; coverage thresholds unchanged or better

## Risks

| Risk | Mitigation |
|---|---|
| Claim extraction has no published validation as an omission-detection method | Treat as a structural gate, not proof. Document the limit in the authoring spec so it does not create false confidence. Outcome regression remains the real technique, deferred by choice. |
| Restoring substance re-inflates token cost | Restored mass lands in `references/` (conditionally loaded), never in always-loaded SKILL.md bodies. |
| `upstream_digest` goes stale as ak ships ~3 minors/10 days | Intended: staleness becomes visible instead of silent. Re-pin reads the current version and canonical authored tree; plan-time version tables are snapshots only. |
| Stricter section/provenance lint breaks `vcskill add-skill` | Update the scaffold template in the same phases as each lint contract; sandbox tests prove generated output loads and failed verification cleans only the newly-created path. |
| Static coverage severity is ambiguous between commands | One pure finding set, two explicit adapters: standalone coverage always strict; aggregate validate warn-first, then error after all eight pass. |
| Reshaping touches the most-used skills with no golden tasks yet | `pnpm test` + coverage gate + incremental per-skill rollout; do not reshape more than one skill per commit. |
| Extracted claim lists could bloat the repo | Store normalized claim strings only, not source prose. Measure after the first 2 skills and revisit if a registry entry exceeds ~200 lines. |

## Open questions

None. Coverage policy is split by adapter: standalone `vcskill coverage` is strict from day one; aggregate `vcskill validate` is warn-only during the eight-skill rollout and flips its coverage mapping to error afterward. The no-upstream case (`obsidian-second-brain-note` and newly-authored original skills) and the fork case (`vc:git`) are handled by `metadata.upstream_relation` (`distill` | `fork` | `none`), specified in Phase 3; Phase 4 exempts `fork` and `none` from coverage.

## Validation Log

### Session 1 — 2026-08-04

#### Verification Results
- **Tier:** Full (5 phases)
- **Claims checked:** 20
- **Verified:** 17 | **Failed:** 3 | **Unverified:** 0

Verified: all cited file paths exist · `index.ts` is 330 LOC · `skill-lint.ts` is 121 LOC (79 LOC headroom before the 200 rule) · `vc:debug` appears exactly once, `kit/skills/sequential-thinking/SKILL.md:87` · `loadKit()` returns `{ skills }` at `load-kit.ts:159-165` · `vitest.config.ts` coverage `include` has 8 entries at 95% thresholds, none under `kit/`.

##### Failures
1. **[Fact Checker]** The advice's item G premise ("promote `description-collision` from advisory to blocking") is wrong — it is already error-level. `description-collision.ts:1-11`: *"a near-duplicate is an error (fails validate)"*, `ERROR_THRESHOLD = 0.6`, plus a calibration test and `kit/collision-allowlist.json`. The plan was silent on it, leaving scope ambiguous.
2. **[Contract Verifier]** Phase 2 understated existing infrastructure: `validate-command.ts:117` already calls `checkReferenceIntegrity()`, producing `dangling` / `orphan` findings — but for **reference-file links**, not `vc:*` skill references. The `ValidateFinding.kind` union (`validate-command.ts:16`) must be extended, not bypassed.
3. **[Contract Verifier]** `ValidateFinding.level?: "warn" | "error"` already exists (`validate-command.ts:18-19`). Phase 4's block-vs-warn decision has existing infrastructure to reuse; the plan did not know this.

#### Decisions
| # | Question | Decision |
|---|---|---|
| 1 | How to model `vc:*` references in the finding model | Add a new kind `skillref`; leave `dangling`/`orphan` meaning reference-file links, so error messages stay unambiguous |
| 2 | `description-collision` scope | Out of scope — added to non-goals; already works correctly |
| 3 | Coverage-finding level in the first batch | `warn` first, reusing `ValidateFinding.level`; flip to `error` once all 8 skills pass (answers plan open question 1) |
| 4 | Claim extraction breadth | Only the 8 reshaped skills get claims extracted and classified; the other 18 get version + digest only |

#### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01-start.md`, `phase-02-enforce-the-bar-in-validate.md`, `phase-03-provenance-fields-and-distill-decisions-registry.md`, `phase-04-checklist-coverage-checker.md`, `phase-05-reshape-the-eight-most-compressed-skills.md`
- Decision deltas checked: 4
- Reconciled stale references: 2
  1. `plan.md` Goal 2 and its success criterion said "dangling `vc:*` references" — but `dangling` is now a reserved finding kind meaning reference-file links. Reworded to "unresolved `vc:*` skill references" and pinned to kind `skillref`. (Phase 1's plain-English uses of "dangling" describe the `vc:debug` problem before the lint exists and were left alone.)
  2. "coverage passes" in `plan.md` and Phase 5 was ambiguous once findings emit at `warn` — a warn does not fail. Redefined "clean" as zero unclassified and zero unmatched-but-not-rejected claims, judged on the finding list rather than exit code, in all three places.
- Unresolved contradictions: 0

### Session 2 — 2026-08-06

#### Accepted Contract Corrections

1. **Scaffold compatibility.** Phase 2 updates the three-section template and owned-path cleanup; Phase 3 adds the explicit no-upstream provenance sentinel. `vcskill add-skill` is now an acceptance-test consumer of both lint contracts.
2. **Cross-skill ownership.** Required sections remain in per-artifact `skill-lint.ts`; inventory-dependent `vc:*` resolution moves to a pure `skill-crossrefs.ts` called by `validate-command.ts` only after `loadKit()` returns the full name set. No `Kit` / `Artifact` contract expansion.
3. **Coverage command semantics.** The pure checker emits severity-free domain findings. Standalone `vcskill coverage` is always strict and exits non-zero on unresolved findings. Aggregate `vcskill validate` maps identical findings to `warn` during rollout, then `error` after all eight pass. This refines Session 1 decision 3; it does not change the warn-first aggregate rollout decision.
4. **Canonical upstream identity.** Digest input expands from Markdown-only concatenation to a path-sensitive, length-framed hash over every authored regular file, with one explicit tested exclusion list for volatile/generated paths. `pin-upstream.ts` reuses the pure TypeScript hash and rejects symlinks.

Current upstream recheck also found `ak-plan` 1.4.0 (plan snapshot: 1.1.0) and `ak-fix` 2.2.0 (snapshot: 2.1.0). Re-ranking on current authored Markdown mass preserves the same eight Phase-5 candidates; Phase 3 re-pins all exact versions at execution time.

#### Whole-Plan Consistency Sweep

- Files reread: `plan.md`, `phase-01-start.md`, `phase-02-enforce-the-bar-in-validate.md`, `phase-03-provenance-fields-and-distill-decisions-registry.md`, `phase-04-checklist-coverage-checker.md`, `phase-05-reshape-the-eight-most-compressed-skills.md`
- Decision deltas checked: 4
- Reconciled stale references: scaffold consumers, cross-ref owner, `.mjs` → `.ts` pin helper, strict-versus-advisory coverage wording, digest scope, upstream version/ratio snapshots
- Unresolved contradictions: 0

### Session 3 — 2026-08-06

User expanded delivery with an all-skill benchmark. Added Phase 6 after the
reshape gate. The benchmark reuses `vcskill eval --skill` per skill, records
deterministic structural/provenance/coverage evidence, and runs tier 3 only when
`VCSKILL_EVAL_CMD` is configured. It does not weaken the existing golden-task
non-goal or label static evidence as behavioral parity.

### Session 4 — 2026-08-06

All six phases are complete. Final delivery evidence: 26/26 individual tier-1
evals pass, all 8 claim-tracked skills pass strict coverage, aggregate coverage
is error-level, and the full lint/test/build/coverage/validate gates pass. Tier 3
was explicitly not run because `VCSKILL_EVAL_CMD` was not configured.

The final code review found one real filter defect: an unknown `eval --skill`
previously validated an empty subset and exited zero. Commit `27b2b8d` adds a
failing regression test and makes the request fail clearly; all 26 canonical
benchmarks were rerun afterward. See the
[benchmark report](../reports/benchmark-260806-1531-vc-skills.md) for per-skill
evidence and proof limits.

<!-- slug: vc-skill-set-update-compliance-sweep-and-tier-1-reshape -->
