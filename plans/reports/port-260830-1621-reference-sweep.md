# Port report: design handoff gate and reference guides across seven skills

Source: the upstream 2.14.0 skill tree (read-only). Targets: `kit/skills/<name>/`.
Scout rows verified against source before porting: the two `scout-260830-1604-skills-*` reports (a-to-m: design, frontend-design; n-to-z: orchestrate, show-off, skill-creator, tech-graph, web-frameworks).

## What was ported

| Skill | Upstream file → ariadnev file | Lines (before → after) | What was cut or changed, and why |
|---|---|---|---|
| design | `references/handoff-gate.md` → `references/handoff-gate.md` (new) | — → 56 | Upstream's standalone slides skill has no ariadnev slug; reworded to "the Slides sub-skill of `av:design`". Skill names as `av:<slug>`. |
| design | SKILL.md Process bullet (Design Read declaration) + References row → `SKILL.md` | 264 → 275 | Added the Design Read step (upstream's first Process bullet) linking `../av-frontend-design/references/design-quality-preflight.md`; a References row for the handoff gate; a Related sentence naming the two consumers; and one sentence on step 6 saying the critique rubric and the handoff gate never stack (the distinction handoff-gate.md itself draws). |
| design | `references/design-critique-guide.md` (+2 upstream lines) → same | 244 → 246 | Ported the "scores a finished piece / pre-generation gate lives in preflight" pointer; added the handoff-gate cross-reference so the three gates name each other. |
| frontend-design | `references/design-quality-preflight.md` → same (new) | — → 36 | Upstream's standalone slides skill dropped from the skill list (no such ariadnev skill; slides is a design sub-skill). Verbatim otherwise. |
| frontend-design | Absolute Bans intro pointer, reference-table row, `## Handoff` section → `SKILL.md` | 294 → 298 | Budget: the 300-line cap left 6 lines. The Absolute Bans pointer was appended to the existing exception-path sentence (+0 lines), the table row is +1, the handoff template pointer went into **Output format** (+1), and the context-fit / implementation-safety confirmation went to the end of **Quality gates** as a `**Handoff.**` paragraph (+2) instead of a fifth H2. Same content and same gate order as upstream's `## Handoff`. |
| show-off | `## Handoff Gate (mandatory before delivering)` → `SKILL.md` | 252 → 262 | Section ported as-is pointing at `../av-design/references/handoff-gate.md`; one Quality-gates bullet added so the gate is checkable. **Cut:** the "Editorial visual layer" paragraph (AntV Infographic palette, `diagram-design`, `--no-antv` / `--no-diagram-design` / `--no-editorial-visuals`, `config prefs resolve`, `visual.*` keys) — deliberately absent in ariadnev. |
| tech-graph | `references/svg-layout-best-practices.md` → same (new) | — → 122 | Upstream's file is text-corrupted in six places (`match ckground color`, `overlap px safety margin)`, `top to bot back to front`, `Grouping coners`, a heading fused onto a bullet, and a mangled anti-pattern table row). Repaired from context. Two numbers conflict with upstream's own SKILL.md (label safety 15px vs 10px; same-layer spacing 100-120px vs 80px): stated as "SKILL.md floor, reference preferred". Final checklist item rewritten to name `validate-svg.sh`, which is what actually proves render here. Upstream never links this file from anywhere; it is now wired from Workflow step 3 and the Layout Rules section. |
| orchestrate | `## Arbiter Checklist` + `## Failure Modes` + `## Completion Report` → `references/arbiter-and-failure-modes.md` (new) | — → 69 | **Cut:** the upstream-CLI `orchestrate resume <run-id> <job-graph.json>` reconnect sentence — `av` has no `orchestrate` subcommand and ariadnev's `job-spec.md` has no CLI-delegation section. Replaced with the runtime-neutral rule the SKILL.md Safety defaults already imply (confirm the tracked PID is gone before redispatch; never double a live worker). Each failure bullet now names the owning reference. Completion Report kept because it is where `Arbiter: pass|fail|blocked` is reported. |
| orchestrate | SKILL.md Authority-map bullet + step-5 sentence → `SKILL.md` | 166 → 172 | Pointers only; no tables duplicated. |
| web-frameworks | `## Implementation Checklist` (15 items) → `references/implementation-checklist.md` (new) | — → 32 | Same 15 items, grouped Foundation / Application / Delivery, each mapped to the reference that owns its detail, monorepo-only items tagged. "Install and configure RemixIcon" generalised to "the icon library" with the Remix reference as the pointer, matching SKILL.md's "use the project's icon library" wording. |
| web-frameworks | `### Build order` navigation entry → `SKILL.md` | 149 → 154 | Pointer only. |
| skill-creator | `--advice` flag: argument-hint + `## Advisory supervision` → `SKILL.md` | 161 → 179 | The advisory-only rule, invocation form, and never-bypass rule are **not duplicated**; the section links `../av-cook/references/advisory-supervision.md` and keeps only this skill's four checkpoints (which cook's file does not have). Version bumped 4.0.0 → 4.2.0 because `script-dependency-strategy.md` is written as "from version 4.1.0 onward". |
| skill-creator | `references/cross-marketplace-distribution.md` → same (new) | — → 262 | The upstream-branded "also documents `namespace:skill-name`" cell → "this kit also documents `av:<skill-name>`". Verbatim otherwise; dated ecosystem claims kept with their 2026-08-20 stamp. |
| skill-creator | `references/script-dependency-strategy.md` → same (new) | — → 142 | Reworded every claim that av's `scripts/package_skill.py` strips `venv/`, `.venv/`, or `.env` — it strips only `node_modules/` (`EXCLUDE_DIRS`, line 25). The text now says the packager does not filter venvs or `.env` and they must stay out of the tree. The upstream skill's self-reference by name → "this skill's version 4.1.0". |
| skill-creator | `references/script-quality-criteria.md` (+45 upstream lines) → same | 106 → 151 | Ported `## Dependency Strategy`, the soft-import `python-dotenv` pattern, and the conditional `requirements.txt` / `package.json` sections. **Cut:** the `EXCLUDE_GLOBS` claim that the packager excludes `.env` (false for av; see above). |
| skill-creator | `references/skill-creation-workflow.md` (+9), `references/structure-organization-criteria.md` (+2 comments), `references/plugin-marketplace-overview.md` (+1) → same | 151 → 160, 114 → 114, 89 → 90 | Pointer edits only. The `.env.example` comment says "ship this, never a real .env" rather than upstream's "(packager excludes .env)". |

Line caps: every SKILL.md ≤ 300 (largest: frontend-design at 298); every reference ≤ 800 (largest: cross-marketplace-distribution at 262).

## Corpus members touched

None. `evals/context/corpus-manifest.json` lists ask, brainstorm, code-review, cook, docs-seeker, fix, git, plan, research, scout, security-scan, ship, test. No file under design, frontend-design, show-off, tech-graph, orchestrate, web-frameworks, or skill-creator is in the frozen corpus. Benchmark not run.

## Verification run

- `wc -l` before/after on every touched file (table above).
- Case-insensitive scan for the upstream brand name and its two-letter prefix (with `-` and `:`) across the seven skill directories, the staged diff, and this report: no matches.
- Every `av-<slug>` / `av:<slug>` in the staged diff resolved against `kit/skills/`: cook, design, frontend-design, show-off, ui-ux-pro-max — all exist.
- `av validate --strict`: all checks passed (105 skills, 16 agents, 14 hooks); none of the 131 pre-existing warnings name these seven skills or the new files.
- No `av <cmd>` invocation was added anywhere; `kit/av-invocation-allowlist.json` untouched.
- `packages/cli/src/kit/kit-embedded.generated.ts` untouched; no test suite, build, or install was run (hard rule).

## Unresolved questions

1. `kit/skills/skill-creator/scripts/package_skill.py` strips only `node_modules/`. Upstream 4.1.0 also strips `venv/`, `.venv/`, and `.env`. The ported text is honest about the current behaviour, but the safer fix is to add those to `EXCLUDE_DIRS` / `EXCLUDE_GLOBS` and restore upstream's wording. Out of scope here (script change + test).
2. frontend-design is at 298/300 lines. The next edit to that SKILL.md has to move something into a reference first.
3. Design, frontend-design, show-off, tech-graph, orchestrate, and web-frameworks keep their existing `metadata.version`; only skill-creator was bumped (its reference text depends on the version). Whether the others should bump for a reference-only addition is a release-policy call.
4. `av:design`'s Slides sub-skill is where upstream's separate slides skill maps; handoff-gate.md and design-quality-preflight.md say so explicitly. If a standalone slides skill is ever added, both files need the slug.
