---
phase: 3
title: Skill-description collision scorer
status: completed
effort: ''
---

# Phase 3: Skill-description collision scorer

## Overview

Detect skill-description confusability across the whole kit so routing collisions don't silently
worsen as the kit grows past 21 skills. Jaccard token-set similarity over all descriptions →
flag confusable pairs + cycles. **WARN by default; ERROR only ≥ near-duplicate threshold.**

Depends on Phase 2 (both touch `validate-command.ts`) — do after Phase 2.

## Requirements

- Functional: a new kit-level check compares every pair of skill descriptions by normalized
  token-set Jaccard; pair ≥ `WARN_THRESHOLD` → warning; ≥ `ERROR_THRESHOLD` (near-duplicate) → error.
  Surfaced through `runValidate` findings (`kind: "collision"`).
- Non-functional: pure + O(n²) over ~21 short strings (trivial); thresholds chosen so the CURRENT
  kit passes at warn-level with zero errors.

## Architecture

New pure module `src/kit/description-collision.ts`: `scoreDescriptions(skills) → {pairs:[{a,b,score}], cycles}`.
Tokenize = lowercase, split on non-word, drop stopwords + the shared `use/invoke/run/activate/trigger`
trigger verbs (else every description looks similar). `validate-command.ts` calls it once over
`kit.skills`, emits findings. Thresholds are module constants with a comment on how they were picked.

## Related Code Files
- Create: `packages/cli/src/kit/description-collision.ts` (+ `.test.ts`)
- Modify: `packages/cli/src/cli/validate-command.ts` (invoke scorer, add `collision` finding kind), its `.test.ts`
- Read-only: `src/kit/skill-lint.ts` (per-skill lint — this is the missing CROSS-skill pass)

## Implementation Steps (TDD)
1. **Test first**: `description-collision.test.ts` — two near-identical strings → score above error threshold; mildly-similar → warn band; distinct → below warn. Include a calibration test asserting the real 21 kit descriptions produce ZERO errors (fixture or load real kit).
2. Implement tokenizer + Jaccard + threshold banding to pass tests.
3. **Test**: `runValidate` returns `collision` findings at the right severity; `ok` stays true for warn-only.
4. Wire scorer into `validate-command.ts`; ensure `ValidateResult.ok` is false only on error-band collisions.
5. Run `vcskill validate` on the real kit — confirm current kit is clean (no errors).

## Success Criteria
- [ ] `description-collision.test.ts` green incl. real-kit calibration (0 errors today)
- [ ] Near-duplicate descriptions → `validate` exits non-zero
- [ ] Mildly-similar → warning, `validate` still passes
- [ ] Thresholds documented in-code with rationale

## Risk Assessment
- Heuristic thresholds are subjective → lock them with the calibration test over the current kit; if a real future skill trips a false error, adjust threshold not the skill.
- Trigger verbs inflate similarity → strip them in tokenization (tested).
