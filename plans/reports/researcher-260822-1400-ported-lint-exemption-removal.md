# Removing the `isPorted()` lint exemption — research

Scope: HOW to remove the ported-skill severity downgrade in
`packages/cli/src/kit/skill-lint.ts`, not whether. Read-only; no source edited.

## Q1 — Exact enforcement today, and what changes

`isPorted()` (skill-lint.ts:29-32) reads `frontmatter.metadata.origin === "ported"`.
Two call sites only (verified via repo-wide grep, no others exist):

- `skill-lint.ts:129` — `lintSkill()` internal `ported` flag.
- `validate-command.ts:7,166` — `isPorted(skill) && !opts.strict ? "warn" : "error"`
  for the reference-**orphan** check (a `references/*.md` file nobody links from
  SKILL.md). This is a **second, independent** exemption gate outside
  `skill-lint.ts` that the plan must also flip.

Inside `lintSkill`, five checks branch on `ported` (skill-lint.ts line refs):

| Check | Ported today | Authored today | Line |
|---|---|---|---|
| unknown frontmatter field | error (always) | error | 123-127 |
| description < 20 chars | error (always) | error | 136-137 |
| description > 200 chars | **warning** | error | 138-141 |
| description missing trigger verb | **warning** | error | 142-145 |
| SKILL.md > `maxLines` (default 300, ceiling 400) | **warning** | error | 150-153 |
| 3 required `## ` sections present | **skipped entirely** (`if (!ported)` at 157) | error | 157-163 |
| each `references/*.md` > 300 lines | **warning** | error | 164-172 |
| reference orphan (validate-command.ts) | **warning** unless `--strict` | error | validate-command.ts:166 |

`REFERENCE_MAX_LINES` (300, skill-lint.ts:35) applies to reference files too —
confirmed at skill-lint.ts:164-172, same ternary. No `maxLines`-style override
exists for reference files (only SKILL.md has `resolveMaxLines`,
skill-lint.ts:98-112) — an oversize reference file has no escape hatch but
splitting it.

**Removing/neutralizing `isPorted()`** (return `false` always, or delete the
branches so everything goes to `errors`) makes all 8 rows above unconditional
errors for the 101 ported skills. Net new errors thrown by `loadKit()`,
measured against current repo state (script cross-checked against the exact
`countLines`/heading regex `lintSkill` uses):

- 101 skills newly fail "missing required section" (99 missing all 3, 2 missing 2 — `goal-warmup`, `brainstorm` already have `## Workflow position`).
- 17 skills newly fail SKILL.md size (7 of those also exceed the 400 ceiling, so `maxLines` override cannot save them: `cti-expert` 903, `ui-ux-pro-max` 668, `plan` 629, `tech-graph` 447, `review-pr` 441, `frontend-development` 409, `fable-thinking` 401 — line counts are `raw.split("\n").length` on the literal file, matching `countLines()` exactly; task brief's "902/667/628/446/440/408" numbers are `wc -l`, one less, non-authoritative here).
- 45 skills newly fail description length (>200 chars); 19 newly fail missing-trigger-verb; 11 overlap both. Full list in scratchpad, not reproduced here (secondary to the section/size work, same mechanical fix: rewrite the `description:` line).
- 83 reference files across 19 skills newly fail per-file size (denominator: 500 reference files total in the kit today, down from ADR 0008's pre-port 740/136 — some content was dropped/consolidated during porting).

**Dead-code finding, not in the task brief:** `kit.warnings` (populated by
`lintSkill`'s warnings array, load-kit.ts:78) is **never read by any CLI
command** — grepped every `.warnings` / `loadKit(` call site
(install-command.ts, add-skill-command.ts, validate-command.ts,
doctor-command.ts, run-command.ts, behavioral-eval-command.ts,
list-command.ts, eval-command.ts); none display it. `renderSummary`
(validate-command.ts:98-110) only renders its own `findings` array
(reference-integrity/graph/collision/matrix), never `kit.warnings`. So
today's "silent" is stronger than stated: not downgraded-and-shown, but
write-only, reaching no output ever. Flipping the flag needs no
warnings-display wiring — the whole effect is warnings becoming errors that
throw `KitValidationError` and abort `loadKit()`.

## Q2 — Full failing inventory

Computed by replicating `lintSkill`'s exact algorithm (same `countLines`,
same `^##\s+(.+?)\s*$` heading regex, same required-section list) against
every `kit/skills/*/SKILL.md`, independently cross-checked against
`skill-lint.ts` source line-by-line. 105 skills, 101 ported, 4 authored
(`av`, `pm`, `plan-i18n`, `obsidian-second-brain-note` — all pass every
check, sanity-verified at 0 violations each).

Work tiers (ported skills only; authored 4 already clear):

| Tier | Definition | Count | Total added-error surface per skill |
|---|---|---|---|
| A — sections only | ≤300 lines, only missing headings | **84** | 3 sections to author (43 of these also need a description rewrite) |
| B — sections + minor trim | 300–400 lines | **10** | 3 sections + trim ~30-100 lines to ≤300 (4 also need description rewrite) |
| C — sections + major restructure | >400 lines | **7** | 3 sections + extract >100-600 lines to `references/` (6 also need description rewrite) |
| **Total ported needing work** | | **101** | |

Tier B: `agentize`(302) `cook`(311) `markdown-novel-viewer`(321) `shopify`(329)
`ui-styling`(330) `web-frameworks`(334) `mcp-builder`(338) `orchestrate`(348)
`fix`(351) `design`(368).

Tier C: `fable-thinking`(401) `frontend-development`(409) `review-pr`(441)
`tech-graph`(447) `plan`(629) `ui-ux-pro-max`(668) `cti-expert`(903).

### Appendix — all 105 skills (lines = `split("\n").length` on raw file; Tier "—" = authored, already compliant)

| Skill | Origin | Lines | Tier | Missing sections | Oversize refs |
|---|---|---|---|---|---|
| advise | ported | 191 | A | 3/3 | — |
| agent-browser | ported | 109 | A | 3/3 | — |
| agentize | ported | 302 | B | 3/3 | — |
| ai-artist | ported | 134 | A | 3/3 | — |
| ai-multimodal | ported | 236 | A | 3/3 | — |
| ariadnev | ported | 204 | A | 3/3 | — |
| ask | ported | 56 | A | 3/3 | — |
| autoresearch | ported | 63 | A | 3/3 | — |
| av | authored | 155 | — | — | — |
| backend-development | ported | 104 | A | 3/3 | 9 |
| better-auth | ported | 222 | A | 3/3 | 4 |
| bootstrap | ported | 148 | A | 3/3 | — |
| brainstorm | ported | 199 | A | 2/3 | — |
| chrome-profile | ported | 228 | A | 3/3 | — |
| code-review | ported | 204 | A | 3/3 | — |
| codex-goal | ported | 78 | A | 3/3 | — |
| coding-level | ported | 80 | A | 3/3 | — |
| common | ported | 14 | A | 3/3 | — |
| context-engineering | ported | 116 | A | 3/3 | — |
| cook | ported | 311 | B | 3/3 | — |
| copywriting | ported | 98 | A | 3/3 | — |
| cti-expert | ported | 903 | C | 3/3 | — |
| databases | ported | 93 | A | 3/3 | 8 |
| debug | ported | 138 | A | 3/3 | — |
| deep-swe | ported | 84 | A | 3/3 | — |
| deploy | ported | 163 | A | 3/3 | — |
| design | ported | 368 | B | 3/3 | 1 |
| devops | ported | 100 | A | 3/3 | 5 |
| docs | ported | 111 | A | 3/3 | — |
| docs-seeker | ported | 106 | A | 3/3 | — |
| document-skills | ported | 13 | A | 3/3 | — |
| excalidraw | ported | 212 | A | 3/3 | — |
| fable-thinking | ported | 401 | C | 3/3 | — |
| find-skills | ported | 149 | A | 3/3 | — |
| fix | ported | 351 | B | 3/3 | — |
| folder-context | ported | 57 | A | 3/3 | — |
| frontend-design | ported | 280 | A | 3/3 | 2 |
| frontend-development | ported | 409 | C | 3/3 | — |
| git | ported | 135 | A | 3/3 | — |
| github | ported | 163 | A | 3/3 | — |
| gkg | ported | 100 | A | 3/3 | — |
| goal-warmup | ported | 218 | A | 2/3 | — |
| google-adk-python | ported | 141 | A | 3/3 | — |
| graphify | ported | 162 | A | 3/3 | — |
| handoff | ported | 260 | A | 3/3 | — |
| handover | ported | 276 | A | 3/3 | — |
| help | ported | 24 | A | 3/3 | — |
| html-video | ported | 187 | A | 3/3 | — |
| hyperframes | ported | 131 | A | 3/3 | — |
| interview-docs | ported | 60 | A | 3/3 | — |
| issue-to-plan | ported | 251 | A | 3/3 | — |
| journal | ported | 148 | A | 3/3 | — |
| llms | ported | 126 | A | 3/3 | — |
| loop | ported | 195 | A | 3/3 | — |
| markdown-novel-viewer | ported | 321 | B | 3/3 | — |
| mcp-builder | ported | 338 | B | 3/3 | — |
| media-processing | ported | 102 | A | 3/3 | 6 |
| mermaidjs-v11 | ported | 127 | A | 3/3 | 3 |
| mintlify | ported | 129 | A | 3/3 | 6 |
| mobile-development | ported | 221 | A | 3/3 | 6 |
| obsidian-second-brain-note | authored | 136 | — | — | — |
| orchestrate | ported | 348 | B | 3/3 | — |
| payment-integration | ported | 83 | A | 3/3 | 1 |
| plan | ported | 629 | C | 3/3 | — |
| plan-i18n | authored | 117 | — | — | — |
| plans-kanban | ported | 112 | A | 3/3 | — |
| pm | authored | 76 | — | — | — |
| predict | ported | 152 | A | 3/3 | — |
| preview | ported | 158 | A | 3/3 | 4 |
| problem-solving | ported | 105 | A | 3/3 | — |
| project-management | ported | 139 | A | 3/3 | — |
| project-organization | ported | 234 | A | 3/3 | 1 |
| react-best-practices | ported | 131 | A | 3/3 | — |
| remotion | ported | 60 | A | 3/3 | — |
| repomix | ported | 259 | A | 3/3 | — |
| research | ported | 179 | A | 3/3 | — |
| research-prompt | ported | 59 | A | 3/3 | — |
| retro | ported | 146 | A | 3/3 | — |
| review-pr | ported | 441 | C | 3/3 | — |
| scenario | ported | 231 | A | 3/3 | — |
| scout | ported | 122 | A | 3/3 | — |
| security | ported | 198 | A | 3/3 | — |
| security-scan | ported | 147 | A | 3/3 | — |
| sequential-thinking | ported | 105 | A | 3/3 | — |
| shader | ported | 121 | A | 3/3 | — |
| ship | ported | 178 | A | 3/3 | 1 |
| shopify | ported | 329 | B | 3/3 | 3 |
| show-off | ported | 235 | A | 3/3 | — |
| skill-creator | ported | 144 | A | 3/3 | — |
| stitch | ported | 195 | A | 3/3 | — |
| tanstack | ported | 150 | A | 3/3 | — |
| team | ported | 228 | A | 3/3 | — |
| tech-graph | ported | 447 | C | 3/3 | 1 |
| test | ported | 127 | A | 3/3 | — |
| threejs | ported | 153 | A | 3/3 | 7 |
| ui-styling | ported | 330 | B | 3/3 | 7 |
| ui-ux-pro-max | ported | 668 | C | 3/3 | — |
| use-mcp | ported | 78 | A | 3/3 | — |
| vibe | ported | 291 | A | 3/3 | — |
| watzup | ported | 82 | A | 3/3 | — |
| web-design-guidelines | ported | 45 | A | 3/3 | — |
| web-frameworks | ported | 334 | B | 3/3 | 8 |
| web-testing | ported | 108 | A | 3/3 | — |
| worktree | ported | 143 | A | 3/3 | — |
| xia | ported | 199 | A | 3/3 | — |

## Q3 — What the sections must contain, and how to spot filler

`docs/av-skill-authoring-spec.md`'s "Cook-grade skill standard" (lines
143-176) already states the bar in prose:

- `## Output format`: "a concrete, verifiable contract... 'Produces a report'
  is not a contract; the exact shape is" (spec:158-160).
- `## Quality gates`: "3-6 self-checks the agent runs before returning" (spec:161-164).
- `## Workflow position`: "Name the skills this one typically follows,
  precedes, and relates to" (spec:174-175).

Real examples (both pass lint today, both are authored, not ported):

`pm` (kit/skills/pm/SKILL.md:39-75) — Output format is a literal markdown
template with named sections (`## Snapshot`, table columns `Phase|Status|
Evidence`) the agent fills in verbatim; Quality gates is 4 checkboxes each
naming a concrete, skill-specific failure mode ("Every status change is
backed by named evidence"); Workflow position names 3 real `av:` skills in
"Typically follows/precedes/Related" with the *reason* for each relation, not
just the name.

`plan-i18n` (kit/skills/plan-i18n/SKILL.md:87-116) — same shape, Output
format is a bullet list of what must be reported (path, confirmation,
untranslated-string list) rather than prose; Quality gates has 5 checkboxes
that are all specific to *this* skill's failure modes (localStorage
persistence, modal re-render) — none are generic ("be thorough").

**Filler risk is real and already present in-repo as a fixture**:
`kit-fixtures.test.ts:11-23` ships a `REQUIRED_SKILL_SECTIONS` test fixture
that is exactly the boilerplate the task brief warns about —
`## Output format\n\nOutput.\n\n## Quality gates\n\n- Check.\n\n## Workflow
position\n\nRelated: none.` This satisfies the regex-based lint with zero
information content. It's a test fixture (fine there), but it is a literal
existence proof that the heading-presence check cannot detect this failure
mode — a human/reviewer step is required.

**Objective, partially-mechanizable criteria** (necessary-not-sufficient
filters a script can flag for human review, since the lint gate itself only
checks heading presence):

1. Output format: flag if the section has no fenced code block AND no
   markdown table AND no bullet list with ≥3 items — i.e. it's bare prose.
   ("Produces a report" fails all three.)
2. Quality gates: flag if the section has fewer than 3 lines matching
   `^- \[ \]` or `^- ` (spec wants 3-6) — a 1-line gate is very likely filler.
3. Workflow position: flag if the section contains **zero** `av:<slug>`
   mentions — this is fully mechanical (the same regex `skill-crossrefs.ts`
   already uses, `SKILL_REFERENCE` at skill-crossrefs.ts:11) and directly
   catches "Related: none"-style filler, since a real workflow-position claim
   almost always names at least one other skill.
4. Cross-check heading text is **exact case**: `levelTwoHeadings()`
   (skill-lint.ts:90-96) does not lowercase — `## Output Format` (capital F)
   silently fails to satisfy the requirement and throws a normal "missing
   section" error, which is at least loud, not a silent-filler risk, but
   worth a lint-message hint since 101 authors will hit it once.

None of 1-3 belong in the lint gate itself (heuristics with false
positives/negatives; spec:149-150 says "workflow depth and proof/risk
quality remain authoring contracts reviewers check by reading"). Recommend a
throwaway review script reporting 1-3 as a checklist for the human pass,
plus manual spot-review weighted to Tier C (highest filler temptation given
size pressure) and a random 15-20% sample of Tier A.

## Q4 — Sequencing

Critical fact not in the task brief: **flipping `isPorted()` without content
fixes does not produce "101 failing tests" — it crashes `pnpm test` before
most tests run.** `loadKit()` throws `KitValidationError` synchronously on
the first `lint.errors.length > 0` (load-kit.ts:75-77). `kit-fixtures.test.ts:40`
and `install.test.ts:12` call `loadKit()` against the real `kit/` at
**module top-level**, before any `describe`/`it` runs. Others resolve it
inside `it()` bodies, still against the real tree: `cli-commands.test.ts:14`,
`workflow-registry.test.ts:19`, `add-skill.test.ts` (copies `kit/` to a
sandbox then runs installer commands that call `loadKit`),
`validate-command-policies.test.ts:99+`. A bare removal aborts the two
module-scope files during collection — a suite-level failure, not a clean
101-test diff, and no other `it` in `kit-fixtures.test.ts` (366 lines) runs.

This makes (a) unworkable even transiently — a red main can't merge, and
there's no partial-progress CI signal because the crash is a wall, not a
scoreboard.

**Options, evaluated:**

| | (a) Big-bang: fix all 101, then flip | (b) Ratchet allowlist, shrinks per skill fixed | (c) Severity staged per-check |
|---|---|---|---|
| CI stays green mid-work | No — not mergeable until 100% done | Yes — allowlisted names still get old (ported) severity | Yes, but only if you can land one check-flip at a time without touching the others |
| Progress visible | Only at the end (all-or-nothing PR) | Per-commit: allowlist count drops, diffable | Per-check: e.g. "sections required" flips before "size" flips |
| Rollback | Revert one giant commit/PR | Revert one skill's removal from the allowlist | Revert one check's flip |
| Engineering cost | None beyond content work | One new file + one `isPorted`-equivalent check + one shrink-only test | Restructure `lintSkill`'s five `ported ?` ternaries into independently toggleable checks — more surface change to the linter itself for no added safety over (b) |
| Precedent in this repo | none | **Yes** — `kit/skills-pending-port.json` + `pendingPortNames()` (validate-command.ts:20-32) is exactly this pattern already, with a test that fails if a name lingers after it no longer needs the exemption (`validate-command.test.ts:244-256`, "never lists a skill that has already been ported") | none |

**Recommendation: (b), modeled directly on `skills-pending-port.json`.** Add
`kit/skills-lint-exempt.json` listing skill names still under the old
severity; `isPorted()` becomes `isExempt(artifact)` reading this list instead
of (or alongside, during transition) `metadata.origin`. Reuse the shrink-only
test pattern: fail if a listed name already satisfies all checks (mirrors
`validate-command.test.ts:244-256`). Each skill's fix is a normal same-day
PR: rewrite `SKILL.md`, drop it from the list, `pnpm test` stays green
throughout — 101 small PRs instead of one. (c) adds linter refactor risk for
no benefit (b) doesn't give; (a) cannot merge incrementally at all given the
crash-not-scoreboard behavior above. Reject both.

Sequencing within (b): do Tier A first (84 skills, mechanical, builds the
"real vs filler" review muscle cheaply), then Tier B (10, trim + sections),
then Tier C last (7, hardest, benefits from having reviewed 94 real examples
first for what a non-filler section looks like). Fix descriptions
(trigger-verb/length) opportunistically in the same PR as the skill's
section work — same file, same review pass, no reason to split.

## Q5 — Oversize strategy

Spec (av-skill-authoring-spec.md:101-122) is explicit: "If SKILL.md wants to
exceed 300 lines, move a section to `references/` instead of raising
`maxLines`." The 4 authored exemplars are well under 300 lines and don't
demonstrate this, but several **ported** skills already use `references/`
heavily (`web-frameworks` 8 files, `databases` 8, `backend-development` 9),
proving the mechanism works, just with oversize reference files of their own
(the 83-files-over-300 number in Q1/Q2).

**Yes, moving content to `references/` is accepted** — `lintSkill` only
measures `SKILL.md`'s own line count (skill-lint.ts:149).

**Yes, moved content must be linked**, or the reference-integrity orphan
check fires: `checkReferenceIntegrity()` (reference-integrity.ts:30-45) flags
any `references/` file on disk whose filename never appears in `skill.body`
(matched by `REFERENCE_MENTION`, reference-integrity.ts:19), called from
`validate-command.ts:152` — a separate gate from `skill-lint.ts`, with its
own ported-exemption at `validate-command.ts:166` (Q1) that must also be
flipped or new unlinked references slip through as warnings only.

A **new** reference file also inherits `REFERENCE_MAX_LINES` (300, no
override) — so a 900-line SKILL.md cannot become one 700-line reference
file; it must split into several ≤300-line files by topic.

**Worked example — `cti-expert` (903 lines, no `references/` dir today,
only sibling dirs `guides/ handbook/ techniques/ workflows/` etc. that are
outside the linter's scope because they aren't named `references/`)**.
Heading map (grep `^#`, kit/skills/cti-expert/SKILL.md):

| Section | Approx lines | Move? |
|---|---|---|
| 1 Quick Start, 2 AEAD Lifecycle, 3 Command Reference | 25-177 (~150) | Keep — common-case workflow, tier 1 |
| 4 Subject & Connection Model | 177-268 (~90) | Keep or trim to a table; frequently-referenced |
| 5 Finding Framework, 6 Technique Catalog | 268-334 (~65) | → `references/technique-catalog.md` |
| 7 Workflow Guides | 334-349 | Keep (short, router-like) |
| 8 Output Formats (mandatory export, report/visual/connector formats) | 349-520 (~170) | → `references/output-formats.md` — clearly "format spec", spec's own Tier-2 example category |
| 9 Skill Tiers & Customization, 10 Ethics, 11 Autonomous Mode | 520-601 (~80) | Keep (short; governs common-case behavior) |
| 12 Architecture Reference | 601-737 (~135) | → `references/architecture.md` |
| Technique Activation Matrix, Exposure Score Bands, Tool Priority/Fallback/Auto-Install | 737-903 (~165) | → `references/tool-and-technique-reference.md` |

Net: ~470 lines extracted into 3 new reference files (each individually
≤300 lines, so re-split `output-formats.md` if it lands near 300), leaving
SKILL.md at roughly 430 lines — still needs the 3 required sections added on
top and probably one more trim pass (e.g. also extract "Subject & Connection
Model" detail tables) to clear 300 outright rather than lean on `maxLines:
400`. This is the single hardest skill in the corpus; treat it as the
Tier C pilot, not the template — its four siblings (`plan` 629,
`ui-ux-pro-max` 668, `review-pr` 441, `tech-graph` 447) are comparably dense
but smaller.

## Q6 — Effort estimate

Assumptions: one person, familiar with spec after first few skills; "real,
not filler" per Q3's bar; `pnpm test` after each skill. Per-skill time is
dominated by reading the whole skill to write an honest Workflow-position —
Output-format/Quality-gates can often be lifted from existing content.

| Tier | Count | Per-skill | Subtotal |
|---|---|---|---|
| A — sections only (43 also need desc rewrite, +5-10 min) | 84 | 20-35 min | 28-49 hr |
| B — sections + trim to ≤300 | 10 | 45-75 min | 7.5-12.5 hr |
| C — sections + `references/` extraction | 7 | 2.5-5 hr | 17.5-35 hr |
| Ratchet scaffolding (allowlist, shrink-only test, 2 call sites) | 1 | 2-3 hr | 2-3 hr |
| New ADR (supersedes part of 0008) | 1 | 1-2 hr | 1-2 hr |
| Review pass (Q3 script + spot-check, weighted to C + 15-20% of A) | — | — | 6-10 hr |
| **Total** | | | **62-112 hr** (≈8-14 working days solo) |

Not lowballed: Tier A still needs 84 individually-read, individually-written
Workflow-position paragraphs — a copy-pasted relation graph is exactly the
filler Q3 flags. Tier C's 7 skills are genuinely large editing jobs. Tier A
parallelizes well (independent files) if calendar time beats headcount.

## Q7 — Interaction with other in-flight work

**`av-`-prefixed skill dirs (installer):** searched the full source tree,
git branches (`git branch -a`), and stash — **no such change exists
anywhere in this checkout.** The `av-` prefix that does exist is for
**agents** (`av-<slug>.md`, agent-lint.ts:27, spec:182-193) and the
`av-statusline.cjs` hook file (install-plan.ts:138-144) — not skill
directories; `grep -rn "av-" packages/cli/src/install` found only the
statusline hook. Cannot confirm/deny an out-of-band or uncommitted change;
flag to the user before Tier C — if real, it most likely touches
`src/adapt/paths.ts` (CLAUDE.md's documented single source of truth for
paths) and `install-plan.ts`, neither touched by this plan, so risk is
probably low but unverified.

**Cross-skill link checking in `reference-integrity.ts`:** today this file
only resolves same-skill `references/<name>.md` mentions (its own comment,
reference-integrity.ts:14-18, explicitly says a foreign path like
`../cook/references/x.md` is ignored by design). Cross-*skill* name
resolution (`av:<slug>`) already exists, but in a **different file**,
`skill-crossrefs.ts` (`findUnresolvedSkillReferences`, wired at
validate-command.ts:170-186) — so "adding cross-skill link checking to
reference-integrity.ts" is not-yet-built, consistent with the task brief.
**Real overlap risk**: Q5's restructuring (Tier C, and trimming Tier B) will
create/link many new `references/*.md` files, directly exercising
`reference-integrity.ts`'s dangling/orphan matcher and its
`validate-command.ts:166` severity ternary (same one Q1/Q4 need flipped). If
someone edits that regex or adds a cross-skill mode concurrently, the two
efforts collide on the same ~45-line file. **Order:** land the
`isPorted`→ratchet flip and the orphan-severity flip *before* Tier C, so its
new reference files are authored against stable, final severity rules.

## Recommended sequence

1. New ADR (0013) superseding ADR 0008's severity split, recording the
   ratchet mechanism (small, ~1-2 hr).
2. Ratchet scaffolding: `kit/skills-lint-exempt.json` seeded with all 101
   ported names; `isPorted()` → `isExempt()` reading the list;
   `validate-command.ts:166` reads the same list; shrink-only test modeled on
   `validate-command.test.ts:244-256`. `pnpm test` green immediately (no
   behavior change yet, just mechanism).
3. Confirm/rule out the `av-`-prefix installer overlap with the user (Q7)
   before Tier C, since Tier C is the longest-running work and most likely
   to overlap a parallel session.
4. Tier A (84 skills) — sections + description fixes, remove from allowlist
   per-skill or in small batches. Cheapest, builds review calibration.
5. Tier B (10 skills) — sections + trim.
6. Tier C (7 skills) — sections + `references/` extraction, `cti-expert`
   first as the pilot (Q5's worked example), reviewed most heavily (Q3).
7. Final: allowlist empty, delete it and `isExempt()`/`isPorted()` entirely,
   `node packages/cli/dist/index.js validate` and `pnpm test` both green
   with zero exemptions, run `validate --check` too (README matrix gate).

## Open questions

- Does the `av-`-prefixed installer skill-dir change exist anywhere (another
  branch/machine, unmerged)? Not found in this checkout, any branch, or
  stash — confirm with whoever owns it.
- Strip `metadata.origin: ported` once a skill clears the bar (ADR 0008's own
  revisiting clause)? Not required for `validate` (field stays inert), but a
  policy call for the new ADR.
- One ratchet file for both skill-lint.ts and validate-command.ts checks, or
  two? Recommend one (fewer moving parts); no strong reason either is unsafe.
- Q3's filler heuristics are proposed, not validated against real rewrites —
  pilot on Tier C's 7 before trusting as a gate for the other 94.

Status: DONE
Summary: Mapped every skill-lint.ts/validate-command.ts branch that changes when isPorted() is removed (2 call sites, 8 checks), built the full 105-skill tier inventory (84/10/7 + 4 authored), found kit.warnings is dead code (never displayed anywhere), found the big-bang flip crashes pnpm test at module load rather than producing 101 clean failures, and found a directly-reusable ratchet precedent already in the repo (skills-pending-port.json). No evidence found anywhere in the repo/branches/stash for the av--prefix installer change the brief asked about overlap with.
Concerns/Blockers: The av--prefix installer overlap (Q7) is unverifiable from this checkout — flag to the user before Tier C work starts. Filler-detection criteria (Q3) are proposed heuristics, not validated.
