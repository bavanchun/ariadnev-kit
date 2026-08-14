---
phase: 6
title: "Final verification (before history rewrite)"
status: pending
priority: P1
effort: "1h"
dependencies: [5]
---

# Phase 06: Final Verification (Before History Rewrite)

## Overview
Execute a rigorous multi-gate verification sweep to ensure all tests pass, decision rollup scripts execute cleanly against the new ledger schema, and strict grep filters return exactly zero hits before rewriting git commit history.

## Requirements
- Functional:
  - Pass 100% of unit tests (`bun test` or `pnpm test`, ~757 test assertions).
  - Pass 100% of node test suites (`node --test packages/cli/src`, ~99 tests).
  - Execute `packages/cli/scripts/wave-rollup.mjs --table` successfully without warnings or schema errors.
  - Verify zero hits across repository for all banned patterns:
    - Pattern 1: `distill|distillation` (excluding git internals, node_modules, baseline worktree, active plan)
    - Pattern 2: `upstream|AK 2\.|agentkit|AgentKit|ak:` (excluding git internals, node_modules, baseline worktree, active plan)
  - Ensure working tree is clean and ready for commit rewriting.
- Non-functional:
  - Deterministic and reproducible verification results.

## Architecture
```
Verification Pipeline:
[Phase 1-5 Outputs]
       │
       ▼
 ┌───────────────┐
 │ 1. Unit Tests │ ───► 757 Vitest tests GREEN
 └───────────────┘
       │
       ▼
 ┌───────────────┐
 │ 2. Node Tests │ ───► 99 Node.js tests GREEN
 └───────────────┘
       │
       ▼
 ┌───────────────┐
 │ 3. Wave Rollup│ ───► Decision table renders correctly
 └───────────────┘
       │
       ▼
 ┌───────────────┐
 │ 4. Grep Audit │ ───► 0 occurrences across all target files
 └───────────────┘
       │
       ▼
[Gate Passed -> Proceed to Phase 7 History Rewrite]
```

## Related Code Files
- Verify:
  - `kit/decisions.json`
  - `packages/cli/src/kit/registry.ts`
  - `packages/cli/scripts/wave-rollup.mjs`
  - All repository source files

## Implementation Steps
1. Run Vitest test suite:
   ```bash
   pnpm test
   ```
2. Run Node.js test runner:
   ```bash
   node --test "kit/hooks/**/*.test.cjs" "packages/cli/scripts/**/*.test.mjs"
   ```
3. Run wave rollup script:
   ```bash
   node packages/cli/scripts/wave-rollup.mjs --table
   ```
4. Run strict vocabulary grep checks:
   ```bash
   grep -rE "distill|distillation" --include="*.ts" --include="*.mjs" --include="*.json" --include="*.md" --include="*.yml" . \
     | grep -v node_modules | grep -v ".git/" | grep -v "worktrees/vcskill-baseline/" | grep -v "260814-1615-kit-rebrand-strip-upstream"
   
   grep -rE "upstream|AK 2\.|agentkit|AgentKit|ak:" --include="*.ts" --include="*.mjs" --include="*.json" --include="*.md" --include="*.yml" . \
     | grep -v node_modules | grep -v ".git/" | grep -v "worktrees/vcskill-baseline/" | grep -v "260814-1615-kit-rebrand-strip-upstream"
   ```
5. If any hit or test failure occurs: abort transition to Phase 7, debug and fix in-place.

## Success Criteria
- [ ] Vitest test suite passes completely (757 tests).
- [ ] Node test runner passes completely (99 tests).
- [ ] Wave rollup executes and outputs valid tabular report.
- [ ] Grep checks return exactly 0 results.
- [ ] Working tree status is staged and clean.

## Risk Assessment
- **Risk:** Premature history rewrite while latent test or import failures exist.
  - **Observable Signal:** Any non-zero exit code during steps 1-4.
  - **Response:** Hard gate: Phase 7 must not be triggered until all 4 verification steps yield exit code 0.
