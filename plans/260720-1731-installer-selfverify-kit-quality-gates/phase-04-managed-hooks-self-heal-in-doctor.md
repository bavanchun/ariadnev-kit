---
phase: 4
title: Managed-hooks self-heal in doctor
status: completed
effort: ''
---

# Phase 4: Managed-hooks self-heal in doctor

## Overview

Upgrade `doctor` to detect drifted/missing hook event-bindings in `.claude/settings.json` vs the
kit's expected set, and add `doctor --fix` to re-merge them idempotently (backup first). Closes the
one-way gap: install merges bindings, but nothing re-heals them if they drift.

## Requirements

- Functional:
  - `doctor` compares the installed hooks' expected event-bindings against what's in `.claude/settings.json`;
    reports each missing/drifted binding as a finding.
  - `doctor --fix` merges the expected bindings back idempotently, backing up `settings.json` first
    (reuse existing atomic-write + backup path). Re-run after `--fix` → clean.
  - Non-interactive / declining prints a copy-paste snippet (mirror install behavior).
- Non-functional: claude-code only (other providers skip-and-log); fail-open; atomic + backup (keep last 3).

## Architecture

**Verified**: the merge routine is ALREADY a shared module — `install/hook-settings-merge.ts::mergeHookSettings`
(used by `install-execute.ts`), and `install-plan.ts` builds the `HookBinding[]` for the `hook-settings` op.
So NO extraction needed. Extend `doctor/diagnose.ts`: add a hook-binding diff using existing
`readSettingsJson` dep vs the expected `HookBinding[]` sourced from the same builder install uses (import,
don't copy). `doctor-command.ts` gains `fix: boolean`; on drift + fix, call `mergeHookSettings` + reuse
`install/fs-atomic.ts` + backup helpers.

<!-- Updated: Validation Session 1 - merge routine already shared (hook-settings-merge.ts); drop extraction step -->


## Related Code Files
- Modify: `packages/cli/src/doctor/diagnose.ts` (binding-drift finding), `packages/cli/src/cli/doctor-command.ts` (`--fix`), `packages/cli/src/index.ts` (flag wiring)
- Reuse (already shared): `install/hook-settings-merge.ts::mergeHookSettings`, `install/fs-atomic.ts`, the `HookBinding[]` builder in `install-plan.ts`
- Tests: `doctor-command.test.ts`, `diagnose` test

## Implementation Steps (TDD)
1. **Test first**: diagnose test — given a receipt + a `settings.json` missing a binding, returns a `hook-binding` drift finding; complete settings → none.
2. Implement the drift diff in `diagnose.ts` using the expected-binding source (share, don't copy).
3. **Test**: `runDoctor({fix:true})` on drifted settings → merges bindings, backs up first, second run clean; verify idempotent (no dup bindings).
4. Extract/share the merge routine from install if not already shared; wire `--fix`.
5. **Test**: non-interactive decline path prints the snippet, writes nothing.

## Success Criteria
- [ ] Removing a binding → `doctor` reports `hook-binding` drift
- [ ] `doctor --fix` restores it, backs up settings.json, idempotent on re-run
- [ ] Merge routine single-sourced with install (no duplication)
- [ ] Non-claude providers skip-and-log; fail-open preserved

## Risk Assessment
- Duplicating install's merge logic → divergence. Mitigate: extract to a shared module, test both callers.
- Corrupting a user-edited settings.json → always backup first + atomic temp-rename; never rewrite keys outside the vc hook block.
