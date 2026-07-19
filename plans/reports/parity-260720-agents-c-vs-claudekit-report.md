# Parity: vc-brainstormer/vc-researcher/vc-docs-manager/vc-project-manager/vc-journal-writer vs ClaudeKit

Date: 2026-07-20 | Phase 4 of `plans/260720-0116-vc-kit-v2-agents-harness-skills/`
CK sources read in full: `~/.claude/agents/{brainstormer,researcher,docs-manager,project-manager,journal-writer}.md` (135/70/227/37/135 lines).

## vc-brainstormer vs brainstormer.md (135 lines → 44 lines)

| CK capability | vc-brainstormer |
|---|---|
| Persona: CTO-level advisor challenging assumptions | ✅ kept |
| Behavioral checklist (assumptions challenged, alternatives surfaced, trade-offs quantified, second-order effects, simplest option, decision documented) | ✅ all 6 kept, +1 (problem-first restatement) |
| Discovery/Research/Analysis/Debate/Consensus/Documentation/Finalize 7-phase process | ➡️ bỏ có lý do: trỏ `vc:brainstorm` skill — it already encodes this exact flow (scout-first gate, present-before-ask, report format, plan handoff); duplicating it here would drift |
| Collaboration Tools list (docs-manager agent, psql, ai-multimodal, repomix --remote) | ➡️ bỏ có lý do: most are paid/complex tools outside v1 vc scope; agent should discover what's available, not carry a static CK tool list |
| `/ck:plan --fast/--hard` finalize coupling | ➡️ bỏ có lý do: vc:brainstorm already owns the plan-handoff decision (AskUserQuestion with vc:plan) |

**Điểm vượt**: (1) problem-first inversion made a required checklist item (CK buries this in "Your Approach" prose, not enforced); (2) DRY — one workflow definition (vc:brainstorm), not two that can drift.

## vc-researcher vs researcher.md (70 lines → 43 lines)

| CK capability | vc-researcher |
|---|---|
| Persona: Technical Analyst, evaluates not just finds | ✅ kept |
| Behavioral checklist (3+ sources, credibility weighting, trade-off matrix, adoption risk, architectural fit, ranked recommendation, limitations stated) | ✅ all 7 kept |
| "Query Fan-Out" technique naming | ➡️ bỏ có lý do: a technique name isn't a behavior; the sourcing discipline is already enforced by the checklist |
| Memory Maintenance | ➡️ bỏ có lý do (ngoài scope v1 formula, như các agent trước) |

**Điểm vượt**: mandatory (claim, source, date) evidence tuple — matches `vc:research` skill exactly; CK's researcher never requires a *date checked*, so its findings can go stale silently.

## vc-docs-manager vs docs-manager.md (227 lines → 49 lines)

Heaviest compression of the roster (227→49, 78% cut) — CK's version repeats
itself across "Core Responsibilities," "Size Limit Management," "Documentation
Accuracy Protocol," and "Working Methodology" sections that all restate the
same few rules in different words.

| CK capability | vc-docs-manager |
|---|---|
| Verify-before-document (persona + checklist) | ✅ kept as the lead behavior |
| Evidence-based writing (grep for functions/routes/config before documenting) | ✅ folded into checklist item "paths/flags verified to exist" |
| Size limit management (`docs.maxLoc`, split into topic dirs) | ✅ kept as one checklist item, pointing at `vc:docs` for the split strategy instead of repeating it |
| repomix codebase-summary generation | ➡️ bỏ có lý do: repomix is not in vc's zero/low-dep tool set; not assumed available |
| PDR/code-standards/system-architecture "always create these 3 files" mandate | ➡️ bỏ có lý do: `vc:docs`'s own rule — create only what's needed — overrides a blanket mandate |
| validate-docs.cjs script call | ➡️ bỏ có lý do: CK-CLI-specific tooling, not part of vc kit |

**Điểm vượt**: explicit 4-mode dispatch (init/update/audit/decision) stated
up front — CK's docs-manager has update-triggered and audit-ish behavior
scattered across sections with no single mode list; vc:docs now also has a
`decision` mode CK's docs-manager entirely lacks (durable decision records,
distilled from repository-harness).

## vc-project-manager vs project-manager.md (37 lines → 40 lines)

CK's version was already tight and well-formed — the plan predicted this
would be near parity, not a big cut.

| CK capability | vc-project-manager |
|---|---|
| Persona: Engineering Manager, evidence not feelings | ✅ kept |
| Behavioral checklist (evidence-backed progress, blockers flagged, scope logged, risks updated, concrete next actions) | ✅ all 5 kept |
| "Activate project-management skill" + naming pattern injection | ✅ replaced with explicit `vc:pm` load instruction |

**Điểm vượt**: audit explicitly required across *every* phase file, not just
the active one — CK's checklist doesn't state this, and per `vc:pm`'s
sync-back rules it's the difference between a report that's actually correct
and one that only reflects the most recent session.

## vc-journal-writer vs journal-writer.md (135 lines → 40 lines)

Biggest tone shift by design (brainstorm decision: "gọn hơn, bỏ phần
emotional dài").

| CK capability | vc-journal-writer |
|---|---|
| Root cause stated without euphemism | ✅ kept |
| Specific technical detail required | ✅ kept |
| Decision + alternatives documented | ✅ kept |
| Lesson extractable | ✅ kept |
| Emotional reality section, tone/voice guide, "Example Emotional Expressions" list, 200-500 word quality standard | ➡️ bỏ có lý do: user-confirmed direction — CK's diary-with-feelings framing doesn't fit vc's terser style; honesty about root cause is kept, the venting register is not |
| Next steps actionable | ✅ kept |
| Memory Maintenance | ➡️ bỏ có lý do |

**Điểm vượt**: friction/harness-delta detection is new — repeated confusion
(2nd+ occurrence) triggers a required concrete rule/doc/skill fix in the
entry, distilled from repository-harness's IMPROVEMENT_PROTOCOL; CK's
journal-writer has no equivalent, it only journals single incidents.

## Tổng kết

5/5 agents pass agent-lint gate, all ≤120 lines (44/43/49/40/40 — total
216 lines vs CK's combined 604 for the same 5, a 64% cut with every core
capability preserved or intentionally traded for a stated reason). Roster
now complete at 13/13 agents. No sentence copied verbatim from CK.

## Unresolved questions

None.
