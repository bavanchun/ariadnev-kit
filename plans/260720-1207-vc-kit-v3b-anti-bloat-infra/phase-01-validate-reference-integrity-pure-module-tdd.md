---
phase: 1
title: "validate: reference-integrity pure module (TDD)"
status: pending
priority: P1
effort: "3h"
dependencies: []
---

# Phase 1: reference-integrity pure module (TDD)

## Overview

The one piece of new logic `validate` needs that `loadKit` doesn't already do:
detect references that are linked-but-missing (dangling) and files-that-exist-
but-unlinked (orphan). Pure function, no fs — the caller passes it the SKILL.md
body + the list of reference filenames it found.

## Requirements

- Functional: `checkReferenceIntegrity(body: string, referenceFiles: string[]):
  { dangling: string[]; orphans: string[] }`.
  - `dangling` = a `references/<name>.md` mentioned in `body` whose `<name>.md`
    is not in `referenceFiles`.
  - `orphans` = a file in `referenceFiles` never mentioned in `body`.
  - Match `references/<name>.md` tokens in markdown (links, inline code, prose);
    tolerate `./references/`, backticks, parens. Only `.md` under `references/`.
- Non-functional: pure (no fs/network), deterministic, ordered output.

## Architecture

New file `packages/cli/src/kit/reference-integrity.ts`. A regex extracts every
`references/<name>.md` occurrence from `body` into a Set; compare against
`referenceFiles` (basenames). Return the two diffs, sorted. No dependency on
loadKit — the command layer (phase 2) supplies both inputs from the filesystem.

## Related Code Files

- Create: `packages/cli/src/kit/reference-integrity.ts`
- Create: `packages/cli/src/kit/reference-integrity.test.ts`
- Read: `packages/cli/src/kit/skill-lint.ts` (naming/return-shape convention to match)

## Implementation Steps

1. **Red**: write `reference-integrity.test.ts` first — cases: linked+exists →
   clean; linked+missing → dangling; exists+unlinked → orphan; multiple; none;
   `./references/` prefix + backticked mention both count as linked; a
   non-`.md` file in the list is ignored. Run, confirm failure.
2. **Green**: implement `checkReferenceIntegrity` to pass.
3. Confirm ≥90% branch coverage on the new file (it's tiny + pure).

## Success Criteria

- [ ] `checkReferenceIntegrity` returns correct dangling+orphan sets for all test cases
- [ ] Test written before implementation (red run shown), then green
- [ ] Pure — no fs/network import in the module
- [ ] `pnpm test` green

## Risk Assessment

- Over-eager regex flags a `references/x.md` mentioned only as an example →
  acceptable: if SKILL.md names it, it should exist. Under-match (misses a link
  style) → covered by testing the real link styles used in the kit (backtick,
  plain, `./`-prefixed).

## Stop Conditions

- None expected (isolated new pure module). If matching real kit link styles
  needs a body-format change to an existing SKILL.md, note it and defer that
  edit to phase 2 rather than expanding regex complexity.
