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

**All eight were split, and a second read on 2026-08-29 confirmed the work.**
Content is conserved line-for-line in every case (each original's new length plus
its new sibling's equals the original exactly), no file was deleted or renamed,
no heading appears in two files of a split pair, and every new file is cited by
its owning SKILL.md. No reference file under `references/` exceeds 800 today.

**The cap does not reach three files that ship anyway.** `readReferenceFiles`
looks only at a directory literally named `references/`, so a skill that names
the directory differently is never linted at all:

| File | Lines |
|---|---|
| `mcp-builder/reference/node-mcp-server.md` | 918 |
| `mcp-builder/reference/mcp-best-practices.md` | 915 |
| `frontend-development/resources/complete-examples.md` | 871 |

This is a wider hole than the non-recursion already recorded in
`skill-lint.ts`: that comment anticipates `references/<subdir>/`, not a
different directory name. `install-plan.ts` copies recursively and by whatever
name, so all three reach a user's disk at their full length while the rule
reads as satisfied. Out of scope here — the phase enumerated its eight targets
by name — but the criterion "every reference file ≤800" is true only of the
directory the linter happens to look in.

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

Tier A was held until one mixed calibration batch of 15 with a **100%**
second read had been run and its defects counted by class. The 20% sample in
the table above was a guess; the batch replaced it with a number.

### Calibration result (2026-08-23) — the sample is 100%

The batch (`vibe handover issue-to-plan ariadnev xia advise deploy graphify
preview debug docs backend-development databases watzup ask`) merged as PR #48.
A fresh agent that had read none of the authoring derived the tally from the
reader transcripts alone, with per-finding provenance checked against
`git show c888d2e:<path>`:
[`reports/audit-260823-1440-tier-a-calibration-tally.md`](../reports/audit-260823-1440-tier-a-calibration-tally.md).

- **Introduced 14 / 14** (denominator 14: `issue-to-plan` excluded — no reader
  transcript targets it, which is zero measurement, not zero defects).
  Inherited 6 / 14. 79 substantive findings, 0 disputed, 0 unverified.
- **31 fix-pass regressions across 12 of 14 skills** — about 2 per skill. The
  fix pass is a defect source at nearly the rate of the authoring pass. This is
  the sharpest number in the data and it confirms the pilot's observation.
- The lowest defensible count, demoting every borderline call, is 13. The
  result is not sensitive to classification.

**Policy, applied mechanically from the thresholds set before the count:**
introduced ≥ 4 → **100% second reads for all 69 remaining Tier A skills**, plus
the 9 remaining Tier B. This is not maintainer takeover: the loop catches its
own regressions, and the number that would justify takeover is *escapes*
(defects found after a completed loop), tracked separately — **10 so far**, in
three files. Reads are batch-shaped (one reader per ≤15-skill batch diff) and
every fix diff gets a fresh re-read, no exceptions, because the fix pass is
the measured entry point for new defects and its diff is the cheapest read in
the pipeline.

### Escape record (2026-08-29)

Eight escapes found in two files, both of which had completed the loop —
`journal` in Tier A batch 4, whose fix pass was explicitly titled "correct
runtime claims", and the `journal-writer` agent in the agents wave.

| File | Claim as written | Truth |
|---|---|---|
| `kit/skills/journal/SKILL.md` | `av journal create … --summary … --stdin <<'EOF'` | neither flag exists; the body arrives via `--body` |
| `kit/skills/journal/SKILL.md` | "Optional flags: `--date`, `--project`" | neither exists; the real ones are `--component`, `--status`, `--json` |
| `kit/agents/journal-writer.md` | same `--summary` / `--stdin` invocation | as above |
| `kit/agents/journal-writer.md` | entries land in `./plans/journals/` as `YYYY-MM-DD-<slug>.md` | `<docsDir>/journal/` as `<YYMMDD-HHMM>-<slug>.md` |

All eight are one class: an invocation copied from the upstream tool and never
run. Every one is contradicted by `av journal create --help` in under a second,
which is what makes them worth counting — the reader brief already says to
verify flags against the CLI, so the brief was not followed rather than
insufficient. **The four prose claims sit outside any code fence**, where the
`av-invocation` lint deliberately never looks, so no gate could have caught
them.

The other four are worse, and the timestamps say so. The lint landed at
15:01 on 2026-08-23 (`c2b5564`); `journal-writer` had been authored at 12:57
(`b023f7e`), but Tier A batch 4 merged at 22:31 (`cae7523`) — seven hours
*after* the gate that flags this exact line was live. The warning was printing
throughout the review and the batch merged over it. A warning nobody is
required to clear is a warning nobody reads, which is the same defect as the
filler this phase was built to catch, one level up.

Escapes are now 10 across three files. The threshold that would justify
maintainer takeover was never given a number, so this does not trip one; it
does say the cheapest possible check is the one being skipped.

**Two taxonomy gaps the tally exposed, closed from the next batch on:**
- Readers are told to hunt for gates that restate text elsewhere, but the
  frozen classes had no slot for them, so they vanished into nits. They are
  now reported under a separate `redundant` class — listed, not counted in the
  substantive total.
- A reader could mark a `fabricated` finding "optional" because the fix was
  large, which demoted ~18 non-existent skill names in `ariadnev` to a nit.
  A `fabricated` finding is substantive regardless of fix size.

**Unmeasured tail, being read now rather than assumed clean:** `issue-to-plan`
(never read) and the batch's final fix pass (`88799ba`, `cc51476`, 13 files
across seven skills, never re-read). Its finding count is the first test of
whether the protocol's own last step is safe.

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
6. Second-reader review: every skill in every tier (was "random 20% of Tier A"
   until the calibration batch measured 14/14 introduced). One reader per
   batch diff; a fresh re-read of every fix diff.
7. Ratchet reaches zero.

### Second-read coverage (2026-08-29)

| Unit | Evidence | Covered |
|---|---|---|
| Tier C pilot (`cti-expert`, `fable-thinking` onward) | narrative above, three passes recorded | yes |
| Calibration batch (15 skills) | `reports/audit-260823-1440-tier-a-calibration-tally.md` | yes |
| Tier A batches 3-7 | paired `correct Tier A batch N runtime claims` commit per batch | yes |
| Tier B batch 1 | `reports/audit-260823-2017…` + `…-2022-fix-diff-reread.md` | yes |
| Tier B batch 2 | `reports/audit-260829-1505-tier-b-batch-2-second-read.md` | yes |
| Reference-file splits (8) | `reports/audit-260829-1500-reference-split-second-read.md` | yes |
| Tier A batch 2 (`fa03799`, 12 skills) | `reports/audit-260829-1600-tier-a-batch-2-and-agent-wave-second-read.md` | yes |
| Agent waves (16 agents) | same report | yes |

Every unit is now read. The two that were last to be covered were the right
ones to suspect: both of the escapes found earlier on 2026-08-29 came from
them, and reading them produced **14 more defects, none of which any gate could
catch**.

The agent wave also surfaced a class the brief did not predict and no rule
models: **frontmatter granting less than the body instructs.** Four agents were
told to write reports or delegate with no `Write`/`Task` grant — `code-reviewer`
worst, since "scout-based edge case detection" is the differentiator in its own
description and it had no capability to do it. Capabilities were granted per
maintainer decision.

**Escapes now 24 across 12 files** (2 `cti-expert`, 8 in the two journal files,
2 in Tier A batch 2, 12 across eight agents, `journal-writer` appearing in both
of the last two). A further four sit outside the units, in the
`.prefs.journal.auto` check that four skills present as a working gate against
an envelope key that is not there.

The count keeps rising because reading keeps finding, not because quality is
falling — which is the argument for the reader, not against it. The threshold
that would justify maintainer takeover was never given a number and this does
not set one; what the number does say is that every unit read so far has
returned defects, and none of them was reachable by a gate.

Both second reads run on 2026-08-29 found real defects, and **the two batches
failed in opposite directions**: the reference splits were clean and only the
*plan's* description of them was wrong, while Tier B batch 2 had zero
fabricated claims and four load-bearing deletions. A reader brief written for
one of those misses the other, which is the argument for keeping the brief's
two halves — verify every claim, and flag what a trim removed — rather than
collapsing it to whichever half last caught something.

## Success Criteria

- [x] `kit/skills-lint-exempt.json` is deleted.
- [x] `av validate` and `--strict` clean with zero exemptions (final local
      verification, 2026-08-24).
- [x] No SKILL.md >300 lines; no reference file >800 (enforced by
      `skill-lint.test.ts` and final strict validation).
- [x] All 105 descriptions ≤200 chars with a trigger verb (final strict
      validation).
- [x] No new `description-collision` allowlist entries were added during the
      burn-down. Collisions were resolved by differentiating (final strict validation).
- [x] Every `## Workflow position` names ≥1 `av:<slug>` (final strict
      validation).
- [x] Second-reader review completed for every skill in every tier, by a
      different model/agent with fresh context — never the authoring session —
      and every fix diff re-read the same way. (Raised from "≥20% of Tier A"
      by the calibration result.) Closed 2026-08-29; coverage table above.
- [ ] `pnpm test` green at every merge, not only at the end.

## Risk Assessment

**Filler.** The dominant risk, permanent and semantically invisible. Phase 2's
gates do not catch it — that claim was withdrawn after a reviewer defeated all of
them. *Signal:* sections read interchangeably across skills; a Workflow position
names skills with no stated reason. *Pre-decided response:* second-reader review
is the control and it is budgeted; a batch that fails review is rejected
wholesale, not patched line by line.

**Batch fatigue.** *Signal:* per-skill time drops well below 20 minutes.
*Response:* every skill is second-read, so fatigue shows up as a rising
finding count per batch rather than as shipped defects; a batch whose count
rises is re-authored, not patched.

**Collision-gate whack-a-mole.** *Signal:* the urge to add an allowlist entry.
*Response:* named as a success criterion — zero new entries.

**Assumption that may break:** ~20-35 min/skill for Tier A, which assumes reading
the whole skill to write an honest Workflow position. *Signal:* the first mixed
batch of 15 takes materially longer than 8 hours. *Response:* re-cost and tell
the maintainer the new number before continuing. Make the first batch **mixed**,
not all-easy, so the tripwire measures the real distribution.

**Interruptibility.** Weeks of background work; it must never block a release.
The ratchet makes every intermediate state shippable.
