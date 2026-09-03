---
phase: 2
title: "Ledger schema strip"
status: completed
completed: 2026-08-14
priority: P1
effort: "2h"
dependencies: [1]
---

# Phase 02: Ledger Schema Strip

## Overview
Purge all upstream metadata and terminology (`upstream_source`, `upstream_version`, `upstream_digest`, `upstream_relation`, external `references`) from the TypeScript type definitions, test suites, and JSON decision ledger, while retaining critical internal verification anchors.

## Requirements
- Functional:
  - Strip `upstream_source`, `upstream_version`, `upstream_digest`, and `upstream_relation` properties from `SkillEntry` interface in `packages/cli/src/kit/distill-registry.ts`.
  - Strip `references` array (paths referencing upstream repository files) from each skill entry.
  - Retain `anchor` field in `DistillClaim` (`Claim`) to guarantee content verification capability.
  - Clean `kit/distill-decisions.json` across all 25 skills: remove stripped fields and rewrite `claims[].why` strings to eliminate upstream references (e.g. `"compacted: upstream noise..."` -> `"compacted: extraneous runtime noise..."`).
  - Update `packages/cli/src/kit/distill-decisions.test.ts` to remove expectations for deleted upstream fields while validating schema validity and claim anchor integrity.
- Non-functional:
  - TypeScript compilation passes without errors.
  - Schema remains strict and deterministic.

## Architecture
```
Before:
SkillEntry {
  name: string
  upstream_source: string      <-- REMOVED
  upstream_version: string     <-- REMOVED
  upstream_digest: string      <-- REMOVED
  upstream_relation: string    <-- REMOVED
  references: string[]         <-- REMOVED
  claims: Claim[] {
    anchor: string             <-- PRESERVED
    why: string (with AK refs) <-- SANITIZED
  }
}

After:
SkillEntry {
  name: string
  claims: Claim[] {
    anchor: string
    why: string (native kit reasoning)
  }
}
```

## Related Code Files
- Modify:
  - `packages/cli/src/kit/distill-registry.ts`
  - `kit/distill-decisions.json`
  - `packages/cli/src/kit/distill-decisions.test.ts`

## Implementation Steps
1. Edit `packages/cli/src/kit/distill-registry.ts`:
   - Delete `upstream_source`, `upstream_version`, `upstream_digest`, `upstream_relation`, `references` from type declarations and schemas.
   - Retain `SkillClaim` / `Claim` definitions and anchor verification logic.
2. Edit `kit/distill-decisions.json`:
   - For all 25 skill objects, remove keys: `upstream_source`, `upstream_version`, `upstream_digest`, `upstream_relation`, `references`.
   - Scan all `claims[].why` entries; rewrite any sentence mentioning "upstream" or "agentkit" into self-contained kit authoring rationale.
3. Edit `packages/cli/src/kit/distill-decisions.test.ts`:
   - Remove assertions validating upstream fields.
   - Ensure claim prefix and anchor validation tests remain fully functional.
4. Run validation:
   - `pnpm --filter vcskill test` or `bun test packages/cli/src/kit`.
   - Grep for `"upstream"` in `packages/cli/src/kit/` and `kit/distill-decisions.json` to confirm 0 hits.

## Success Criteria
- [ ] Schema stripped of all 5 upstream properties.
- [ ] All 25 skills in `kit/distill-decisions.json` sanitized and passing JSON validation.
- [ ] `claims[].why` entries free of upstream terminology.
- [ ] `packages/cli/src/kit/distill-decisions.test.ts` passes 100%.
- [ ] Zero grep hits for `upstream` in `packages/cli/src/kit/` and `kit/distill-decisions.json`.

## Risk Assessment
- **Risk:** Deletion of `upstream_*` fields breaks automated ledger validation tooling or downstream scripts.
  - **Observable Signal:** `vitest` fails on missing property errors during schema validation.
  - **Response:** Update validation schemas (Zod/Ajv) and test fixtures synchronously to align with the simplified schema.
