# Parity: vc:skill-creator/vc:journal/vc:sequential-thinking/vc:docs-seeker vs ClaudeKit

Date: 2026-07-20 | Phase 5 of `plans/260720-0116-vc-kit-v2-agents-harness-skills/`
CK sources read in full: `~/.claude/skills/{skill-creator,journal,sequential-thinking,docs-seeker}/SKILL.md` (154/25/101/104 lines).

## vc:skill-creator vs ck:skill-creator (154 lines → 54 lines)

| CK capability | vc:skill-creator |
|---|---|
| Progressive disclosure principle (metadata → SKILL.md → resources) | ✅ kept (matches this kit's own 3-tier model already) |
| Skill structure anatomy | ➡️ bỏ có lý do: trỏ `docs/vc-skill-authoring-spec.md` — 1 nguồn duy nhất, đã tồn tại |
| Creation workflow 9 steps | ✅ condensed to 5-step workflow, same substance |
| Eval infrastructure (evals.json, grader/comparator/analyzer agent templates, aggregate_benchmark.py, eval-viewer HTML) | ➡️ bỏ có lý do: heavy Python/Node script infra requiring a dedicated eval harness — v1 vc has no eval-viewer, and building one is out of scope (YAGNI); replaced by the automated skill-lint gate, which is objective and needs no human-in-the-loop review |
| Description-optimization scripts (`improve_description.py`, `run_loop.py`) | ➡️ bỏ có lý do: same reason — script-driven optimization loop is CK-specific tooling |
| Benchmark scoring (accuracy 80% + security 20% composite) | ➡️ bỏ có lý do: no benchmark corpus exists for vc skills yet; the lint gate covers the mechanical half (frontmatter, size, description shape) that CK's accuracy score partially checks |
| SKILL.md writing rules (imperative form, no duplication, concise) | ✅ kept, matches `docs/vc-skill-authoring-spec.md` already |
| Init/package/validate scripts | ➡️ bỏ có lý do: `vcskill add-skill` (existing CLI command) replaces `init_skill.py`; no separate package/validate step — `pnpm test` IS the validate step |

**Điểm vượt**: the core claimed differentiator holds up — CK's quality bar is
an eval-viewer requiring a human to grade outputs; vc's quality bar
(skill-lint) is a real automated gate that runs on every `pnpm test` and
every install, with zero human review required to catch a malformed skill.

## vc:journal vs ck:journal (25 lines → 78 lines)

CK's version is a two-paragraph pointer to the `journal-writer` subagent with
no entry template of its own — the template lives entirely inside CK's
agent file. vc's `vc-journal-writer` agent, by design (DRY — see phase 4),
points back to `vc:journal` for the template instead of carrying it. So this
skill is necessarily more substantial than CK's, not padded.

| CK capability | vc:journal |
|---|---|
| Delegates to a journal-writer subagent | ✅ kept — `vc-journal-writer` is that subagent, and loads this skill |
| Entries in `docs/journals/` | ✅ kept (singular `docs/journal/` — vc naming convention) |
| Concise, focused on key events/decisions | ✅ kept as explicit word-count + structure guidance |

**Điểm vượt**: (1) full entry template lives in one skill, not duplicated
into the agent file (CK's is agent-only, meaning updating the template means
editing the agent, which then can't be reused by a slash-invoked flow); (2)
friction/harness-delta mode — distilled from repository-harness — CK's
journal has no equivalent, it only records single incidents, never flags
repeated friction as a rule-fix candidate.

## vc:sequential-thinking vs ck:sequential-thinking (101 lines → 66 lines)

| CK capability | vc:sequential-thinking |
|---|---|
| Loose initial estimate, dynamic adjustment | ✅ kept |
| One aspect per thought, explicit assumptions | ✅ kept |
| Revision marker with original/why/impact | ✅ kept, same structure |
| Branch marker for alternatives, explicit convergence | ✅ kept |
| Hypothesis → verification loop | ✅ kept |
| Final marker + completion criteria | ✅ kept |
| Explicit vs implicit application modes | ✅ kept |
| `scripts/process-thought.js` + `scripts/format-thought.js` optional tracking scripts | ➡️ bỏ có lý do: adds Node script maintenance for a feature (deterministic thought tracking) that's optional even in CK's own doc — the methodology works without it |
| 5 reference files (core-patterns, examples ×3, advanced-techniques, advanced-strategies) | ➡️ bỏ có lý do: reference-library archetype has the highest rewrite cost per the original scout report; the core process above already contains every pattern name (revision, branch, hypothesis) with its exact syntax, which is what the references mostly demonstrate via example |

**Điểm vượt**: "every step must be falsifiable" is a new, explicit rule not
present in CK's version — CK describes the mechanics of revision/branching
but never states the criterion for whether a thought is doing real work
versus restating the problem; (2) explicit cross-reference to `vc-debugger`
and `vc-planner`, showing where this skill's explicit mode is actually
useful in this kit's own agents (CK's skill exists in isolation from its
agent roster).

## vc:docs-seeker vs ck:docs-seeker (104 lines → 47 lines)

| CK capability | vc:docs-seeker |
|---|---|
| Verify current docs instead of trusting memory | ✅ kept as the core rule |
| Prefer official docs over blog/SO | ✅ kept |
| Script-first workflow (`detect-topic.js`, `fetch-docs.js`, `analyze-llms-txt.js`) constructing context7.com URLs | ➡️ bỏ có lý do: hardcoded URL construction against one proprietary endpoint is brittle (breaks silently if context7 changes its scheme) and is real script-maintenance surface for zero behavioral gain over calling a context7 MCP tool directly when present, or WebFetch/WebSearch otherwise |
| Agent-distribution recommendation (1/3/7 agents based on URL count) | ➡️ bỏ có lý do: over-engineered for the vc scope — `vc-explore`/`vc-researcher` already handle fan-out when a lookup genuinely needs it |
| `.env` hierarchy for context7 API config | ➡️ bỏ có lý do: no context7 API key dependency in vc — MCP tool (if present) or WebFetch, no separate account/config needed |

**Điểm vượt**: version/date-checked is a required output field — CK's
version never states when the docs were fetched, so a cached-looking answer
from an old session is indistinguishable from a fresh one; vc makes staleness
visible by design, matching `vc:research`'s evidence rule.

## Tổng kết

4/4 skills pass skill-lint gate (54/78/66/47 lines, all ≤300). Roster now at
16/21 skills. The two skills with real script/eval infra in CK
(skill-creator, docs-seeker) were the ones most aggressively cut — both
traded CK's heavier automation for either an equivalent that already exists
in this kit (the lint gate, MCP tools) or an explicit YAGNI call, not a
silent capability loss.

## Unresolved questions

None.
