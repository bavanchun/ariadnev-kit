# Port: Ultra Verifier Mode (`--ultra`) across the workflow skills

Date: 2026-08-30 · Branch: `worktree-agent-ad574325f665713ae` · Source: upstream 2.14.0

## Outcome

One shared protocol at `kit/skills/brainstorm/references/ultra-verifier-mode.md`
(166 lines, ported from the upstream 167-line file) plus a `--ultra` mode
section in all 13 carrying skills. Carrier count verified by `rg -l -e '--ultra'`
over upstream `SKILL.md` and `references/*.md`: 13 skills, two extra upstream
references (`plan/references/workflow-modes.md`, `test/references/create-suite-workflow.md`).

## Where each skill's section landed

| Skill | Upstream lines added | Landed in ariadnev | SKILL.md before → after |
|---|---|---|---|
| advise | flag row + exclusivity sentence + 37-line section | `SKILL.md` — flag row, `--agent` mutual-exclusion sentence, `## Ultra Verifier Mode` before Critical Constraints | 236 → 275 |
| agentize | flag row + 22-line section | `SKILL.md` — usage line, flag row, section after phase 7 | 274 → 297 |
| bootstrap | composable row + 3-line planning override + 16-line section | `SKILL.md` — row, planning-phase override paragraph, section before Output format, quality-gate line | 213 → 236 |
| brainstorm | 23-line section + `--report` note | `SKILL.md` — section before Boundaries; shared protocol as its own `references/ultra-verifier-mode.md` (new `references/` dir) | 257 → 283 |
| code-review | 27-line section | `SKILL.md` — section after Bottom Line | 254 → 282 |
| debug | 24-line section | `SKILL.md` — section after Red Flags | 183 → 208 |
| fix | flag row + 2 diagram lines + 22-line section | Row + one diagram edge in `SKILL.md`; section appended to `references/complexity-assessment.md` (74 → 96); References-table row edited in place; intro paragraph reflowed 6 → 5 lines to hold the cap | 299 → 300 |
| plan | mode-table row + 11-line Ultra Mode pointer + Mode Exclusivity paragraph; `workflow-modes.md` +53-line Ultra Mode + 4 table/availability edits | Row, mode-list edits (diagram edge, steps 5-7, red-team omit list) in `SKILL.md`; `## Mode Exclusivity` + `## Ultra Mode` + hydration/red-team/validation/cook-reminder rows in `references/workflow-modes.md` (217 → 295) | 297 → 299 |
| problem-solving | 22-line section | `SKILL.md` — section after References | 123 → 146 |
| research | 23-line section | `SKILL.md` — section before Output format | 197 → 221 |
| review-pr | mode bullet + flag-detect line + regex edits + 24-line section | Bullet, compose sentence, strip-list, detect line, 3 sed regexes, fix-loop carry rule in `SKILL.md`; section as new `references/ultra-review-mode.md` (32 lines) | 293 → 294 |
| scout | argument bullet + 25-line section | `SKILL.md` — bullet, section before References | 141 → 168 |
| test | flag bullet + 19-line section + 3-line `create-suite-workflow.md` note | `SKILL.md` — section before Output format (see gaps) | 138 → 161 |

Every `argument-hint` now carries `[--ultra]`. All touched SKILL.md files are
≤300 lines (`wc -l`), every touched reference ≤800.

## Corpus members edited (benchmark regeneration owed at integration)

`evals/context/corpus-manifest.json` members touched: `kit/skills/brainstorm/SKILL.md`,
`kit/skills/code-review/SKILL.md`, `kit/skills/fix/SKILL.md`, `kit/skills/plan/SKILL.md`,
`kit/skills/research/SKILL.md`, `kit/skills/scout/SKILL.md`, `kit/skills/test/SKILL.md`
(7 of 13). The benchmark script was not run.

## Upstream references ariadnev lacks, and how each was handled

| Upstream text relies on | ariadnev state | Handling |
|---|---|---|
| `--debate` mode in `plan` (Mode Exclusivity names it; Ultra Mode reuses Debate steps 1, 2, 4, 6) | No `--debate` anywhere in `kit/skills/plan/` | Mode Exclusivity written fresh in `workflow-modes.md` with `--fast|--hard|--deep|--parallel|--two|--ultra|--auto`; `--fast` + `--ultra` named as the canonical contradiction; Ultra Mode steps written self-contained (Hard Mode steps 1-2 for the packet, `av plan use` for the single pointer) |
| "both active-plan pointers", `status: todo` | One pointer (`av plan use`); status vocabulary `pending/in-progress/completed/cancelled` | Single pointer re-asserted in step 6; scaffold left at `status: pending` |
| Verifier model routing "Codex → `gpt-5.6-sol`; see `advisory-supervision.md`" | `kit/agents/kongming.md` runtime note: Claude Code runs it on `fable`, every other provider on the runtime default; ariadnev's three `advisory-supervision.md` files carry no model table | Roles section states exactly that and points the degrade note at non-Claude providers; no foreign model names |
| Grok named in the degrade note | Provider exists in the union, but naming it here adds nothing | Example kept generic ("role-typed subagents that inherit one session model") |
| brainstorm `--report` flag | Absent | Compose list is `--html`, `--advice`, `--yagni`; the "report records the winner + ranking appendix" rule kept as "a durable summary written under `--ultra`" |
| code-review `--advice` composition line | Absent in ariadnev's code-review | Dropped; compose list names the input modes and `--yagni` only |
| test `create|optimize|audit` subcommands, `--advice`, `--interview`, `references/create-suite-workflow.md` | ariadnev's test has only `[context]` and `ui`; its `when_to_use` already covers "designing validation suites" | `--ultra` keyed to a suite-design / suite-optimization / test-audit request rather than a subcommand; execution is never fanned; plain execution + `--ultra` stops and says so. Both finalizers (winner for design, union for audit) conserved |
| agentize `--advice` in the usage line | Absent | Only `[--ultra]` added |
| review-pr multi-PR mode ("fans per PR, still sequentially across PRs") | ariadnev review-pr is single-PR | Sentence dropped; everything else conserved |
| `--no-antv|--no-diagram-design|--no-editorial-visuals` in argument hints | Deliberately absent | Not added |

## Verification run

| Check | Result |
|---|---|
| `wc -l` on every touched file | 13 SKILL.md ≤300 (max: fix 300, plan 299, agentize 297); references 32-295 |
| Cross-skill links | 12 links, all to `av-brainstorm/references/ultra-verifier-mode.md`; `../` from SKILL.md, `../../` from references — matches `cross-skill-references.ts` depth rule; target exists |
| Orphan check | `brainstorm/SKILL.md` mentions `references/ultra-verifier-mode.md`; `review-pr/SKILL.md` mentions `references/ultra-review-mode.md` |
| Upstream strings (`ak-`, `ak:`, agentkit, antv, diagram-design, editorial-visual, gpt-5, cursor, grok, `--debate`, `--report`, `--interview`) | zero hits in `git diff` and in both new files |
| `av validate --strict` | 105 skills, 16 agents, 14 hooks — all checks passed (131 pre-existing warnings, none naming a touched file) |
| `av …` invocations written | none new; `av plan use {plan-dir-name}` reused verbatim from existing text |
| Tests / build | not run (coordinator's gate) |

## Unresolved questions

1. `fix/SKILL.md` sits exactly at 300 — the next line added there must go to a reference.
2. `test --ultra` is keyed to request intent, not a subcommand; if `create|optimize|audit` are ported later, the section should re-key to them and the intent-detection sentence should go.
3. `plan` has no `--debate`; the Mode Exclusivity paragraph is new rather than extended, so a later `--debate` port must add itself to that list.
4. The `Ultra:` run-report line in `review-pr/references/ultra-review-mode.md` is ariadnev-specific (upstream's run report has no such line) — drop it if the coordinator wants strict upstream parity.
