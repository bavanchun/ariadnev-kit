# Brainstorm — vc skill-set update (scope A + B)

Date: 2026-08-04 · `/ak:brainstorm` · Scope accepted: **A + B**
Upstream contract: reframing v3 + `advise-260804-1005-core-harness-distillation.md`

## Evidence that changed the framing

Two constraints previously treated as open turned out not to exist:

- **`REFERENCE_MAX_LINES = 300` is not binding.** All kit references total 2007 lines; the largest single file is `kit/skills/git/references/workflow-prc.md` at 177 lines. Nothing has approached half the cap.
- **The "lean kit" identity was already reinterpreted.** `docs/decisions/0001` carries a superseded note dated 2026-07-24: §4 anti-bloat now reads as *"no low-quality/redundant skills"*, not *"few skills"*.

⇒ Router-thin / references-deep needs **no** cap change and **no** decision amendment. The real obstacle is simply that references barely exist — 13/26 skills have zero.

A third correction, from checking the installed sources: **ak exposes no git sha locally.** Only 1/97 skills uses `upstream_sha`, and that is for a third-party vendored source. What is available is per-skill `metadata.version` (semver). So the provenance pin is `upstream` + `upstream_version` + `upstream_digest` (sha256 of source SKILL.md + references at distill time) — the digest is required because ak can edit content without bumping the version.

## Contract

**Outcome.** The 26 existing vc skills meet their own stated bar and carry verifiable provenance; the 8 most severely compressed skills are reshaped to router-thin/references-deep with their lost operational substance restored from the pinned upstream.

**Constraints.** Inherits reframing v3 · `agentskills.io` naming (`name` required, ≤64, equals directory name) · no LLM-judge gate · restoration must be traceable to a pinned upstream version+digest, never to memory · `pnpm test` green throughout.

**Non-goals.** New distillation toward 97 (Wave 2) · golden-task harness · trimming `vc:git`'s gamification content · distilling `vc:debug` · reshaping skills outside the 8 selected · Tier-2/3 harness mechanisms.

**Acceptance criteria.**
1. `validate` (with the enforced 4-section bar) passes 26/26 — currently 8/26.
2. Zero dangling `vc:*` references.
3. Heading vocabulary single-valued: `## Output format` only (currently split across `## Output` ×7, `## Report format` ×2, `## Output Format` ×1).
4. All 26 skills carry `upstream` + `upstream_version` + `upstream_digest`; lint enforces presence.
5. The 8 reshaped skills each have ≥1 `references/` file and a SKILL.md that routes rather than contains.
6. Checklist-coverage check passes for the 8: every operational claim extracted from the pinned upstream appears in the vc SKILL.md or one of its references.

## Tranche A — compliance sweep (unblocked)

Not a detour from harness-first: advice item ⑥ (`validate` enforcing the bar) **cannot ship** while `cook` and `skill-creator` violate it. This is harness work.

| Skill | Missing |
|---|---|
| `cook` | Workflow position (the spec's own reference implementation) |
| `skill-creator` | all three sections |
| `plan` | output section (absent entirely) |
| `fix` | Quality gates + Workflow position |
| `predict` | Quality gates + Workflow position |
| `git` | Quality gates |
| `obsidian-second-brain-note` | Quality gates |
| `bootstrap`, `pm`, `scout`, `worktree` | Workflow position |

Plus: normalize 15 files to `## Output format`; remove the dangling `vc:debug` reference in `sequential-thinking` (do not distill a 1315-line source to fix one line of text — `vc:debug` stays in its own wave).

## Tranche B — reshape the 8 most-compressed skills

Selection is evidence-driven (compression ratio vs source), not taste:

| vc skill | ak source | ak version | ak LOC | vc LOC | ratio |
|---|---|---|---|---|---|
| `skill-creator` | `ak-skill-creator` | 4.0.0 | 2107 | 54 | **3%** |
| `plan` | `ak-plan` | 1.1.0 | 2115 | 166 | **8%** |
| `fix` | `ak-fix` | 2.1.0 | 1315 | 116 | **9%** |
| `sequential-thinking` | `ak-sequential-thinking` | 1.0.0 | 806 | 92 | **11%** |
| `code-review` | `ak-code-review` | 2.0.0 | 1330 | 162 | **12%** |
| `docs-seeker` | `ak-docs-seeker` | 3.1.0 | 574 | 70 | **12%** |
| `bootstrap` | `ak-bootstrap` | 1.0.0 | 417 | 56 | **13%** |
| `problem-solving` | `ak-problem-solving` | 2.0.0 | 676 | 88 | **13%** |

Second tier if appetite remains (deliberately excluded here): `ship` 21%, `review-pr` 23%, `cook` 26%, `scout` 31%.

Method per skill: pin the upstream (version + digest) → extract operational claims from the source → keep SKILL.md as a router (~100–150 lines) → place restored substance in `references/*.md`, one level deep only → verify with the checklist-coverage check.

## Order of work

B has no acceptance evidence without a fidelity check, and no safe restoration without a pin. So two items from the advice's later phases are pulled forward into this batch — the cheap halves only:

1. **A** — compliance sweep (independent).
2. **Provenance fields** — `upstream` / `upstream_version` / `upstream_digest` + lint. Prerequisite for B.
3. **Checklist-coverage check** — claim extraction from pinned upstream vs vc content. This is the cheap half of advice item F; golden tasks stay out of scope.
4. **B** — reshape the 8, gated by #3.

## Risks

- Restoring substance re-inflates the catalog's token cost; mitigated because the added mass lands in `references/`, loaded conditionally, not in always-loaded SKILL.md bodies.
- Claim extraction has no published validation as an omission-detection method (research: faithfulness/NLI metrics target over-claiming, not omission). It is a cheap structural gate, not proof — outcome regression on golden tasks remains the only validated technique and is still deferred.
- `upstream_digest` will go stale as ak ships (~3 minors/10 days). That is the intended behavior: staleness becomes visible instead of silent.
- Reshaping 8 skills touches the most-used surfaces; `pnpm test` plus the compliance gate are the only guards until golden tasks exist.

## Unresolved questions

1. Should the checklist-coverage check block merges from day one, or warn during this first batch?
2. `vc:git` (246-line body, 7 references, GitHub-achievement gamification) — leave as-is this batch, or fold a scope trim into A?
3. If a claim in the upstream is deliberately rejected (not lost), where is that recorded so the coverage check does not flag it forever — a per-skill `rejected-claims` list, or a note in the reference file?
