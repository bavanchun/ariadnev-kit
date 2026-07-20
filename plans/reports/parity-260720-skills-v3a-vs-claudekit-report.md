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

<!-- research, problem-solving, journal, docs, sequential-thinking,
security-scan, docs-seeker, obsidian, git entries appended per phase -->

## Unresolved questions

(pending — filled at phase 6)
