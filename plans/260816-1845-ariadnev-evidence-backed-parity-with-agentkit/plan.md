---
title: "ariadnev evidence-backed parity with AgentKit"
description: "Close the two real capability gaps against AgentKit, clear the inherited reference debt, and make the eval coverage claim true and self-enforcing instead of aspirational."
status: pending
priority: P1
effort: "8-12d"
tags: [kit, skills, evals, quality, release]
created: 2026-08-16
---

# ariadnev evidence-backed parity with AgentKit

## Overview

`ariadnev@1.0.0` ships 103 skills that are, file for file, AgentKit's skills with a
rebrand applied. Three things separate it from "chuẩn chỉ":

1. **Two capability gaps.** AgentKit has `ak:plan-i18n` and `ak:ak`; the kit has
   neither, and **no skill in the kit documents the `av` CLI at all**
   (`rg "av doctor|av audit|av contract" kit/skills` → no matches).
2. **89 orphan reference files.** `av validate` reports them as warnings. They are
   inherited: AgentKit's own copies are identical (`ak-ai-artist` links 2 of 10
   reference files, `ak-loop` 2 of 5, `ak-threejs` 17 of 20). Clearing them puts
   ariadnev *ahead of* AgentKit rather than level with it.
3. **A false claim in the product.** `evals/README.md:73` says
   `scenarios/skills/` "covers every shipped skill"; on disk there are **26**
   scenario files for **103** skills. Nothing enforces the claim, which is why it
   drifted.

This plan closes all three and then proves the result with a real tier-2 run
instead of asserting it.

## Contract (from brainstorm, 2026-08-16)

**Outcome** — no capability gap against AgentKit, no false statement in the kit's
own documentation, and an eval coverage number that is true because a test
enforces it.

**Constraints**
- `av`'s command surface differs from `ak`'s (`install/uninstall/audit/contract/
  eval/migrate/adapters/run` vs `init/kit/skills/recover/login`). Nothing may be
  ported blind.
- `av validate` stays at 0 errors; kit CI stays green.
- Both repositories stay private.
- The frozen legacy `vcskill` Worker and its rollback path are untouched.

**Non-goals** — making a repository public, changing the install architecture,
running the tier-3 LLM judge, and vendoring third-party tools into skills (the
`sharetrace` clone AgentKit bundles inside `cti-expert` is deliberately not
copied: it is a git clone inside a skill, and it traces real people's accounts).

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Ship the two missing skills, one ported and one written for `av` | P1 |
| 2 | Clear 89 orphan references and make new ones impossible | P2 |
| 3 | Make eval coverage match the claim, enforced by a test | P1 |
| 4 | Record a real tier-2 baseline from a real runner | P2 |
| 5 | Release so users actually get all of it | P2 |

## Phases

| # | Phase | Depends on | Status |
|---|-------|------------|--------|
| 1 | [Parity skills](./phase-01-parity-skills.md) | — | Done |
| 2 | [Reference debt and enforcement](./phase-02-reference-debt-and-enforcement.md) | — | Done |
| 3 | [Eval coverage that matches the claim](./phase-03-eval-coverage-that-matches-the-claim.md) | 1 | Done |
| 4 | [Tier-2 baseline with a real runner](./phase-04-tier-2-baseline-with-a-real-runner.md) | 3 | Skipped |
| 5 | [Pinned downgrade for av update](./phase-05-pinned-downgrade-for-av-update.md) | — | Done |
| 6 | [Release and propagate](./phase-06-release-and-propagate.md) | 1, 2, 3, 5 | Done |

Phases 1, 2, and 5 touch disjoint files (`kit/skills/{plan-i18n,av}` vs existing
skills' `SKILL.md`/`references` vs `update-command.ts`) and may run in parallel.
Phase 3 depends on 1 because the two new skills need scenarios of their own.
Phase 5 was added during validation: `av update` had no way to pin a version, so
the release phase had no real downgrade path to point at.

## Success Criteria

- [x] `av list` reports **105** skills; `av validate` exits with **0 errors**.
- [x] `rg "av doctor|av audit|av contract" kit/skills` returns matches.
- [x] `av validate` reports **0 orphan warnings**, and CI fails if a new one appears.
      `--strict` promotes orphan and dangling findings to errors past the ported
      exemption, and `ci.yml` runs it.
- [x] `evals/scenarios/skills/` holds one scenario per shipped skill, enforced by a
      test that reads `kit/skills/` rather than a hard-coded number.
- [x] `evals/README.md` states a coverage claim that the test above makes true.
- [ ] **NOT MET — deliberately.** A tier-2 run against a real runner recorded
      under `evals/baselines/`. Phase 4 is skipped: the harness isolates `HOME`,
      and no runner on the release machine can both authenticate and see this
      kit without either mutating the user's live Codex install or copying a
      credential into a sandbox. The criterion stays open rather than being
      reworded to something that was achieved. See phase 4 for the evidence.
- [x] `av update --to <version>` downgrades with checksum verification intact.
      Round-tripped 1.0.0 → 1.1.0 → 1.0.0 against the live edge on 2026-08-16.
- [x] Kit CI green; `ariadnev.com/version` serves the released version and the docs
      site lists the new skills. `1.1.0` at the apex, 105 skills in the docs
      reference including `av:av` and `av:plan-i18n`.

## Cost and honesty notes

- Tier-2 at the documented defaults is 103 skills × 2 cases × 3 repeats ≈ **618
  agent runs**, plus golden tasks. Phase 4 sizes this from a measured pilot before
  committing, and records the chosen repeat count as a limitation rather than
  quietly lowering the bar.
- 77 hand-written scenarios is the bulk of this plan. A scenario whose
  "nearest-negative" is not genuinely confusable is worse than no scenario: it
  turns a coverage number into a more convincing falsehood. Phase 3 makes that an
  explicit review criterion.

## Open questions

None blocking. Two are resolved inside their phases: which evidence ids are
missing from the 27-term vocabulary (Phase 3, capped at ten additions before it
stops to ask), and what repeat count the pilot justifies (Phase 4).

## Validation Log

### Session 1 — 2026-08-16

#### Verification Results

- Tier: **Full** (5 phases at the time of the pass)
- Claims checked: 12 · Verified: 9 · **Failed: 2** · Unverified: 1

**Failures, both in this plan's own text, both corrected:**

1. `kit/skills-lock.json` does not exist (Phase 1, Related Code Files).
   `packages/cli/package.json` runs `generate:skill-lock` →
   `scripts/generate-skill-lock.ts`, which resolves a **per-skill Python
   environment** into that skill's `scripts/ariadnev-lock.json` (as in
   `cti-expert`). Corrected: the step is skipped unless a new skill ships Python.
2. `av update` cannot target a version (Phase 6, Risk Assessment).
   `packages/cli/src/cli/update-command.ts` resolves only `resolveLatest()`
   against `${DOMAIN}/version`; there is no `--to`. Corrected, and the capability
   is now Phase 5 rather than an assumed one.

**Unverified:** `skill-lint.ts` pushes an oversize warning for ported skills, yet
`av validate` emits no size warnings today even though several ported skills far
exceed 300 lines (`cti-expert` is 902). All 89 warnings are `orphan`. Not
load-bearing for this plan — noted so a future reader does not mistake silence
for compliance.

**Constraint discovered (verified):** `skill-lint.ts:31` — `metadata.origin: ported`
downgrades oversize, missing-trigger-verb, and missing-required-section from error
to warning. Every one of the 103 skills takes that exemption. New skills do not.

#### Decisions

| Question | Decision |
|---|---|
| Lint bar for `av:plan-i18n` | **House bar, not `ported`** — ≤300 lines, required sections, trigger verb. Upstream is 252 lines, and its CLI instructions are being rewritten anyway. |
| Scope of `av validate --strict` | **Orphan + dangling only.** All 89 current warnings are orphans, so promoting everything would be free today and would block the next long upstream port later. |
| `av update` version pinning | **Build `--to <version>`** (new Phase 5) rather than accept installer-only downgrades. The edge's pinned selectors already support it. |
| Vocabulary growth in Phase 3 | **Capped at ten new evidence ids**, each with an evaluator-checkable criterion; past ten, stop and ask. |

#### Whole-Plan Consistency Sweep

Re-read `plan.md` and all six phase files after propagation. Reconciled: phase
numbering and dependencies (release moved 5 → 6, depends on 5), the two corrected
claims, the ported/non-ported bar in Phases 1 and 2, the strict-flag scope in
Phase 2, the vocabulary cap in Phase 3, and the rollback story in Phase 6.
**Unresolved contradictions: none.**

<!-- slug: ariadnev-evidence-backed-parity-with-agentkit -->
