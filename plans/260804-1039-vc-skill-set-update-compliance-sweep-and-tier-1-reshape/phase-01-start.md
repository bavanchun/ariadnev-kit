---
phase: 1
title: "Compliance sweep"
status: completed
priority: P1
effort: "1-2d"
dependencies: []
---

# Phase 1: Compliance sweep

## Overview

Bring all 26 existing skills to the 4-section bar the README already claims they meet, normalize the split heading vocabulary to one value, and remove the one dangling cross-reference. Pure structure — no content substance changes.

## Requirements

- Functional: every `kit/skills/*/SKILL.md` carries `## Output format`, `## Quality gates`, and `## Workflow position`; no `vc:*` reference points at a non-existent skill.
- Non-functional: no change to any skill's operational meaning; heading renames preserve their section bodies verbatim; `pnpm test` stays green.

## Architecture

No code changes in this phase. It is a content sweep that makes Phase 2's enforcement shippable — turning the lint on against today's kit would fail 18 of 26 skills.

Baseline measured 2026-08-04: `## Quality gates` present in 21/26 · `## Workflow position` in 18/26 · `## Output format` (exact string) in 10/26.

## Related Code Files

- Modify: `kit/skills/{bootstrap,cook,fix,pm,predict,scout,skill-creator,worktree}/SKILL.md` — add `## Workflow position`
- Modify: `kit/skills/{fix,git,obsidian-second-brain-note,predict,skill-creator}/SKILL.md` — add `## Quality gates`
- Modify: 16 skills — normalize the output-contract heading (table below)
- Modify: `kit/skills/sequential-thinking/SKILL.md` — remove the dangling `vc:debug` reference

### Output-heading normalization map

| Current heading | Skills | Action |
|---|---|---|
| `## Output` | bootstrap, docs, docs-seeker, predict, scenario, security-scan, worktree | rename to `## Output format` |
| `## Report format` | brainstorm, scout | rename |
| `## Output Format` | git | fix case |
| `## Report format (output contract)` | research | rename |
| `## Status report format` | pm | rename |
| `## Output Rules` | obsidian-second-brain-note | rename |
| `## Entry template` | journal | keep, and add a distinct `## Output format` |
| *(absent)* | plan, skill-creator | author a new `## Output format` |

Already exact (no work): ask, code-review, cook, fix, handoff, problem-solving, review-pr, sequential-thinking, ship, test.

## Implementation Steps

1. Rename the 14 existing output-contract headings to `## Output format`, bodies unchanged.
2. Author `## Output format` for `journal`, `plan`, and `skill-creator` — describe what each already produces; do not invent new behavior.
3. Add `## Quality gates` to `fix`, `git`, `obsidian-second-brain-note`, `predict`, `skill-creator` — self-checks derived from what each skill already asserts.
4. Add `## Workflow position` to `bootstrap`, `cook`, `pm`, `scout`, `worktree`, `fix`, `predict`, `skill-creator` using the existing `**Typically follows:** / **Typically precedes:** / **Related:**` shape. Every `vc:*` named must exist.
5. Remove the `vc:debug` mention in `sequential-thinking` (source `ak-debug` is 1315 lines — do not distill it to fix one line of prose).
6. Fix `cook` first and land it separately: it is the spec's own reference implementation and should stop being the counter-example immediately.
7. Run `vcskill validate` and `pnpm test`; both must be clean.

## Success Criteria

- [x] All 26 SKILL.md files contain `## Output format`, `## Quality gates`, `## Workflow position`
- [x] `grep -c '^## Output format' kit/skills/*/SKILL.md` returns 1 for all 26
- [x] No occurrence of `## Output`, `## Report format`, `## Output Format`, `## Status report format`, `## Output Rules` as an output-contract heading
- [x] Every `vc:<slug>` referenced anywhere in `kit/skills/**` resolves to an existing directory
- [x] `vcskill validate` clean; `pnpm test` green
- [x] No skill's operational instructions changed (diff review: renames + additions only)

## Completion Record — 2026-08-04

Evidence: `vcskill validate` → 26 skills / 13 agents / 6 hooks, all checks passed ·
`pnpm test` → 45 files / 364 tests passed · `pnpm lint` (tsc --noEmit) clean ·
19 SKILL.md changed, +206/−44.

`kit-embedded.generated.ts` had to be regenerated (`pnpm --filter vcskill
generate:embedded`) — the embed drift guard fails on any kit content edit. Any
later phase touching `kit/` must do the same.

Kit lint warnings held at 4 before and after (measured by loading the kit on the
stashed and unstashed trees), so the sweep introduced no new duplicate-heading
overlap.

### Deviations from the written steps

1. **Rename count is 13, not 14.** The normalization table's rows sum to 13
   (7 `## Output` + 2 `## Report format` + 1 each for `git`, `research`, `pm`,
   `obsidian-second-brain-note`); `journal`, `plan`, `skill-creator` were
   authored fresh. Step 1's "14" was an arithmetic slip in the plan.
2. **`skill-creator`: renamed rather than added.** Its existing
   `## Checklist before shipping` already *was* the quality-gate list. Renamed it
   to `## Quality gates` (body preserved, one row added for the 4-section bar)
   instead of authoring a second near-identical list, which would have violated
   the no-duplication rule.
3. **`obsidian-second-brain-note`: promoted, not added.** Its workflow step 9 was
   literally titled "Quality gates". Promoted that list verbatim (as checkboxes)
   to a top-level `## Quality gates`; step 9 now reads "Self-check — run the
   quality gates below".
4. **`sequential-thinking`: substituted, not deleted.** Step 5 said remove the
   `vc:debug` mention; removing the word alone would leave "inside `vc:fix`, , or
   a tangled `vc:plan`". Replaced `vc:debug` with `vc:scout`, which exists and
   fits the sentence's meaning.

### Findings for Phase 2

- Heading vocabulary is single-valued **within `kit/skills/*/SKILL.md`**.
  `## Output Format` still exists in `kit/agents/vc-reviewer.md:56`,
  `kit/agents/vc-explore.md:33`, and `kit/skills/git/references/workflow-prc.md:144`.
  Agents have their own contract (`agent-lint` requires `Behavioral Checklist`),
  and references are not output contracts — but Phase 2 must decide explicitly
  whether the new lint's scope is SKILL.md-only, or the criterion stays partly
  unmet at the kit level.
- `vcskill validate` prints "all checks passed" while `Kit.warnings` holds 4
  entries — warnings are collected but never surfaced by the command. Phase 2's
  `ValidateFinding.level` work should decide whether to route them through.

## Risk Assessment

- **Authoring new sections invents behavior.** Mitigation: for `plan`, `journal`, `skill-creator`, derive the output contract from what the skill already describes; if a skill genuinely has no output contract, that is a finding to record, not a gap to paper over.
- **Adding `## Workflow position` edges creates new dangling refs.** Mitigation: step 4 validates each named skill exists; Phase 2 makes this mechanical.
- **Scope creep into content quality.** Mitigation: this phase is structural only. Compression repair is Phase 5.
