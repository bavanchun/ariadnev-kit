---
phase: 2
title: "validate: CLI command + loadKit wiring + CI"
status: pending
priority: P1
effort: "3h"
dependencies: [1]
---

# Phase 2: validate CLI command + loadKit wiring + CI

## Overview

Wrap phase-1's checker + the existing `loadKit` lint into a `vcskill validate`
subcommand: one non-interactive, exit-coded kit health check, wired into CI.

## Requirements

- Functional: `vcskill validate` →
  1. Run `loadKit(cwd)`; a thrown `KitValidationError` = hard fail (frontmatter,
     lint, duplicate name, missing hook file). Report the message.
  2. If loadKit passed, walk `kit/skills/*` and `kit/agents/`: for each skill
     read `SKILL.md` + list its `references/*.md`, run `checkReferenceIntegrity`;
     collect dangling + orphans across all.
  3. Print a summary: `N skills, M agents, K hooks checked` + findings grouped
     by skill. Exit 0 if clean, 1 if any lint error or reference finding.
- Non-functional: no writes (read-only); follows the `doctor` command shape.

## Architecture

New `packages/cli/src/cli/validate-command.ts` exporting `runValidate(opts)`
returning a structured result `{ ok: boolean; findings: Finding[] }` (testable),
plus a thin printer. `runValidate` takes an injectable kit root (default: resolve
from cwd) so tests point it at a fixture kit. Register in `index.ts` as
`.command("validate")` following the `doctor` registration pattern (lines ~91).

## Related Code Files

- Create: `packages/cli/src/cli/validate-command.ts`
- Create: `packages/cli/src/cli/validate-command.test.ts`
- Modify: `packages/cli/src/index.ts` (register `validate`)
- Modify: `.github/workflows/*.yml` (add a `vcskill validate` CI step — read the
  existing workflow first to match its build/test job shape)
- Read: `packages/cli/src/cli/doctor-command.ts` (command shape), `load-kit.ts`

## Implementation Steps

1. **Red**: `validate-command.test.ts` — clean fixture kit → `ok:true` exit 0;
   fixture with an injected orphan reference → `ok:false` with that orphan named;
   fixture with a lint error → `ok:false`. Run, confirm failure.
2. **Green**: implement `runValidate` (loadKit + per-skill reference-integrity).
3. Register command in `index.ts`; `pnpm build`; smoke `node dist/index.js
   validate` against the real kit → must exit 0 (kit is clean post-v3a).
4. Add CI step (after build, before/with tests) running `validate`; verify the
   workflow file parses.

## Success Criteria

- [ ] `vcskill validate` exit 0 on the real clean kit (live smoke)
- [ ] Injected orphan → exit 1 naming the file (test)
- [ ] Injected lint error → exit 1 (test)
- [ ] CI workflow runs validate as a gate
- [ ] `pnpm test` green; no change to loadKit/skill-lint/agent-lint behavior

## Risk Assessment

- loadKit fails-fast on first lint error → validate won't list *all* lint errors
  in one run. Acceptable v1: lint errors are rare + the message names the file;
  reference findings (the new value) are collected exhaustively. Note in parity report.
- CI step added to wrong job → run validate in the same job that already builds
  the CLI, after build.

## Stop Conditions

- If the real kit does NOT validate clean (unexpected pre-existing orphan/dangling),
  STOP and fix the kit defect first (that's validate doing its job) — do not
  weaken the check to make it pass.
- If wiring CI requires changing the release/publish job (not just the test job),
  confirm scope before touching release automation.
