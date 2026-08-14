---
phase: 3
title: "Code file renames"
status: pending
priority: P1
effort: "2h"
dependencies: [2]
---

# Phase 03: Code File Renames

## Overview
Rename all codebase files, type symbols, and module imports containing "distill" to use the canonical "kit" / "decisions" / "registry" vocabulary, and permanently remove obsolete upstream synchronization scripts.

## Requirements
- Functional:
  - Rename files via `git mv`:
    - `kit/distill-decisions.json` -> `kit/decisions.json`
    - `packages/cli/src/kit/distill-registry.ts` -> `packages/cli/src/kit/registry.ts`
    - `packages/cli/src/kit/distill-registry.test.ts` -> `packages/cli/src/kit/registry.test.ts`
    - `packages/cli/src/kit/distill-decisions.test.ts` -> `packages/cli/src/kit/decisions.test.ts`
  - Refactor all TypeScript/JavaScript imports and symbol references:
    - `DistillClaim` -> `Claim` or `KitClaim`
    - `DistillRegistry` -> `Registry` or `KitRegistry`
    - `loadDistillDecisions()` -> `loadKitDecisions()` / `loadDecisions()`
  - Update scripts referring to old filenames (`packages/cli/scripts/wave-rollup.mjs`, `coverage-command.ts`, etc.).
  - Permanently delete `packages/cli/scripts/pin-upstream.ts`.
- Non-functional:
  - Zero broken module resolution paths or dangling TypeScript errors.
  - All test suites execute cleanly against new file paths.

## Architecture
```
Old Structure                     New Structure
-------------------------------   -------------------------------
kit/distill-decisions.json     -> kit/decisions.json
src/kit/distill-registry.ts    -> src/kit/registry.ts
src/kit/distill-registry.test.ts-> src/kit/registry.test.ts
src/kit/distill-decisions.test.ts-> src/kit/decisions.test.ts
scripts/pin-upstream.ts        -> [DELETED]
```

## Related Code Files
- Rename:
  - `kit/distill-decisions.json` -> `kit/decisions.json`
  - `packages/cli/src/kit/distill-registry.ts` -> `packages/cli/src/kit/registry.ts`
  - `packages/cli/src/kit/distill-registry.test.ts` -> `packages/cli/src/kit/registry.test.ts`
  - `packages/cli/src/kit/distill-decisions.test.ts` -> `packages/cli/src/kit/decisions.test.ts`
- Modify:
  - `packages/cli/src/commands/coverage-command.ts`
  - `packages/cli/scripts/wave-rollup.mjs`
  - `packages/cli/scripts/compare-tier2-baseline.mjs`
  - Any remaining consumers in `packages/cli/src/`
- Delete:
  - `packages/cli/scripts/pin-upstream.ts`

## Implementation Steps
1. Execute `git mv` for the 4 core files:
   ```bash
   git mv kit/distill-decisions.json kit/decisions.json
   git mv packages/cli/src/kit/distill-registry.ts packages/cli/src/kit/registry.ts
   git mv packages/cli/src/kit/distill-registry.test.ts packages/cli/src/kit/registry.test.ts
   git mv packages/cli/src/kit/distill-decisions.test.ts packages/cli/src/kit/decisions.test.ts
   ```
2. Refactor exported types and classes inside `packages/cli/src/kit/registry.ts`.
3. Update all import statements across `packages/cli/src/**/*.ts` from `"./distill-registry"` or `"../kit/distill-registry"` to `"./registry"`.
4. Update `packages/cli/scripts/wave-rollup.mjs` and related scripts to point to `kit/decisions.json`.
5. Remove `packages/cli/scripts/pin-upstream.ts` using `git rm packages/cli/scripts/pin-upstream.ts`.
6. Run typecheck: `pnpm --filter vcskill lint` (or `tsc --noEmit`).
7. Run vitest: `bun test` or `pnpm test`.

## Success Criteria
- [ ] 4 files successfully renamed with git history preserved.
- [ ] `packages/cli/scripts/pin-upstream.ts` deleted.
- [ ] TypeScript compiles cleanly with 0 errors.
- [ ] All unit and integration tests passing.
- [ ] Zero instances of `distill-registry` or `distill-decisions` in active code imports.

## Risk Assessment
- **Risk:** Unresolved import paths cause runtime crashes in CLI execution.
  - **Observable Signal:** `vitest` or `tsc --noEmit` reports missing module `./distill-registry`.
  - **Response:** Run repository-wide grep for `distill-` across all `.ts` and `.mjs` files to ensure 100% replacement.
