---
phase: 8
title: "Skill content burn-down"
status: in-progress
priority: P1
effort: "65-118h (8-15d)"
dependencies: [2, 3]
---

# Phase 8: Skill content burn-down

## Overview

Bring all 101 exempted skills to the house authoring bar and empty the ratchet.

Phase 2 made the target a number: `av validate` reports **388 finding(s) held by
kit/skills-lint-exempt.json**. That is the burn-down. The 159 warnings printed
beside it are the duplicate-heading heuristic, hold for every skill, and are not
this phase's work. Of the 388, 301 are missing required sections (101 × Output
format, 101 × Quality gates, 99 × Workflow position) — a section written, not a
line trimmed, is most of the job.
The long pole — a content-authoring project, not an engineering one. Depends on
phase 2 for the mechanism that makes it mergeable one skill at a time, and on
phase 4 so edits are authored against final install semantics.

## Requirements

**Functional**
- Every skill has real `## Output format`, `## Quality gates`, `## Workflow position`.
- Every SKILL.md ≤300 lines; every reference file ≤800 (the raised cap).
- Every description ≤200 chars with a trigger verb.
- `kit/skills-lint-exempt.json` reaches zero.

**Non-functional**
- Sections are grounded, not filler. A section that makes `validate` green while
  saying nothing is worse than the honest silence it replaced.
- CI green at every merge; one skill or small batch per PR.

## Architecture

### The work, measured

Computed by replaying `lintSkill`'s exact algorithm against every **top-level**
`kit/skills/*/SKILL.md`. Note `loadKit` does **not** recurse: `pdf` and `pptx`
live at `kit/skills/document-skills/{pdf,pptx}/SKILL.md` and are never linted as
separate skills. A red-team finding claiming otherwise was rejected as a `find`
recursion artifact.

| Tier | Definition | Count | Per skill | Subtotal |
|---|---|---|---|---|
| A | ≤300 lines, sections only (43 also need a description rewrite) | **84** | 20-35 min | 28-49 h |
| B | 300-400 lines: sections + trim | **10** | 45-75 min | 7.5-12.5 h |
| C | >400 lines: sections + `references/` extraction | **7** | 2.5-5 h | 17.5-35 h |
| — | 6 reference files >800 lines: split | 6 | 30-60 min | 3-6 h |
| — | second-reader review (all of C, 20% of A) | — | — | 9-15 h |
| | | | **Total** | **65-118 h** |

Tier B: `agentize`(302) `cook`(311) `markdown-novel-viewer`(321) `shopify`(329)
`ui-styling`(330) `web-frameworks`(334) `mcp-builder`(338) `orchestrate`(348)
`fix`(351) `design`(368).

Tier C: `fable-thinking`(401) `frontend-development`(409) `review-pr`(441)
`tech-graph`(447) `plan`(629) `ui-ux-pro-max`(668) `cti-expert`(903).

Also folded into each skill's own PR: **45 descriptions** over 200 chars and
**19 missing a trigger verb**.

### Reference files: the cap moved, so the work shrank

Of **463** linted reference files, 83 exceed the old 300-line cap — 42k lines,
~189 fragments if split. Phase 2 raises `REFERENCE_MAX_LINES` to **800**, leaving
**6** files to split: `preview/references/html-css-patterns.md` (1717),
`preview/references/html-slide-patterns.md` (1401),
`mobile-development/references/mobile-debugging.md` (1089),
`backend-development/references/backend-debugging.md` (904), and two more.

This is the plan's one deliberate loosening; its justification lives in the plan
index. It converts ~25-40 h of fragment-shuffling into ~3-6 h of splitting the
files that genuinely defeat progressive disclosure.

### The phantom-CLI class, and what it means for "done" (2026-08-23)

`cook/references/plan-state-files-first.md` described **AgentKit's `ak plan`**
after a bare `ak`→`av` rename: a SQLite `plans.db` index, `create` and
`add-phase` subcommands, and `--linked-pr` / `--issue` / `--root-comment-id` /
`--status` flags. None exist. `av plan reindex --help` says outright "there is
no index to rebuild", and `close` is simply `runPlanStatus(plan, "completed")`
writing the file. `av:ship`, `av:git` and `av:review-pr` routed their whole
merge protocol through that fiction. A kit-wide sweep against the real command
surface bounded it to **6 files** — the shared reference, `ship-workflow.md`,
`ship/SKILL.md`, `review-pr/SKILL.md`, `vibe/SKILL.md`, `issue-to-plan/SKILL.md`
— but the class is what matters, not the count.

This phase was scoped as a **formatting** burn-down: sections, line caps,
description caps. Nothing in it asks whether a skill describes software that
exists. The corpus was ported from AgentKit, so that gap is systematic by
construction. Widen the definition of done, narrowly — a *referential* truth
gate, not an open-ended fact check:

1. **Mechanize the CLI half.** Every backticked `av …` invocation in kit
   markdown must resolve against the CLI's registered verbs and flags.
   `cross-skill-references.ts` and `reference-integrity.ts` already implement
   this shape of check for links. A phantom `--linked-pr` or `av plan create`
   then fails lint, free per skill forever, and would have caught this entire
   class mechanically across all 69 remaining Tier A skills.
2. **One line on the reader checklist:** every named command, flag, file and
   tool exists; spot-check any that drives a workflow decision. This covers the
   behavioural residue a lint cannot see — the surviving example being a claim
   that `av plan status` updates the phases table when only `update`, `check`
   and `uncheck` do.

Do **not** add a per-skill "verify every claim" pass. The lint plus that one
checklist line covers both observed escape classes at a fraction of the cost.

### Reference-file count correction

The table above says 6 reference files exceed the 800-line cap. Measured on
2026-08-23 the figure is **8**: `preview/references/html-css-patterns.md`
(1717), `preview/references/html-slide-patterns.md` (1401),
`mobile-development/references/mobile-debugging.md` (1089),
`payment-integration/references/sepay/best-practices.md` (939),
`backend-development/references/backend-debugging.md` (904),
`payment-integration/references/polar/best-practices.md` (902),
`mintlify/references/api-documentation-components-reference.md` (873),
`payment-integration/references/multi-provider-order-management-patterns.md`
(821).

### What a real section looks like

`docs/av-skill-authoring-spec.md:143-176` states the bar; `pm/SKILL.md:39-75`
and `plan-i18n/SKILL.md:87-116` are the working exemplars.

- **Output format** — a concrete contract. `pm` ships a literal markdown template
  with named sections and table columns. "Produces a report" is not a contract.
- **Quality gates** — 3-6 self-checks naming *this skill's* failure modes.
- **Workflow position** — names real `av:` skills it follows, precedes, relates
  to, **with the reason for each**.

### Filler is not automatable — plan accordingly

Phase 2's gates are floor checks, not filler detection: a reviewer demonstrated a
~30-line generator that satisfies all of them (harvest the file's own backticked
spans, name two `av:` neighbours from a rotating pool, emit a two-row table).

The actual control is **second-reader review**. Self-review under batch fatigue is
not a control. Budgeted above at 9-15 h: all 7 Tier C skills plus a random 20% of
Tier A.

**Naming the second reader, because in a one-maintainer shop it does not exist by
default.** The second reader is a **different model or agent, given fresh
context** — handed only the authoring spec (`docs/av-skill-authoring-spec.md`),
the four exemplars, and the batch under review. Never the session that wrote the
batch: a session that just authored 15 sections will rate its own work
consistent, because consistency with itself is what it optimised for. Without
this, the stated control for the plan's dominant risk does not exist.

### Extraction rules for Tiers B and C

Moving content to `references/` is accepted — `lintSkill:149` measures only
SKILL.md. Two constraints:

1. Moved content **must be linked from SKILL.md**. The orphan check matches
   against `skill.body` only (`reference-integrity.ts:36-42`), so a fragment
   linked from a sibling *reference* file is still an orphan, and at `--strict`
   (CI) that is an error.
2. New reference files inherit the 800-line cap.

Split by disclosure level: common-case workflow stays, deep detail moves.

**`cti-expert` (903) is the Tier C pilot, not the template.** ~470 lines extract
into three references, leaving ~430 — still needing one more trim to clear 300.

### Pilot result: `cti-expert` (2026-08-23)

Measured, against the prediction above.

- 903 → **246** lines in one pass, via **seven** references (59–178 lines each),
  not three leaving ~430. The prediction undercounted extractable material by
  about 2×: command tables, the 55-row activation matrix, the DOCX JSON
  contract, the install table and the directory map all belonged in Tier 2.
- Description 271 → 199 chars with every trigger term a technique file still
  backs. Exempt list 101 → 100; `validate --strict` clean at 383 held.
- **Three passes were needed, not one.** Author; second reader (fresh
  general-purpose agent on opus, ~113k tokens, 5 min); fix. The reader returned
  ACCEPT WITH FIXES, six items, **three of which decided whether the Output
  format could be followed at all**: section order contradicted the INTSUM
  template `/report` produces, one INTSUM section was dropped, and a
  pre-existing `CTI-`/`OSINT-` filename contradiction became load-bearing once
  SKILL.md pointed at the file carrying it. It found no filler in the gates.
- **Two defects escaped both author and reader** and were caught by something
  else. `validate` caught an invented `av:security-audit` in Workflow position
  — the filler failure mode this phase names, on the first skill, under care.
  Reading `scripts/cti_docx_postprocess.py` showed the generator places charts
  by *keyword in the heading text*; the author's skeleton heading "Connections"
  would have displaced the entity diagram into a trailing appendix. The reader
  judged order load-bearing; the names were. Neither lint nor a prose-only
  reader catches this. **Rule for the rest of the phase: when a skill ships a
  script that consumes its output, check the Output format against the script
  — including its fallback paths — not against the skill's prose.**
- **The fix pass introduced a defect of its own.** The first wording of that
  rule said the diagram was "lost without any error"; `_append_remaining_charts`
  further down the same file says otherwise. The advisory review caught it;
  nothing else would have. The fix that corrected it then introduced two more
  overclaims of the same class (one about visitor charts, one about confidence
  normalisation), caught only by the fix-diff re-read below. The unreviewed fix
  pass is the hole in the loop, not the author or the reader — and a claim about
  a script's runtime behaviour is only safe when it states what was traced, not
  what was inferred.

### Protocol from `fable-thinking` onward (advisory review, 2026-08-23)

1. **Consumer inventory before authoring.** `ls scripts/`; grep the kit for
   `av:<slug>` to find skills that parse this one's output; check whether CLI
   code reads its artefacts. Hand the inventory to the reader.
2. **Lint before the reader.** `validate --check --strict` on the author pass
   first, so the reader never spends budget on what lint catches.
3. **Re-read the fix diff.** A short fresh-agent pass on the fix commit's diff
   only. The pilot's overclaim entered in exactly this step.
4. The reader brief says: verify every claim about a script or template by
   reading it, including fallback paths; flag any section whose removal would
   change no behaviour.
5. Merge sequentially — `kit-embedded.generated.ts` regenerates per PR and
   conflicts across parallel branches.

**Tier A is held** until one mixed calibration batch of 15 with a **100%**
second read has been run and its defects counted by class (invented slug /
wrong consumer claim / interchangeable section / double-stated section). The
20% sample in the table above is a guess; the batch replaces it with a number.
≤1 reader-caught defect in 15 makes 20% defensible; ≥4 means sampling is not a
control and the rest of the phase is a maintainer job. Report context windows
per skill and reader tokens as the cost proxy, since wall-clock is not
recoverable.

Tier C order: `fable-thinking` → `frontend-development` → `review-pr` →
`tech-graph` → `ui-ux-pro-max` → `plan` last (the kit's most-referenced skill:
17 other SKILL.md files name `av:plan`; `pm` and `plan-i18n` are required
reading for its reader). Four of the six already have
near-synonym sections (`plan` `## Workflow Position`, `review-pr`
`## Final output`, `ui-ux-pro-max` `## Output Formats`, `tech-graph`
`## Output`): rename and merge, never add a second heading alongside.
`frontend-development` keeps depth in `resources/`, which lint never reads;
extracted material goes to `references/`, and whether `resources/` migrates is
a separate decision, recorded and not taken here.
- Cost: wall-clock is not reconstructable from git (an amend rewrote the
  timestamps). In session terms the authoring pass consumed most of one context
  window; review plus fixes took ~20 min. The 2.5–5 h Tier C band is not
  contradicted. The reader-plus-fix loop adds roughly a fifth on top and is not
  optional: without it, three contract defects ship.
- Tripwire status: the Tier A tripwire (first mixed batch of 15 over 8 h) has
  not been exercised. Next is Tier C #2.

### Interaction with the description-collision gate

`description-collision.ts` scores Jaccard similarity across descriptions at
`ERROR_THRESHOLD = 0.6`, calibrated against the **current** corpus and wired at
error level (`validate-command.ts:203-215`). Shortening 45 descriptions removes
tokens, which mechanically **raises** overlap with neighbours. Expect new
collisions mid-burn-down.

Resolve a new collision by **differentiating the description**, never by adding
an allowlist entry. An allowlist entry with a hand-waved reason quietly retires
the routing gate. Re-run the collision check after every batch.

## Related Code Files

- Modify: 101 × `kit/skills/*/SKILL.md`
- Create: new `kit/skills/*/references/*.md` for Tiers B and C
- Modify: 6 oversize reference files (split)
- Modify: `kit/skills-lint-exempt.json` (shrinks to empty)

## Implementation Steps

1. Run phase 2's review script for the current worklist.
2. **Pilot Tier C's 7 skills first**, `cti-expert` leading. Inverted from
   cheapest-first on purpose: the pilot validates phase 2's checks against the
   hardest real rewrites before they gate the other 94.
3. Tier A (84) in batches of ≤15. Each batch: sections, description, trigger
   verb in one pass; drop from the ratchet; re-run the collision check; `pnpm test`.
4. Tier B (10): sections plus trim to ≤300.
5. Split the 6 over-cap reference files.
6. Second-reader review: all of Tier C, random 20% of Tier A.
7. Ratchet reaches zero.

## Success Criteria

- [ ] `kit/skills-lint-exempt.json` is empty.
- [ ] `av validate` and `--strict` clean with zero exemptions.
- [ ] No SKILL.md >300 lines; no reference file >800.
- [ ] All 105 descriptions ≤200 chars with a trigger verb.
- [ ] No new `description-collision` allowlist entries were added during the
      burn-down. Collisions were resolved by differentiating.
- [ ] Every `## Workflow position` names ≥1 `av:<slug>`.
- [ ] Second-reader review completed for all Tier C and ≥20% of Tier A, by a
      different model/agent with fresh context — never the authoring session.
- [ ] `pnpm test` green at every merge, not only at the end.

## Risk Assessment

**Filler.** The dominant risk, permanent and semantically invisible. Phase 2's
gates do not catch it — that claim was withdrawn after a reviewer defeated all of
them. *Signal:* sections read interchangeably across skills; a Workflow position
names skills with no stated reason. *Pre-decided response:* second-reader review
is the control and it is budgeted; a batch that fails review is rejected
wholesale, not patched line by line.

**Batch fatigue.** *Signal:* per-skill time drops well below 20 minutes.
*Response:* the 20% sample exists for this.

**Collision-gate whack-a-mole.** *Signal:* the urge to add an allowlist entry.
*Response:* named as a success criterion — zero new entries.

**Assumption that may break:** ~20-35 min/skill for Tier A, which assumes reading
the whole skill to write an honest Workflow position. *Signal:* the first mixed
batch of 15 takes materially longer than 8 hours. *Response:* re-cost and tell
the maintainer the new number before continuing. Make the first batch **mixed**,
not all-easy, so the tripwire measures the real distribution.

**Interruptibility.** Weeks of background work; it must never block a release.
The ratchet makes every intermediate state shippable.
