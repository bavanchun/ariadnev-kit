---
phase: 2
title: "Enforce the bar in validate"
status: todo
priority: P1
effort: "1-2d"
dependencies: [1]
---

# Phase 2: Enforce the bar in validate

## Overview

Turn the 4-section bar and cross-reference integrity into machine-enforced lint rules, so the gap that let 18 of 26 skills drift cannot reopen. This is advice item ⑥ from `advise-260804-1005`, and it is only shippable because Phase 1 made the kit compliant.

## Requirements

- Functional: `vcskill validate` fails when a skill is missing any required section, and fails when any `vc:<slug>` reference does not resolve to an existing kit skill.
- Functional: `vcskill add-skill` continues to create a skill that immediately passes the stricter lint; an unexpected post-write validation failure removes only the just-created scaffold instead of leaving a partial directory.
- Non-functional: TDD — failing tests first. Required-section rules stay in the existing `kit/skill-lint.ts` seam; inventory-dependent cross-skill checks run only after `loadKit()` has returned the complete skill list. Error messages name the file and the missing section or skill reference.

## Architecture

The two rules have different data dependencies and therefore different owners:

1. **Required sections — `skill-lint.ts`.** A constant list checked against `##` headings, matched case-sensitively on the exact string so the vocabulary cannot re-fragment. This rule needs only one artifact and remains part of every `loadKit()` call.
2. **Skill-reference integrity — `skill-crossrefs.ts`, called by `validate-command.ts`.** A pure checker extracts every `vc:<slug>` occurrence from SKILL.md *and* its `references/*.md`, then resolves against the complete skill-name set after `loadKit()` returns. Unresolved references become the new finding kind `skillref`.
3. **Scaffold compatibility — `skill-template.ts` + `add-skill-command.ts`.** The generated body includes all required sections. `runAddSkill()` continues to re-load the kit, but cleans up its newly-created directory if that verification throws; it never removes a pre-existing path.

**Existing infrastructure this builds on** (verified 2026-08-04, Validation Session 1):
- `validate-command.ts:117` already calls `checkReferenceIntegrity()`, emitting `dangling` and `orphan` findings — but those are about **reference-file links** (`SKILL.md` links a `references/x.md` that is missing, or a reference file nothing links to). They are *not* about `vc:*` skill references.
- The `ValidateFinding.kind` union at `validate-command.ts:16` (`"lint" | "dangling" | "orphan" | "matrix" | "collision"`) must be **extended** with `"skillref"`, not overloaded. Decision 1 of Validation Session 1: keeping `dangling` meaning file-links preserves unambiguous error messages.
- `ValidateFinding.level?: "warn" | "error"` already exists (`validate-command.ts:18-19`) — Phase 4 reuses it rather than inventing a banding mechanism.
- `load-kit.ts:65-81` validates and appends one skill at a time. `lintSkill()` cannot resolve cross-skill references there because the complete inventory does not yet exist; changing the `Kit` contract or adding a two-pass loader is unnecessary for a `validate`-owned rule.
- `skill-template.ts:16-33` currently emits only `## Steps`, while `add-skill-command.ts:29-33` writes that template before re-loading the kit. The template and its failure cleanup are public-contract consumers of the new lint and must change in the same phase.

Reference resolution reuses `loadKit()`'s returned skill inventory (`load-kit.ts:159-165`). `validate-command.ts` reads each checked skill's reference-file contents once for the pure cross-ref checker; this avoids widening the shared `Kit` / `Artifact` contract. `skill-lint.ts` is currently 121 LOC, leaving ~79 before the 200 rule; `skill-crossrefs.ts` is a real boundary because it needs whole-kit state, not a LOC escape hatch.

Deliberately **not** in scope: a `vcskill graph` command. Deriving and rendering the graph is harness work; this phase only needs edges to resolve.

## Related Code Files

- Modify: `packages/cli/src/kit/skill-lint.ts` — add `REQUIRED_SECTIONS` + exact section check only
- Modify: `packages/cli/src/kit/skill-lint.test.ts` — required-section failing cases first
- Create: `packages/cli/src/kit/skill-crossrefs.ts` — pure extraction + resolution against a supplied complete name set
- Create: `packages/cli/src/kit/skill-crossrefs.test.ts`
- Modify: `packages/cli/src/cli/validate-command.ts` — read reference contents after load, call cross-ref checker, emit `skillref`
- Modify: `packages/cli/src/cli/validate-command.test.ts` — SKILL.md + reference-file cross-ref cases and finding-kind regression
- Modify: `packages/cli/src/kit/skill-template.ts` — scaffold the three required sections
- Modify: `packages/cli/src/cli/add-skill-command.ts` — clean up only the newly-created scaffold when post-write validation fails
- Modify: `packages/cli/src/cli/add-skill.test.ts` — generated skill passes strict lint; failed verification leaves no partial directory
- Modify: `docs/vc-skill-authoring-spec.md` — state that the bar is now enforced, and name the exact heading strings
- Modify: `README.md` — the claim that every skill meets the bar becomes true and checkable; note it is enforced

## Implementation Steps

1. Write failing tests: skill missing each of the three sections; skill with a heading in the old vocabulary (`## Output`); pure cross-ref checker with known/missing names; SKILL.md and reference file referencing `vc:nonexistent`; generated scaffold passing the new bar; forced post-write validation failure leaving no scaffold directory.
2. Add `REQUIRED_SECTIONS = ["## Output format", "## Quality gates", "## Workflow position"]` and the exact-match check.
3. Implement `skill-crossrefs.ts` as a pure function over supplied contents + known names. After `loadKit()` returns, have `validate-command.ts` read the checked skills' reference contents, call it, and emit `skillref`. Leave `checkReferenceIntegrity()` and its `dangling`/`orphan` semantics untouched.
4. Update `skill-template.ts` with minimal placeholder bodies for all three required sections. Wrap only the newly-created path in cleanup on post-write verification failure; test both success and rollback.
5. Run `vcskill validate` against the real kit and run `vcskill add-skill` in a sandbox — both must be clean after Phase 1. If the real kit is not clean, Phase 1 is incomplete; fix there, not by weakening the rule.
6. Update the authoring spec and README.
7. Confirm `matrix-drift` and the rest of the suite are unaffected.

## Success Criteria

- [ ] New tests fail before implementation, pass after
- [ ] `vcskill validate` reports 26/26 clean on the real kit
- [ ] Introducing a skill without `## Quality gates` fails validate with a message naming the file and section
- [ ] Introducing a `vc:nonexistent` reference fails validate under kind `skillref`, whether it appears in SKILL.md or a reference file
- [ ] Existing `dangling` / `orphan` findings still mean reference-file links — regression test proves the semantics did not shift
- [ ] Cross-skill resolution runs after the full inventory loads; no `Kit` / `Artifact` public type change is needed
- [ ] `vcskill add-skill` creates a skill that passes the strict section lint, and a forced verification failure leaves no partial directory
- [ ] `skill-lint.ts` and `skill-crossrefs.ts` each stay under 200 LOC

<!-- Updated: Validation Session 1 - new finding kind `skillref`; documented existing checkReferenceIntegrity/level infrastructure -->
- [ ] `pnpm test` green; coverage thresholds unchanged or better

## Risk Assessment

- **Exact-string matching is brittle for legitimate variation.** Accepted deliberately: the fragmentation into five heading spellings is exactly what the strictness prevents. Variation is a bug here, not a feature.
- **Cross-ref extraction over-matches** — `vc:` may appear in prose or code fences without being a reference. Mitigation: test the false-positive case explicitly; if noise appears, restrict extraction to the `## Workflow position` section plus explicit link syntax rather than loosening the rule.
- **Stricter lint breaks the scaffold command.** Mitigation: treat `skill-template.ts` and `runAddSkill()` as consumers of the lint contract, update them in the same phase, and prove both successful creation and owned-path cleanup.
- **Enforcement blocks unrelated work if Phase 1 slipped.** Mitigation: strict phase dependency; do not merge Phase 2 until validate is clean.
