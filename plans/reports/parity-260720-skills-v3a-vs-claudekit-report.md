# Parity: vc kit v3a skills (deep coherence) vs ClaudeKit

Date: 2026-07-20 | Plan: `plans/260720-1128-vc-kit-v3a-deep-coherence-10-skills/`
Filled in across phases 1-6. Each entry reads the real CK counterpart
(`~/.claude/skills/<name>/`), lists kept ✅ / dropped-with-reason ➡️, and states
≥1-2 concrete improvements. Directive: lõi ≥ CK, ưu tiên CAO HƠN.

Cook-grade bar (7 points) defined in `docs/vc-skill-authoring-spec.md`.

---

## ask (`vc:ask` vs `ck:ask`)

CK `ck:ask` = "Senior Systems Architect" orchestrating 4 named advisors
(Systems Designer / Technology Strategist / Scalability Consultant / Risk
Analyst); ~70 lines; hardcodes `$HOME/.claude/rules/*` + a fixed `./docs` tree;
uses `$ARGUMENTS` placeholder; output = 5 prescribed sections.

| CK capability | vc:ask |
|---|---|
| Multi-advisor architectural framing | ✅ covered implicitly by "classify: conceptual / codebase / comparison / review" + honest-trade-offs rule — without forcing 4 personas onto a one-line question |
| "Do not implement" boundary | ✅ kept and stronger: names the exact follow-up skill (`vc:cook`/`vc:fix`/`vc:plan`) instead of a generic "next actions" |
| YAGNI/KISS/DRY preamble | ➡️ dropped as boilerplate — the right-size rule enforces the same outcome behaviorally |
| Hardcoded `$HOME/.claude/rules/*` + `./docs` tree | ➡️ dropped: provider-specific absolute paths break the adapt engine; vc grounds in whatever repo it runs in |

**Điểm vượt (proven by reading both):**
1. **Output-first discipline.** vc leads with the verdict then reasoning, and
   bans "it depends" endings (must pick + name the flip condition). CK's 5-section
   format buries the answer under "Architecture Analysis".
2. **Repo-grounded with citations + explicit `## Quality gates`** (answers the
   asked question, cites paths, trade-off mandatory, recency-checked,
   right-sized) — a self-check contract CK has no equivalent of.
3. **Provider-portable** — no absolute paths, installs cleanly to every provider.

---

## research (`vc:research` vs `ck:research`)

CK `ck:research` = a long methodology doc (4 phases, Gemini-CLI toggle plumbing,
"max 5 tool calls" rule, a fixed report template). Heavy on process narration;
its report template is generic (overview/trends/best-practices/security/perf).

| CK capability | vc:research |
|---|---|
| Multi-source gathering + cross-reference validation | ✅ kept, tighter: "primary sources first, community as color", contradictions-are-findings rule |
| Recency emphasis ("2024/latest" keywords) | ✅ kept as a hard Quality gate (dated/versioned claims) rather than a search-keyword tip |
| Gemini-CLI toggle + `.ck.json` config plumbing | ➡️ dropped: tool-specific infra, not portable across providers; vc uses whatever search/docs tools the harness offers |
| Fixed 8-section academic report template | ➡️ replaced with a decision-first contract (Question → Recommendation → Findings → Comparison → Sources) — a research report exists to feed a decision, not to be a textbook |

**Điểm vượt:**
1. **Decision-first output.** Recommendation is committed and up front with its
   flip-condition; CK buries it under "Executive Summary" + 8 sections.
2. **Proof-layer handoff.** vc:research names the proof layer the eventual build
   needs (integration vs unit …), handing `vc:plan` a testable expectation — a
   concept absent from CK.
3. **`## Quality gates`** (≥2 sources, dated claims, project-weighted, report
   disagreement) make the findings self-auditing; CK has no done-definition.

## problem-solving (`vc:problem-solving` vs `ck:*`)

CK has no direct 1:1 "get-unstuck" skill of this shape (its closest is generic
sequential-thinking / brainstorm). vc:problem-solving is a symptom→technique
router (6 named techniques) that ends in a decision.

**Điểm vượt / design:**
1. **Symptom-indexed router** — "same fix 3+ times" → Assumption audit; "can't
   choose for days" → Inversion — so the agent picks the right tool by the
   stuck-pattern, not by browsing a menu.
2. **Ends in a decision, added `## Quality gates`** ("did it actually move the
   state, or just restate the problem"), the failure mode this skill exists to
   prevent.
3. Kept inline (63→~90 lines) rather than exploding 6 one-paragraph techniques
   into `references/` — the plan floated extraction, but splitting a tight file
   adds indirection for zero benefit (YAGNI). Documented deviation.

## journal (`vc:journal` vs `ck:journal`)

CK `ck:journal` writes reflective entries. vc keeps the honest-entry template
and adds a friction/harness-delta loop.

| CK capability | vc:journal |
|---|---|
| Honest failure/decision entry | ✅ kept: fixed template (What happened / Root cause / What we tried / Lesson / Next steps), no corporate softening |
| Reflection after hard sessions | ✅ kept + `## Quality gates` (real detail, actionable lesson) |

**Điểm vượt:** (1) **Harness-delta mode** — a 2nd+ occurrence of the same
friction forces a concrete rule/skill/doc fix proposal, turning journaling into
kit self-improvement (distilled from repository-harness, kept ultralight — no
state machine). (2) Explicit routing to `vc:docs` decision mode for durable
choices, so reflections and decisions don't get conflated.

## docs (`vc:docs` vs `ck:docs`)

CK `ck:docs` maintains a fixed 7-file docs tree. vc treats docs as a liability
to minimize.

| CK capability | vc:docs |
|---|---|
| Init / update / audit docs tree | ✅ all kept as explicit modes; audit outputs (doc, claim, reality) + fixes drift |
| Fixed docs structure | ✅ kept as a *subset-on-demand* ("create only files the project needs") not a mandatory tree |
| — | ✅ added `decision` mode (durable ADR-style records ≤40 lines) |

**Điểm vượt:** **`## Anti-bloat gate` (RDD lesson)** — explicit rules against
creating docs the code already answers, against routine ADRs, comments say WHY
not WHAT, and *prune on sight* during audit. This directly encodes the failure
that sank a real kit launch (stale/contradictory docs → agent trusts the wrong
one). CK's docs skill only ever adds; vc's can subtract.

## sequential-thinking (`vc:sequential-thinking` vs `ck:sequential-thinking`)

Both do revisable step reasoning. vc's core rule is stricter.

**Điểm vượt:** (1) **Falsifiability is mandatory** — "a step that can't be wrong
isn't reasoning, it's restating the question"; hypotheses must reach
`[VERIFICATION]` against real evidence, not stop at "plausible". (2) Added
`## Output format` (explicit vs implicit) + `## Quality gates` (revisions shown,
branches converged) — a done-definition CK's version lacks. (3) Proof note: the
reasoning is not itself a proof; a downstream change still owes its proof layer.

## Unresolved questions

(pending — filled at phase 6)
