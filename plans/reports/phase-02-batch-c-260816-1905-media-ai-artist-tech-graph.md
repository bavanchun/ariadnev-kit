# Phase 2 Batch C — media-processing, ai-artist, tech-graph

Plan: `plans/260816-1845-ariadnev-evidence-backed-parity-with-agentkit/phase-02-reference-debt-and-enforcement.md`

## Decisions

### media-processing (9 files — all INDEX)

`SKILL.md` already had a closing `## References` list with one-line purposes per
file, but each entry was written as a bare backtick filename (`` `ffmpeg-encoding.md` ``)
instead of the `references/<name>.md` form `checkReferenceIntegrity` matches — that
mismatch, not missing content, was the whole orphan cause. Read every file; all 9
are real, on-topic, non-duplicated deep-dives the skill body already promises
("Detailed guides in `references/`"). Fix: reformatted the list to
`references/<name>.md — <purpose>`, purposes unchanged (they were already accurate).

| File | Decision | Purpose |
|---|---|---|
| references/ffmpeg-encoding.md | Index | Codecs, quality, hardware acceleration |
| references/ffmpeg-streaming.md | Index | HLS/DASH, live streaming |
| references/ffmpeg-filters.md | Index | Filters, complex filtergraphs |
| references/imagemagick-editing.md | Index | Effects, transformations |
| references/imagemagick-batch.md | Index | Batch processing, parallel ops |
| references/rmbg-background-removal.md | Index | AI models, CLI usage |
| references/common-workflows.md | Index | Video optimization, responsive images, GIF creation |
| references/troubleshooting.md | Index | Error fixes, performance tips |
| references/format-compatibility.md | Index | Format support, codec recommendations |

### ai-artist (8 files — all DELETE)

Read all 8. Skill's actual scope (per description/body): generate images via Nano
Banana, using the 129-prompt CSV database, `search.py --domain awesome`, and modes
search/creative/wild. On-topic reference content already exists and is already
linked: `references/nano-banana.md` (Nano Banana params/templates) and
`references/image-prompting.md` (cross-platform image-prompt vocabulary). The 8
orphans are generic *text*-domain LLM prompting material — code review templates,
marketing copy frameworks, creative-writing patterns, structured-data extraction,
system-prompt architecture, chain-of-thought/ToT/ReAct reasoning technique
catalogs. None mention images, Nano Banana, aspect ratio, or visual style; `grep`
confirms no script or SKILL.md step ever loads or needs them (`search.py --domain`
only resolves against `data/awesome-prompts.csv`, not these files). This reads as
upstream template/vendoring debt (a near-identically-named `advanced-techniques.md`
exists in the unrelated `sequential-thinking` skill, confirming a shared authoring
template rather than deliberate content for this skill). Deleted rather than
indexed: indexing would misrepresent this image-generation skill's scope and
violate KISS by listing unrelated content as if it were an optional deep-dive.

| File | Decision | What it claimed / where that claim lives now |
|---|---|---|
| references/advanced-techniques.md | Delete | Claimed generic prompt-optimization patterns (DSPy, meta-prompting, self-refinement, prompt chaining, LLM-as-judge eval, agent tool-use design, production/version-control practices for *text* prompts). None of it is image-generation guidance; dropped as out-of-scope debt — no replacement needed since it was never reachable from the skill's workflow. |
| references/domain-code.md | Delete | Claimed code-gen/review/refactor/debug/test-gen prompt templates. Text-domain, unrelated to image generation; dropped, not referenced elsewhere in this skill. |
| references/domain-data.md | Delete | Claimed structured-extraction/analysis/comparison prompt templates. Same — text-domain, dropped. |
| references/domain-marketing.md | Delete | Claimed headline/ad-copy/landing-page prompt templates. Same — text-domain, dropped. |
| references/domain-patterns.md | Delete | Was itself just an index pointing at the 4 domain-*.md files ("Quick reference index. Load specific domain file..."); with those deleted this index has nothing left to point at. Dropped. |
| references/domain-writing.md | Delete | Claimed story/character/dialogue/editing prompt templates. Same — text-domain, dropped. |
| references/llm-prompting.md | Delete | Claimed system/user prompt architecture, CoT/ToT/ReAct summaries, JSON output control, per-model (Claude/GPT-4/Gemini) tips. Text-domain LLM prompting, not image generation; dropped. |
| references/reasoning-techniques.md | Delete | Claimed deep dives on CoT/ToT/self-consistency/ReAct/least-to-most/DECOMP/constitutional-AI reasoning. Same category as llm-prompting.md, text reasoning not image generation; dropped. |

### tech-graph (7 files — 6 Link, 1 Delete)

Body already links style 1 explicitly (`references/style-1-flat-icon.md`, in the
Workflow step 4) and enumerates styles 2-7 by number/name/background/use-case in a
`## Styles` table *without* linking their files (only a generic "Load the matching
numbered style reference" sentence) — the exact "enumerates without linking" case
the task flagged, so linking (not indexing) is correct, mirroring style-1's
mechanism. Read all 6 style files: each is a distinct, real color-token/typography/
SVG-pattern reference for its numbered style, genuinely needed at the point the
skill picks a style. Added a `Reference` column to the existing table (0 net new
lines) with `references/style-N-*.md` per row, including row 1 for consistency.

`svg-layout-best-practices.md`: read in full. Its "Component Spacing", "Arrow
Label Placement", "Arrow Routing" and "Validation Checklist" sections restate —
with the same numbers (80px component clearance, 120px layer spacing, mandatory
label background rects, orthogonal routing, jump-over arcs) — what SKILL.md's own
`## Layout Rules & Validation` section (spacing/arrow-labels/arrow-routing/
line-overlap-prevention/validation-checklist) already says. The file additionally
has visible text corruption (missing words/spaces, e.g. "No component bounding
boxes overlap px safety margin)", "Grouping coners", a garbled anti-pattern table
row merging two entries into one cell) and its "Style-Specific Enhancements"
section covers only 2 of the skill's 7 styles, which is already superseded by the
dedicated per-style reference files linked above. Deleted as duplicated-in-body
content; not indexed or linked because doing so would restate the same rules a
second time inside an already-oversized SKILL.md (446 lines, over the 400 ceiling
before this batch touched it).

| File | Decision | Purpose / rationale |
|---|---|---|
| references/style-2-dark-terminal.md | Link | Dark Terminal style colors/typography/SVG patterns — table `Reference` column |
| references/style-3-blueprint.md | Link | Blueprint style colors/typography/SVG patterns — table `Reference` column |
| references/style-4-notion-clean.md | Link | Notion Clean style colors/typography/SVG patterns — table `Reference` column |
| references/style-5-glassmorphism.md | Link | Glassmorphism style colors/typography/SVG patterns — table `Reference` column |
| references/style-6-claude-official.md | Link | Claude Official style colors/typography/SVG patterns — table `Reference` column |
| references/style-7-openai.md | Link | OpenAI Official style colors/typography/SVG patterns — table `Reference` column |
| references/svg-layout-best-practices.md | Delete | Claimed component spacing (80px/120px), arrow label placement, arrow routing/jump-over-arc rules, and a validation checklist — all already stated, with the same figures, in SKILL.md's own `## Layout Rules & Validation` section. Its non-duplicate parts (SVG z-index render order, a 2-of-7-style "enhancements" note, an anti-pattern table) were corrupted/incomplete in the source file and are dropped rather than carried forward. |

## SKILL.md size after changes

| Skill | Lines | Budget | Status |
|---|---|---|---|
| media-processing | 101 | 300 (400 ceiling) | OK |
| ai-artist | 133 | 300 (400 ceiling) | OK |
| tech-graph | 446 | 300 (400 ceiling) | Over ceiling — pre-existing (was 446 before this batch; my edit added a table column, net 0 line change). `metadata.origin: ported` makes this a warning not an error, and `validate` did not surface a size warning (that check lives in `skill-lint.ts`'s `resolveMaxLines`/`lintSkill`, which `validate-command.ts` does not currently invoke — outside this batch's file ownership). Flagging per the phase's risk-assessment instruction: if a future pass wires size linting into `validate`, tech-graph will need real content trimming/merging, not a limit increase. |

## Validate output

```
$ npx tsx packages/cli/src/index.ts validate 2>&1 | grep -E 'media-processing:|ai-artist:|tech-graph:'
(no output)

$ npx tsx packages/cli/src/index.ts validate 2>&1 | tail -6
ariadnev validate — 105 skills, 16 agents, 14 hooks
  [warn:orphan] docs: references/llms.md exists but is never linked from SKILL.md
  [warn:orphan] plan: references/red-team-personas.md exists but is never linked from SKILL.md
  [warn:orphan] plan: references/validate-question-framework.md exists but is never linked from SKILL.md
  0 error(s), 3 warning(s)
```

0 errors overall. The 3 remaining warnings are in `docs` and `plan`, owned by other
batches, not touched here.

## Files modified

- `kit/skills/media-processing/SKILL.md` (References section reformatted, 9 entries)
- `kit/skills/ai-artist/references/{advanced-techniques,domain-code,domain-data,domain-marketing,domain-patterns,domain-writing,llm-prompting,reasoning-techniques}.md` (deleted, 8 files)
- `kit/skills/tech-graph/SKILL.md` (Styles table gained a `Reference` column)
- `kit/skills/tech-graph/references/svg-layout-best-practices.md` (deleted)

## Acceptance criteria

- [x] `validate | grep -E 'media-processing:|ai-artist:|tech-graph:'` → empty
- [x] 0 errors overall (3 unrelated warnings remain, owned by other batches)
- [x] Every `## References` / table entry written here has a purpose line
- [x] No file linked purely to silence the checker; no load-bearing file deleted unread

Status: DONE
Summary: All 24 assigned orphans resolved — 9 media-processing files re-indexed with the correct `references/` path prefix, 8 ai-artist files deleted as out-of-scope text-prompting debt superseded by nano-banana.md/image-prompting.md, 6 tech-graph style files linked via a new table column mirroring style-1's mechanism, 1 tech-graph file (svg-layout-best-practices.md) deleted as duplicated-in-body plus corrupted. `validate` shows 0 errors, 0 warnings for all three skills.
Concerns/Blockers: tech-graph SKILL.md is pre-existing 446 lines, over the 400 ceiling; not caused by this batch (net 0 line change) and not currently surfaced by `validate` (size linting lives in skill-lint.ts, not wired into validate-command.ts — out of this batch's ownership). Worth flagging to whoever owns validate-command.ts/CI wiring in this phase.
