# Phase 2 batch D — 9 small skills, 24 orphan files

Plan: `plans/260816-1845-ariadnev-evidence-backed-parity-with-agentkit/phase-02-reference-debt-and-enforcement.md`

## Decisions

| Skill | File | Decision | Purpose / rationale |
|---|---|---|---|
| preview | references/html-css-patterns.md | Link | Body already named it (bare filename) at the theme-toggle instruction and the HTML reference-loading table for `--explain/--diagram/--slides/--diff/--plan-review/--recap`; fixed to the required `references/` path form so the existing mention is a real link. |
| preview | references/html-design-guidelines.md | Link | Same fix, at "All HTML modes" row and the Style Strategy note — mandatory pre-generation read for every HTML mode. |
| preview | references/html-libraries.md | Link | Same fix, at the HTML reference-loading table (CDN library choices per mode). |
| preview | references/html-responsive-nav.md | Link | Same fix, at the "multi-section pages also read" sentence. |
| preview | references/html-slide-patterns.md | Link | Same fix, at the `--slides` row of the reference-loading table. |
| mobile-development | references/mobile-android.md | Link | Fixed path prefix at the existing "Reference Navigation" bullet list entry (Kotlin/Compose/Play Store). |
| mobile-development | references/mobile-best-practices.md | Link | Same fix — mobile-first design, perf, offline-first, security, testing bullet. |
| mobile-development | references/mobile-debugging.md | Link | Same fix — debugging tools/profiling/crash-analysis bullet. |
| mobile-development | references/mobile-ios.md | Link | Same fix — Swift/SwiftUI/HIG/App Store bullet. |
| web-testing | references/interactive-testing-patterns.md | Index | Added to "### Core Testing" in the `## Reference Documentation` list — forms, keyboard nav, drag & drop, modal, scroll/wait patterns; optional depth beyond the quick-start commands. |
| web-testing | references/shadow-dom-testing.md | Index | Added to "### Core Testing" — shadow-DOM piercing selectors across Playwright/Cypress/Selenium; optional depth for web-component testing. |
| web-testing | references/vulnerability-payloads.md | Index | Added to "### Accessibility & Security" — SQLi/XSS/NoSQLi/command-injection/SSRF/path-traversal payload lists; supports the existing security-testing references. |
| threejs | references/07-math.md | Link | Added to "Level 1: Fundamentals" in the Progressive Reference Files section, mirroring the exact `references/NN-name.md` bullet mechanism used by all other 17 numbered files. Math (Vector3/Quaternion/Matrix4) is foundational, alongside 00/01. |
| threejs | references/11-materials-advanced.md | Link | Added to "Level 2: Common Tasks" directly after `11-materials.md` (same number) — advanced PBR/custom-shader-material content continuing the base materials entry. |
| threejs | references/15-specialized-loaders.md | Link | Added to "Level 5: Specialized" alongside 14-physics-vr/16-webgpu — SVG/font loaders are niche/domain-specific, matching the "Specialized" tier. |
| loop | references/guard-and-noise.md | Link | Added a pointer sentence after the Optional config-fields table (Guard/Noise/Min-Delta rows) — the file is the deeper spec for exactly those three fields (recovery flow, guard-command heuristics, noise-level strategies). |
| loop | references/metric-library.md | Link | Added a pointer sentence after the Required config-fields table (Verify row) — the file is a copy-paste library of `Verify` commands by domain, directly extending that field's description. |
| loop | references/results-logging.md | **Delete** | Claimed a TSV schema `iteration, commit, metric, delta, status, description` with a 7-value `status` enum (`baseline/keep/keep (reworked)/discard/guard-failed/crash/no-op`). This **contradicts** the schema already canonical in two places: SKILL.md's own "Results Logging" section (`iter, timestamp, metric, delta, kept, description`, `kept` = yes/no) and `references/autonomous-loop-protocol.md` Phase 7 (`{iter}\t{timestamp}\t{metric}\t{delta}\t{kept:yes/no}\t{description}`), which SKILL.md links twice as the authoritative full schema. Two different loggable schemas for the same `loop-results.tsv` file is a correctness hazard, not an optional alternative — reconciling them would mean redesigning the loop's core logging contract, which is out of this batch's scope. Deleted; canonical schema remains in SKILL.md + `autonomous-loop-protocol.md` Phase 7 (both already linked, unaffected). File remains in git history. |
| sequential-thinking | references/reasoning-patterns.md | Index | Added to the existing `## References` list (dynamic adjustment, revision/branch/hypothesis-loop patterns, uncertainty management, anti-patterns) — same list format as the other 6 entries already there. |
| sequential-thinking | references/worked-examples.md | Index | Added to the same `## References` list — compact worked examples (auth API, React state, slow endpoint) calibrating revision/hypothesis/convergence patterns. |
| plan | references/red-team-personas.md | Link | Added as a second reference on the existing `/av:plan red-team` row of the Subcommands table (minimal edit — did not touch `plan-i18n`-relevant sections). File defines the reviewer lenses, verification-role assignment, and finding/adjudication formats the red-team operation already documents at a high level. |
| plan | references/validate-question-framework.md | Link | Added as a second reference on the existing `/av:plan validate` row of the same table. File defines question categories, format rules, and the validation-log format the validate operation already documents at a high level. |
| retro | references/metrics-guide.md | Link | Added a pointer sentence after Step 3's derived-metrics table — the file gives what-it-measures/why-it-matters/interpretation-threshold detail for every metric in that table, directly feeding Step 5's "Recommendations" requirement. |
| docs | references/llms.md | Link (new routing entry) | File is a complete, previously unwired operation (generate `llms.txt` per llmstxt.org from `docs/`). No other file mentioned it. Wired it in as a fifth routing option (`llms`) in the `## Routing` table, matching the existing init/update/summarize/agent-context pattern exactly; updated `argument-hint` and `keywords` in frontmatter to include it so the operation is discoverable, not just checker-satisfied. |

## SKILL.md line counts after edits (budget: 300 warn / 400 ceiling, `origin: ported` so warning-only)

| Skill | Lines | Over 300? |
|---|---|---|
| preview | 157 | no |
| mobile-development | 220 | no |
| web-testing | 107 | no |
| threejs | 152 | no |
| loop | 194 | no |
| sequential-thinking | 104 | no |
| plan | 628 | **yes — pre-existing, not introduced by this batch** |
| retro | 145 | no |
| docs | 110 | no |

`plan/SKILL.md` was already 628 lines before this batch touched it (confirmed via initial Read). My two edits extended two existing table cells in place (added a second reference + one clause each) — 0 net new lines. I did not raise `maxLines` and did not add prose beyond the two reference pointers, per the "keep edit minimal and surgical" instruction (another agent reads this file concurrently for `plan-i18n` reconciliation). The 628-line size is evidence this ported skill's reference set is oversized, but resolving that is out of this batch's scope (not one of the 24 assigned files, and restructuring `plan/SKILL.md` risks colliding with the concurrent `plan-i18n` read/reconciliation).

## Files deleted

- `kit/skills/loop/references/results-logging.md` (rationale + quoted claim above)

## Validate output

```
$ npx tsx packages/cli/src/index.ts validate 2>&1 | grep -E 'preview:|mobile-development:|web-testing:|threejs:|loop:|sequential-thinking:|plan:|retro:|docs:'
(no output)

$ npx tsx packages/cli/src/index.ts validate 2>&1 | tail -5
ariadnev validate — 105 skills, 16 agents, 14 hooks
  all checks passed
```

0 errors, 0 warnings across the whole kit at time of this run (other concurrent batches' orphans were also clear by the time this ran).

## Acceptance criteria

- [x] Assigned grep returns nothing.
- [x] `0 error(s)` overall (validate reports "all checks passed").
- [x] Every `## References`/index entry written has a purpose line (web-testing, sequential-thinking, docs routing table, loop pointer sentences, retro pointer sentence, plan table cells — all carry an inline purpose).
- [x] No file linked purely to silence the checker: every link/index entry above ties to a real, read place in the body (a table row, a config field, an operation, a workflow step). One file (`results-logging.md`) was deleted for a substantiated content contradiction, not to avoid reading it — it was read in full and its claim quoted.
