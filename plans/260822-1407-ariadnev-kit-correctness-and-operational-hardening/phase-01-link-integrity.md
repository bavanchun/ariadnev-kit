---
phase: 1
title: "Link integrity"
status: completed
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

- [x] `grep -rn 'kits/core/skills/' kit/` returns **nothing**. One-line gate
      covering the class the checker's charter might miss.
- [x] A recursive grep for unprefixed `(\.\./)+[a-z][a-z0-9-]*/references/` across
      all of `kit/` returns nothing. This covers the **installed-but-unlinted**
      class: `install-plan.ts:79-92` walks recursively, so nested subtrees
      (`document-skills/{pdf,pptx,docx,xlsx}/`, and nested reference dirs under
      `payment-integration`, `code-review/references/checklists`,
      `deploy/references/platforms`) ship to users and run at runtime while
      being invisible to `loadKit` (`load-kit.ts:67-71`, non-recursive) and
      therefore to this checker. They contain zero cross-skill links today; the
      grep keeps it that way.
- [x] A fixture with `../cook/references/x.md` (unprefixed, target exists) is
      **flagged** — proving the shape rule works where a name lookup cannot.
- [x] A filtered run (`av eval --skill plan`) does not report false
      `unknown-skill` findings.
- [x] A link written only inside a `references/*.md` file is caught.
- [x] Bare `av:<slug>` prose is not flagged.
- [x] `pm/references/sync-back.md` cites nothing nonexistent.
- [x] `pnpm test` green.

## What review changed — merged as PR #24

The first pass passed all criteria and was still wrong in four ways. Recorded
because three of them are classes, not incidents.

1. **Two false positives that fail CI on correct content.** A script target had
   no anchor, so the full stop ending "run `../av-x/scripts/y.cjs`." became part
   of the filename — `references/*.md` was safe only because `\.md` anchors it.
   And the pattern allowed nested script paths while the index was built flat, so
   a link to `plans-kanban/scripts/lib/*.cjs`, a file that exists, reported
   missing. Segments now end in an alphanumeric; the index walks recursively.

2. **A bulk rewrite treated a fenced bash path as a markdown link.**
   `ship-workflow.md` had `POST_BIN=kits/core/skills/av-journal/scripts/post-social.cjs`
   as a shell fallback. The perl pass turned it into `../../`, which bash resolves
   against the user's project directory and lands outside it. Its paired line
   claimed "same shape as step 4" and had drifted differently.

   That pair exposed a wider class: **every** `kits/core/` path was stale — the
   tree is `kit/`, hooks live under `kit/hooks/_lib/` — and the installed-first
   halves were wrong too, since hooks install to `.claude/hooks/av/_lib/`, not
   `.claude/hooks/lib/`. 14 source-repo paths plus 3 installed paths, both halves
   of every pair now checked against files that exist.

3. **The dangling citation had a source.** `docs/av-skill-authoring-spec.md`
   instructed every skill author to cite `cook/references/risk-lanes.md`, which
   does not exist. Removing it from `pm` alone satisfies the literal criterion
   while leaving the instruction that regenerates it.

4. **The CI grep filtered whole lines.** A good link could mask a bad one on the
   same line. It filters paths now, with a probe demonstrating the difference.

Also: an unprefixed link short-circuited before the existence check, leaving a
typo'd slug at warn level when the severity table puts existence at error.

**Unpaid debt, recorded at the top of [phase 3](./phase-03-installer-av-prefix-and-heal.md):**
nothing produces the `av-` layout yet, so 0 of 28 prefixed links resolve against
a real install, and this phase nets −2 working links until phase 3 lands.

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
