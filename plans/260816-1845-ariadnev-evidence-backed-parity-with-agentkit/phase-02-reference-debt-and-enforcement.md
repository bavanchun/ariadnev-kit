---
phase: 2
title: "Reference debt and enforcement"
status: pending
priority: P2
effort: "2-3d"
dependencies: []
---

# Phase 2: Reference debt and enforcement

## Overview

Resolve all 89 orphan reference files — files under a skill's `references/` that
no `SKILL.md` ever mentions — and make a new one impossible to merge.

## Requirements

- Functional: `av validate` reports 0 orphan warnings across `kit/skills`.
- Functional: CI fails when a future skill adds an unreferenced file.
- Non-functional: no file is linked purely to silence the checker, and no file
  with load-bearing content is deleted to avoid reading it.

## Architecture

`checkReferenceIntegrity` (`packages/cli/src/kit/reference-integrity.ts`) compares
files on disk against `references/<name>.md` mentions in the body; `validate-command.ts`
reports the difference as `warn:orphan`. Two things are missing: a decision for
each of the 89 existing files, and a gate.

**Per-file decision rule** — read the file, then choose exactly one:
- *Link it* when the body has a place that genuinely needs it (a step, a mode, a
  deeper reference for a decision the skill makes).
- *Index it* when the content is real but optional: add a closing
  `## References` list where each entry is `references/<name>.md — <one-line purpose>`.
  This is a legitimate contents page, and it is honest because the line states
  what the file is for.
- *Delete it* when it is superseded, duplicated in the body, or contradicts the
  current skill.

Silencing the warning by listing a filename with no purpose line is none of the
three and is a review failure.

**Gate** — add `--strict` to `av validate` that promotes **orphan and dangling
reference warnings only** to errors, and run `av validate --strict` in CI. Scope
is deliberate: today all 89 warnings are `orphan` and nothing else, so a
promote-everything flag would be free now and would block the next port of a long
upstream skill later. `skill-lint.ts` keeps reporting size and style as warnings
for ported skills. A repo-level test over `kit/skills` asserting zero orphans is
the belt to that braces: it fails in `pnpm test` before CI is reached.

## Related Code Files

- Modify: ~30 `kit/skills/*/SKILL.md` (the skills owning the 89 files)
- Delete: whichever `kit/skills/*/references/*.md` the decision rule rejects
- Modify: `packages/cli/src/cli/validate-command.ts` — `--strict` flag
- Modify: `packages/cli/src/cli/validate-command.test.ts` — strict-mode cases
- Create: a kit-wide integrity test (alongside `packages/cli/src/kit/reference-integrity.test.ts`)
- Modify: `.github/workflows/ci.yml` — run `av validate --strict`

## Implementation Steps

1. Produce the authoritative list: `av validate` → group the 89 warnings by skill.
2. Batch by skill and delegate in parallel (4-6 batches, disjoint file ownership).
   Each batch returns, per file, the decision, the one-line purpose, and the diff.
3. Apply decisions. Where a batch proposes deleting a file, the report must quote
   what the file claimed and where that claim now lives.
4. Add `--strict` and its tests; add the kit-wide zero-orphan test.
5. Wire CI; confirm the gate fails on a deliberately unreferenced scratch file,
   then remove that file.

## Success Criteria

- [ ] `av validate` → 0 errors and **0 warnings total** (all 89 today are `orphan`,
      so clearing them clears the whole warning set).
- [ ] `av validate --strict` exits non-zero on an injected orphan and zero on a clean tree.
- [ ] `pnpm test` includes a kit-wide orphan test that reads `kit/skills` at runtime.
- [ ] No `## References` entry exists without a purpose line.
- [ ] Kit CI green.

## Risk Assessment

- **Linking everything bloats `SKILL.md` past its token budget.** Signal: a skill
  crosses `SKILL_MAX_LINES` (300, ceiling 400 via `metadata.maxLines`) — a warning
  for these ported skills, not an error — or its body becomes a link farm.
  Response: prefer the index form; if a skill still exceeds budget, that is
  evidence the reference set is too large and files should be deleted or merged —
  decide it there, do not raise the limit.
- **Bulk deletion loses content AgentKit still has.** Signal: a deleted file turns
  out to be the only place a technique was written down. Response: step 3's quote
  requirement makes every deletion reviewable, and the files remain in git history.
- **Parallel batches collide on a shared skill.** Signal: a merge conflict inside
  one `SKILL.md`. Response: batch boundaries are per-skill, never per-file.
