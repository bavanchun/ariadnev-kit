---
phase: 3
title: "Scale tooling — justified-collision allowlist + metadata.category"
status: done
priority: P1
effort: "5h"
dependencies: []
---

# Phase 3: Scale tooling (collision + taxonomy)

## Overview
Make the description-collision gate correct as the kit grows, without loosening
thresholds, and add an optional category field so 86 skills stay legible.

## Requirements
- Functional:
  1. A per-pair **justified-similar allowlist** so legitimately-adjacent skills (e.g. `vc:frontend-development`/`vc:frontend-design`) can pass an otherwise-error/warn pair *explicitly*, with a required reason.
  2. Optional additive `metadata.category` frontmatter field, accepted by `skill-lint` allowlist (currently rejects unknown fields).
- Non-functional: TDD, ≥95% coverage on touched adapt/kit code; zero regressions in existing validate.

## Architecture
- `description-collision.ts` (`ERROR_THRESHOLD=0.6`, `WARN_THRESHOLD=0.4`): keep thresholds. Add `allowlist: {a,b,reason}[]` param; `scoreDescriptions` skips pairs present in allowlist (or downgrades error→acknowledged). Allowlist lives in a small config (e.g. `kit/collision-allowlist.json`) loaded by `validate-command.ts`.
- `skill-lint.ts` frontmatter allowlist: add `category` (and confirm `metadata.*` nesting already allowed). Enumerate valid categories from Phase 2's taxonomy (or free-string + warn on unknown — decide in step 1, KISS = free-string, no enforcement yet).
- Re-run the calibration test at projected scale using Phase 2's planned descriptions as fixtures to confirm no surprise errors among the 5 Wave-1 additions.

## Related Code Files
- Modify: `packages/cli/src/kit/description-collision.ts`
- Modify: `packages/cli/src/cli/validate-command.ts` (load + pass allowlist)
- Modify: `packages/cli/src/kit/skill-lint.ts` (accept `category`)
- Create: `kit/collision-allowlist.json` (empty/seed)
- Create/Modify tests: `packages/cli/src/kit/description-collision.test.ts`, skill-lint tests, calibration test

## Implementation Steps
1. Decide category handling (recommend free-string additive, no enforcement — YAGNI).
2. TDD: write failing tests for allowlist skip + `category` acceptance.
3. Implement allowlist param + config load; implement `category` in lint allowlist.
4. Add the 5 Wave-1 descriptions as calibration fixtures; assert 0 unjustified errors.
5. Run `pnpm test` + `vc validate` green.

## Success Criteria
- [ ] Allowlisted similar pairs pass; non-allowlisted near-dupes still error
- [ ] `metadata.category` accepted by lint; existing skills still pass
- [ ] Coverage ≥95% on changed files; full suite green
- [ ] `vc validate --check` green

## Risk Assessment
- **Allowlist becomes a loophole.** Mitigation: require a `reason` per entry; keep it tiny; review in validate output. Threshold itself unchanged.
