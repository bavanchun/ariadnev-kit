---
phase: 3
title: "pm disposition + plan evidence rule + friction wiring + hooks README"
status: pending
priority: P1
effort: "3h"
dependencies: []
---

# Phase 3: pm disposition + evidence rule + friction wiring + hooks README

## Overview

Kit-content changes (markdown + hook headers) that operationalize the RDD
anti-bloat lesson and de-black-box the hooks. No CLI code.

## Requirements

1. **pm disposition step** — `kit/skills/pm/references/sync-back.md` gains a
   "Disposition on close" section: when a plan reaches all-completed,
   (a) distill any durable decision into `docs/` via `vc:docs` decision mode,
   (b) delete the plan dir + reports tied only to that plan, (c) record a
   one-line disposition in the closing commit. Git is the archive; no `_archive/`.
2. **Evidence rule** — `kit/skills/plan/references/plan-file-templates.md` +
   `kit/skills/plan/SKILL.md` sync-back guard: a `[x]` acceptance/success box
   MUST cite its evidence (test name+count, file path, or command output) — an
   un-evidenced tick is treated as unchecked.
3. **Friction wiring** — `kit/skills/pm/references/sync-back.md` (or pm SKILL)
   routes repeated friction (same confusion/missing-doc 2nd+ time observed while
   closing) into `vc:journal`'s harness-delta mode. Keep it a pointer, not a new
   mechanism — journal already owns the format.
4. **hooks README + headers** — `kit/hooks/README.md` lists all 6 hooks
   (session-init, rules-inject, privacy-block, scout-block, session-state,
   subagent-init): event it fires on, what it observes/injects, fail-open note.
   Add a 4-6 line header comment to each `hook.cjs` (what/when/observes).

## Related Code Files

- Modify: `kit/skills/pm/references/sync-back.md`, `kit/skills/pm/SKILL.md`
- Modify: `kit/skills/plan/references/plan-file-templates.md`, `kit/skills/plan/SKILL.md`
- Create: `kit/hooks/README.md`
- Modify: `kit/hooks/*/hook.cjs` (header comment each; do NOT change logic)

## Implementation Steps

1. Read current sync-back.md + pm SKILL; add disposition + friction sections.
2. Tighten the evidence rule in plan template + sync-back guard.
3. Read each hook.cjs's top; prepend a header comment (behavior unchanged).
4. Write hooks/README.md from the 6 manifests (`hook.json`) + headers.
5. `pnpm test` — hook node:test suites must stay green (headers are comments;
   confirm no parse breakage). Lint gate green.

## Success Criteria

- [ ] sync-back.md has a Disposition-on-close step (distill → delete → 1-line note)
- [ ] Evidence-cited checkbox rule explicit in plan template + sync-back
- [ ] Friction routes to vc:journal harness-delta (pointer, no new mechanism)
- [ ] hooks/README.md documents all 6 hooks; each hook.cjs has a header
- [ ] Hook node:test suites green; kit lint green; no hook logic changed

## Risk Assessment

- Editing hook.cjs risks breaking a fail-open hook. Mitigation: comment-only
  headers, run the hook node:test suite after, diff to confirm logic untouched.
- Disposition step could read as "always delete" — word it as "after distilling
  durable content", gated, never automatic.

## Stop Conditions

- If adding a header changes any hook's `require.main === module` behavior or a
  test flips red, revert that header and report — hooks are fail-open safety
  code, correctness beats documentation.
