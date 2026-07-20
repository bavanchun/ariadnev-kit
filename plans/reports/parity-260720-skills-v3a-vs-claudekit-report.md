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

## security-scan (`vc:security-scan` vs `ck:security-scan`)

CK's is a heavier STRIDE/OWASP audit skill. vc is a lightweight grep+reason
scanner (no external service/API key).

| CK capability | vc:security-scan |
|---|---|
| Secret + dependency + code-pattern scan | ✅ all three + `.env` git-tracking check; native audit per stack |
| Severity classification | ✅ kept (Critical/High/Medium/Low by exploitability) |
| Heavy STRIDE threat-model framing | ➡️ scoped out: this skill is the fast pre-release pass; deep threat modeling is a separate concern (KISS) |

**Điểm vượt:** (1) **False-positive discipline as a gate** — every hit passes a
placeholder/context check before reporting; the output bans "there may be secrets
somewhere". (2) **Proof-carrying fixes** — each Critical/High names the proof
(`integration`/`unit`) that would confirm remediation, handing `vc:fix` a
testable done-condition. (3) Redaction enforced in the Quality gates, not just
prose.

## docs-seeker (`vc:docs-seeker` vs `ck:docs-seeker`)

Both fetch current docs. vc adds a verification contract.

**Điểm vượt:** (1) **Staleness is visible** — version/date-checked is mandatory in
the output, and "say so if nothing found" is a hard gate (no silent memory
fallback). (2) Clear split from `vc:research` (pinpoint lookup vs open
evaluation) so the two never overlap. (3) context7-first tool routing.

## obsidian-second-brain-note (personal — parity N/A)

No ClaudeKit counterpart; personal knowledge-capture skill. Brought to
naming-consistency only: `Quality Check` → `## Quality gates`, added
`## Workflow position` marking it a standalone terminal capture step. Content
(9-step vault workflow, taxonomy/frontmatter/linking references) unchanged.

## git (`vc:git` vs `ck:git`)

vc:git is an explicit fork of `ck:git` (frontmatter records `forked-from` +
upstream-sync instructions). This phase consolidated its references.

| CK capability | vc:git |
|---|---|
| cm/cp/pr/prc/merge/feat/fix operations | ✅ all kept, behavior unchanged |
| Conventional commits, branch protection, secret scan | ✅ kept |

**Điểm vượt / cleanup:**
1. **Removed a contradictory duplicate.** `workflow-pr-per-change.md` was an
   unreferenced orphan spec of `prc` that *bypassed review* with `gh pr merge
   --admin` (YOLO) — contradicting SKILL.md's own "YOLO ❌ not in scope" and the
   referenced `workflow-prc.md`. Deleted; its one unique rule (no-AI co-author)
   was already canonical in `commit-standards.md`. This is exactly the
   two-sources-of-truth drift the RDD lesson warns about.
2. **References 10→7** — merged 3 tiny remote-ops files (push/pr/merge, 158
   lines across 3) into one `workflow-sync.md`; kept genuinely-distinct concerns
   (commit, prc, standards, safety, branches, gh-cli) separate. Not forced to
   "4": cramming distinct concerns together would reduce quality, not raise it.
3. Added `## Workflow position`. Achievement-friendly `--solo`/`--team`
   co-author + `prc` pipeline remain vc's value-add over stock `ck:git`.

## Kit-wide wiring (skill↔agent coherence)

Verified the four skill↔agent pairs speak one language (no contradictions):

| Skill surface | Agent | State |
|---|---|---|
| `cook/references/review-gate.md` | `vc-reviewer` | already delegates to it; checklists align (correctness/blast-radius/fit/security ↔ agent's Behavioral Checklist). No change needed. |
| `cook/references/test-gate.md` | `vc-tester` | added pointer to the agent's Strategy A-E scope-mapping table |
| `plan` phase template | `vc-developer` | Stop Conditions added; file-ownership lives in the agent + delegation-protocol rule |
| `docs` anti-bloat gate | `vc-docs-manager` | consistent "docs earn their maintenance" stance |

Shared delegation template: the `intake-and-context` + `delegation-protocol`
rules (globally injected) already provide task/files/acceptance/constraints +
status protocol — no separate file created (would have been a 3rd copy).

Risk-lane vocabulary now referenced in 8 skills (ask, brainstorm, cook, journal,
plan, predict, research, scenario); proof vocabulary in 7 (ask, docs-seeker,
problem-solving, research, scenario, security-scan, sequential-thinking).

## Whole-plan summary

10 skills brought to the cook-grade bar (Output format + Quality gates +
Workflow position + proof/risk wiring). Finding: most were already strong —
this was coherence + explicit self-checks + kit-wide wiring, not a rescue.
Real defects fixed along the way: git's contradictory orphan prc spec removed,
git references 10→7. No skill count change (21). Every claimed win reads against
the real `ck:*` source. `pnpm test` 218 green; dry-run install lands all refs.

## Deviations from plan (documented)

1. **No `_shared/risk-lane-quick-check.md` file.** The `intake-and-context` rule
   already is the canonical, globally-injected risk-lane source; a new file
   under `_shared/` risked not being installed by the adapt engine. Skills
   invoke the vocabulary instead. Intent (single-source risk lanes across the
   kit) fully met.
2. **problem-solving techniques kept inline** (not extracted to `references/`) —
   at 63→~90 lines the file is already tight; splitting adds indirection for no
   gain (YAGNI). Plan floated extraction as optional.
3. **git references 10→7, not "≈4".** Merged only genuinely-mergeable files;
   distinct concerns (commit, prc, standards, safety, branches, gh-cli) stay
   separate — forcing 4 would lower quality.
4. **No separate delegation-template file** — the delegation-protocol rule
   already serves that role.
5. Plan's "SKILL.md ≤120 lines" criterion corrected to the spec's real limit
   (≤300; 120 is the *agent* limit). All rewritten skills land ≤128 anyway.

## Unresolved questions

None.
