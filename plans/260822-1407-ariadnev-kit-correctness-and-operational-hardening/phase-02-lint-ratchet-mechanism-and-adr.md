---
phase: 2
title: "Lint ratchet mechanism and ADR"
status: todo
priority: P1
effort: "1-2d"
dependencies: []
---

# Phase 2: Lint ratchet mechanism and ADR

## Overview

Replace the blanket `origin: ported` severity downgrade with an explicit,
shrink-only allowlist, and add anti-filler checks **before** any content is
written. No skill content changes here. It delivers most of the exemption
removal's signal for ~2% of its cost, and it is what makes phase 8 mergeable one
skill at a time.

## Requirements

**Functional**
- `kit/skills-lint-exempt.json` lists the 101 skills still under old severity.
- `isPorted()` becomes `isExempt()`, fed from `load-kit.ts`. Both call sites flip.
- A shrink-only test fails if a listed skill already satisfies every check.
- `REFERENCE_MAX_LINES` raised 300 → 800 (see plan index for the distribution).
- Anti-filler checks exist, **validated against the 4 authored exemplars first**.
- ADR 0013 supersedes ADR 0008's severity split.

**Non-functional**
- `pnpm test` green on merge — mechanism changes, outcomes do not.
- `skill-lint.ts` stays pure. No `fs` inside it.

## Architecture

### Why a ratchet, not a big-bang flip

Flipping `isPorted()` with no content fixes does not produce 101 clean failures.
`loadKit()` throws `KitValidationError` on the first error (`load-kit.ts:75-77`),
and `install.test.ts:12` and `kit-fixtures.test.ts:38` call it against the real
`kit/` at collection time. The suite dies during collection — a wall, not a
scoreboard, unmergeable even as WIP.

The repo already has this pattern: `kit/skills-pending-port.json` +
`pendingPortNames()` (`validate-command.ts:22-31`) with a shrink-only test at
`validate-command.test.ts:242-256`. Reuse it.

### `isExempt` is a contract change, not a rename

`skill-lint.ts:1-3` states the module's purity contract: "load-kit reads files
and passes content in, so every rule is unit-testable without a filesystem".
`lintSkill(artifact, references)` has no `kitRoot`. Reading the allowlist inside
`skill-lint.ts` would break that contract and make ~15 fixture tests depend on
the real repo's JSON.

**Follow the existing precedent exactly:** read the list in `load-kit.ts` (which
has `kitRoot`) and pass `exemptNames: Set<string>` down — the same shape
`pendingPortNames(kitRoot)` already uses at the impure call site. This is a
signature change to a public export with existing callers; the phase owns it.

### Both call sites

| Site | What it gates |
|---|---|
| `skill-lint.ts:129` | `lintSkill()`'s internal `ported` flag — 5 checks |
| `validate-command.ts:166` | the reference-**orphan** check severity |

Flipping only the first leaves unlinked reference files passing as warnings —
which matters directly in phase 8.

### Checks that become unconditional

description >200 chars · missing trigger verb · SKILL.md >maxLines · the 3
required sections (currently *skipped entirely* for ported) · reference file
>`REFERENCE_MAX_LINES` · reference orphan. Unknown-field and description-too-short
are already unconditional.

### Dead code

`kit.warnings` (`load-kit.ts:78`) is **never read by any CLI command**. Today's
exemption is not "downgraded and shown", it is write-only. Wire it into
`renderSummary` or delete it; a write-only warnings channel after this phase
would be its own small lie.

### Anti-filler checks — validate against the exemplars first

`kit-fixtures.test.ts:10-23` ships a fixture that is exactly the failure mode:
headings with zero information. Heading presence cannot detect filler.

**A reviewer found that the draft's grounding check fails the compliance
baseline itself**: 5 of the 12 required sections in the 4 authored skills have
zero or unmatched backticks — including `pm`'s Output format, the very section
phase 8 holds up as the exemplar. Merging it as an error would have crashed the
suite at collection, reintroducing the exact failure this phase exists to avoid.

**Rule: any check the 4 authored skills fail is a bad check, not a finding.**
Run all candidates against them before writing a line of gate code.

| # | Check | Disposition |
|---|---|---|
| 1 | Workflow position names ≥1 `av:<slug>` | gate — but `SKILL_REFERENCE` (`skill-crossrefs.ts:11`) is **not exported**; export it |
| 2 | Output format has a fence, table, or ≥3-item list | **script**, not gate — fails `av`'s Output format today |
| 3 | Quality gates has ≥3 bullets | script, not gate |
| 4 | cross-corpus body uniqueness | **dropped** — `description-collision.ts` already does calibrated Jaccard with a reason-required allowlist, wired at `validate-command.ts:203-215`. Extend that module to accept an arbitrary text field rather than building a weaker exact-match parallel |
| 5 | backticked span grounded elsewhere in the file | **script**, not gate — fails 5 of 12 exemplar sections |

Net: one gate check, three review-script checks, one dropped in favour of the
existing module. The draft's claim that these *detect* filler is withdrawn — a
reviewer demonstrated a ~30-line generator satisfying all five. They are cheap
floor checks; the real control is second-reader review in phase 8.

## Related Code Files

- Create: `kit/skills-lint-exempt.json`, `docs/decisions/0013-*.md`
- Create: `packages/cli/scripts/review-section-quality.mjs` (checks 2, 3, 5)
- Modify: `packages/cli/src/kit/skill-lint.ts` (`isExempt` param; `REFERENCE_MAX_LINES` 800)
- Modify: `packages/cli/src/kit/load-kit.ts` (read list, pass down; `kit.warnings`)
- Modify: `packages/cli/src/kit/skill-crossrefs.ts` (export `SKILL_REFERENCE`)
- Modify: `packages/cli/src/kit/description-collision.ts` (generalize the field)
- Modify: `packages/cli/src/cli/validate-command.ts` (second call site)
- Modify: `packages/cli/src/kit/skill-lint.test.ts` (~15 call sites gain the param)

## Implementation Steps

1. Write ADR 0013. Supersedes ADR 0008's severity split; records the ratchet, the
   `REFERENCE_MAX_LINES` change with its distribution evidence, and whether
   `metadata.origin: ported` is stripped once a skill clears the bar. Note that
   ADR 0011 removes "keep ports diffable" as an objection.
2. **Run every candidate anti-filler check against the 4 authored skills.**
   Record which pass. Only survivors may become gates.
3. Raise `REFERENCE_MAX_LINES` to 800.
4. Add `kit/skills-lint-exempt.json` with the 101 names.
5. Thread `exemptNames` from `load-kit.ts` into `lintSkill`; flip both call
   sites; update the ~15 fixture calls. `pnpm test` green — behavior unchanged.
6. Add the shrink-only test.
7. Export `SKILL_REFERENCE`; implement gate check 1.
8. Generalize `description-collision.ts` if section-similarity is wanted.
9. Write the review script (checks 2, 3, 5). Run it corpus-wide; the output is
   phase 8's worklist.
10. Resolve the `kit.warnings` question.

## Success Criteria

- [ ] Every gate check passes against all 4 authored skills. Non-negotiable.
- [ ] `kit/skills-lint-exempt.json` exists with 101 entries; `isPorted()` is gone.
- [ ] `skill-lint.ts` contains no `fs` import; its tests need no real kit.
- [ ] Shrink-only test fails when a compliant skill is left listed — proven by
      temporarily listing an authored skill.
- [ ] `REFERENCE_MAX_LINES` is 800; exactly 6 files exceed it.
- [ ] `kit.warnings` is displayed or deleted.
- [ ] `pnpm test` green; `av validate` output unchanged from today.

## Risk Assessment

**A gate check that blocks honest writing.** Demonstrated in the draft: the
grounding check failed the exemplars. *Signal:* a check fails a skill written by
someone following the spec. *Pre-decided response:* step 2 runs before any gate
code exists, and Success Criterion 1 makes exemplar-compliance a merge condition.

**The ratchet becomes permanent.** An allowlist with no deadline is the old
exemption with extra steps. *Signal:* the list stops shrinking for a month.
*Response:* phase 8 deletes the file and the mechanism; a non-empty list at
phase 8 means the plan does not close, it replans.

**False confidence in the anti-filler gates.** A reviewer defeated all five
mechanically. *Response:* the phase no longer claims they detect filler. Phase 7
budgets second-reader review as the actual control.
