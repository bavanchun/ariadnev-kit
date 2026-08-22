---
phase: 1
title: "Link integrity"
status: todo
priority: P1
effort: "2-3d"
dependencies: []
---

# Phase 1: Link integrity

## Overview

Teach `av validate` to see cross-skill links, then fix every broken one. Today
the checker ignores them by design, so ~33 dead paths across four shapes sit in
the corpus while validate prints `all checks passed`.

The draft of this phase specified a checker that would have been a **no-op**: a
reviewer ran its regexes and all 21 links it targeted resolved cleanly. The
corrected design is below.

## Requirements

**Functional**
- **Two independent rules**, not one:
  - *Existence* — the target skill and file exist somewhere in the kit.
  - *Shape* — the written path matches `(../)+av-<slug>/…`, the installed layout.
- The checker scans reference-file content, not only `SKILL.md` bodies.
- Charter covers `references/*.md`, `SKILL.md`, and `scripts/*` targets.
- All four broken shapes fixed in the corpus.

**Non-functional**
- Pure function, no `fs` calls inside the checker.
- The kit-wide map is built from `kit.skills`, **not** from the filtered loop.
- Zero false positives on prose that merely names another skill.

## Architecture

`checkReferenceIntegrity(body, referenceNames)`
(`reference-integrity.ts:30`) is per-skill and stays untouched — 12 tests depend
on it and its intra-skill contract is correct. Cross-skill checking is a
**sibling function** in a new file.

### Why existence alone is not enough

Resolving `../av-cook/references/x.md` by stripping `av-` and looking up skill
`cook` answers *"does that file exist"* — and the answer is yes for every
current link, including `kits/core/skills/av-cook/references/x.md`, which names
a directory layout that has not existed since the rename. The two forms are
indistinguishable to a name lookup. Only a shape rule separates them.

Severity is staged so phase 1 can merge before phase 3:

| Rule | Phase 1 | Phase 3 |
|---|---|---|
| existence (unknown skill / unknown file) | error | error |
| shape: `kits/core/skills/…` | error | error |
| shape: unprefixed `../<slug>/…` | warn | **error** |
| shape: `(../)+av-<slug>/…` | pass | pass |

### The four broken shapes

| Shape | Count | Example | Fix |
|---|---|---|---|
| `../av-<slug>/references/x.md` | 15 | `ariadnev/SKILL.md:103-105` | none — phase 3 makes these true |
| `kits/core/skills/<slug>/…` | 13 strings, 6 files | `ship/SKILL.md:89-90`, `team/SKILL.md:116,142,158,174`, `handover/SKILL.md:85` | rewrite to `../av-<slug>/…` at correct depth |
| unprefixed `../<slug>/references/x.md` — **works today, breaks at phase 3** | 2 | `find-skills/references/domain-routing.md:13`, `preview/references/visual-explanation-routing.md:29` | rewrite to `../../av-<slug>/…` |
| target never existed | 1 | `pm/references/sync-back.md:21` → `risk-lanes.md` | author it or drop the citation |

Plus one path that escapes the skills root entirely and can never resolve in
installed coordinates: `tech-graph/SKILL.md` →
`../../../../docs/operations/maintainer-sync-workflow.md`.

### The filtered-loop trap

`runValidate` builds `skillsToCheck` from `opts.skillFilter`
(`validate-command.ts:127`), and `av eval --skill <name>` passes that filter
(`eval-command.ts:68`). Building the kit-wide map inside the per-skill loop at
`:141-150` would give it one entry under a filtered run, so every cross-skill
link would report `unknown-skill`. **Build the map from `kit.skills` in a
separate pass before the loop.** The map is kit-wide; the findings are filtered.

## Related Code Files

- Create: `packages/cli/src/kit/cross-skill-references.ts` + test
- Modify: `packages/cli/src/cli/validate-command.ts` (map pass before the loop;
  add `"cross-dangling"` and `"cross-shape"` to the kind union at line 36)
- Modify (stale-root, 6 files): `kit/skills/ship/SKILL.md`,
  `kit/skills/ship/references/ship-workflow.md`,
  `kit/skills/git/references/workflow-merge-pr.md`,
  `kit/skills/team/SKILL.md`, `kit/skills/handover/SKILL.md`,
  `kit/skills/handover/references/runtime-catalog.md`
- Modify (breaks at phase 3): `kit/skills/find-skills/references/domain-routing.md`,
  `kit/skills/preview/references/visual-explanation-routing.md`
- Modify: `kit/skills/pm/references/sync-back.md`, `kit/skills/tech-graph/SKILL.md`
- Modify: `packages/cli/src/cli/validate-command.test.ts`

## Implementation Steps

1. Write failing tests first, covering both rules: prefixed+resolving (pass),
   unknown slug (error), known slug missing file (error), stale root (error),
   unprefixed shape (warn now / error later), link inside a `references/*.md`
   file (caught), bare `av:<slug>` prose (not flagged), self-reference (pass),
   pending-port skill (skipped), **and a filtered run (`skillFilter`) still
   resolving a cross-skill link** — the regression test for the map-scope trap.
2. Implement `checkCrossSkillReferences(sources, skillIndex, pendingSkillNames)`
   returning `{source, raw, targetSkill, targetFile, reason}` with `reason` in
   `unknown-skill | unknown-file | bad-shape`.
3. Build `skillIndex` from `kit.skills` in its own pass before the filtered loop.
4. Wire both finding kinds, staged per the severity table.
5. Fix all 13 stale-root strings across 6 files. Verify with the grep gate.
6. Fix the 2 unprefixed links that phase 3 would otherwise break.
7. Resolve `pm`'s dangling `risk-lanes.md` (drop the citation is the default)
   and `tech-graph`'s escaping path.
8. Run `node packages/cli/dist/index.js validate` and confirm it now reports
   what it previously could not.

## Success Criteria

- [ ] `grep -rn 'kits/core/skills/' kit/` returns **nothing**. One-line gate
      covering the class the checker's charter might miss.
- [ ] A recursive grep for unprefixed `(\.\./)+[a-z][a-z0-9-]*/references/` across
      all of `kit/` returns nothing. This covers the **installed-but-unlinted**
      class: `install-plan.ts:79-92` walks recursively, so nested subtrees
      (`document-skills/{pdf,pptx,docx,xlsx}/`, and nested reference dirs under
      `payment-integration`, `code-review/references/checklists`,
      `deploy/references/platforms`) ship to users and run at runtime while
      being invisible to `loadKit` (`load-kit.ts:67-71`, non-recursive) and
      therefore to this checker. They contain zero cross-skill links today; the
      grep keeps it that way.
- [ ] A fixture with `../cook/references/x.md` (unprefixed, target exists) is
      **flagged** — proving the shape rule works where a name lookup cannot.
- [ ] A filtered run (`av eval --skill plan`) does not report false
      `unknown-skill` findings.
- [ ] A link written only inside a `references/*.md` file is caught.
- [ ] Bare `av:<slug>` prose is not flagged.
- [ ] `pm/references/sync-back.md` cites nothing nonexistent.
- [ ] `pnpm test` green.

## Risk Assessment

**The checker verifies existence and calls it done.** This is the failure the
draft actually made, and it is silent: `av validate` prints `all checks passed`
and the plan's headline goal is reported met while ~33 paths stay dead.
*Signal:* the test suite has no case where a link whose target exists is
nonetheless an error. *Pre-decided response:* Success Criterion 2 exists
specifically to make that case mandatory.

**Rewriting the stale-root links to the wrong form.** The draft told the author
to rewrite them unprefixed, which would have created six new broken links.
*Response:* the fix column now says `../av-<slug>/…` and the depth must match
the emitting file's location — a link from inside `references/` needs `../../`.

**Charter creep.** Widening to `SKILL.md` and `scripts/*` targets is a bigger
check than the draft's `references/*.md`-only charter. It is in scope because
leaving ~10 known-broken paths behind is exactly the false-green this plan
condemns. *Response:* the same regex family covers all three; the shape rule is
target-kind-agnostic.
