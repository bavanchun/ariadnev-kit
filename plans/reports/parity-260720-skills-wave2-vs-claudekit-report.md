# Parity: vc:bootstrap/vc:security-scan/vc:predict/vc:scenario/vc:worktree vs ClaudeKit

Date: 2026-07-20 | Phase 6 of `plans/260720-0116-vc-kit-v2-agents-harness-skills/`
CK sources read in full: `~/.claude/skills/{bootstrap,security-scan,worktree}/SKILL.md` (109/145/141 lines), `~/.claude/skills/{ck-predict,ck-scenario}/SKILL.md` (151/231 lines — `ck-` prefix, absorbed from `autoresearch` by Udit Goenka, MIT).

## vc:bootstrap vs ck:bootstrap (109 lines → 56 lines)

| CK capability | vc:bootstrap |
|---|---|
| Git init step (ask in interactive, auto otherwise) | ✅ kept |
| 4 modes (full/auto/fast/parallel) each with its own workflow reference file | ➡️ bỏ có lý do: collapsed to 1 workflow + a 3-row mode table — CK's 4 separate `references/workflow-*.md` files mostly differ in which flags get forwarded to `vc:plan`/`vc:cook`, which this version states inline without 4 files that can drift from each other |
| Triggers `ck:plan` then `ck:cook` with mode-mapped flags | ✅ kept, same handoff shape (stack+requirements → plan path → cook) |
| "Elite software engineering expert" role framing | ➡️ bỏ có lý do: doesn't add behavior, this kit's voice doesn't need a persona restated per-skill |

**Điểm vượt**: stack lock is now a stated hard gate — `AskUserQuestion`
before any scaffold file is written, explicitly justified ("a silently
guessed stack is the most expensive mistake to unwind later"). CK's version
never states this as a gate; stack selection happens implicitly somewhere
inside the research/tech-stack phase reference files.

## vc:security-scan vs ck:security-scan (145 lines → 74 lines + 2 references)

| CK capability | vc:security-scan |
|---|---|
| Zero external dependency, grep + reasoning | ✅ kept exactly — this was already the right design |
| Project-type detection for the right audit command | ✅ kept |
| Secret patterns (AWS/GitHub/Stripe/private-key/DB-string/password/Slack/JWT) | ✅ kept, moved to `references/secret-patterns.md` (unchanged coverage) |
| Vulnerability patterns (SQLi/XSS/command-injection/path-traversal/insecure-random/eval) | ✅ kept, moved to `references/vulnerability-patterns.md`, added a missing-auth-check pattern CK didn't have |
| Severity levels, exclusions, placeholder-detection | ✅ kept |
| `.env` git-tracking check | ✅ kept |
| Security policy (never print real secret, never execute, never auto-modify) | ✅ kept verbatim in spirit |
| `{CK_REPORTS_PATH}` env-var coupling for auto-mode report path | ➡️ bỏ có lý do: no equivalent env var in vc; reports go to `plans/reports/` per this kit's naming convention |

**Điểm vượt**: confirmed Critical/High findings explicitly route to `vc:fix`
for remediation — CK's version reports and stops, with no stated next step
back into the kit's own fix pipeline.

## vc:predict vs ck:predict / autoresearch (151 lines → 85 lines)

| CK capability | vc:predict |
|---|---|
| 5 personas (Architect/Security/Performance/UX/Devil's Advocate) with their core questions | ✅ all 5 kept, same questions in spirit |
| Independent-analysis-then-debate protocol | ✅ kept |
| GO/CAUTION/STOP verdict + STOP triggers | ✅ kept, same 4 triggers |
| `--chain reason` / `--chain probe` follow-on modes (subjective refinement loop, requirement-interrogation loop) | ➡️ bỏ có lý do: these are the "iterative saturation" archetype — heaviest rewrite cost, and the plan already flagged high-risk work gets a mandatory `AskUserQuestion` confirm via `vc:cook`'s risk-lanes gate, which covers the same "don't proceed on an unclear signal" need without a second loop mechanism |
| Integration table (scenario/plan/cook) | ✅ kept, condensed |

**Điểm vượt**: mandatory grounding rule — every persona must cite a real
file or pattern when the proposal touches existing code; CK's personas can
debate entirely in the abstract with no citation requirement, which is
exactly the kind of ungrounded debate this kit's other agents (`vc-planner`,
`vc-reviewer`) are built to avoid.

## vc:scenario vs ck:scenario / autoresearch (231 lines → 66 lines)

| CK capability | vc:scenario |
|---|---|
| 12 decomposition dimensions with "look for" guidance | ✅ all 12 kept |
| One-shot mode: mark applicable dimensions, generate 3-5 scenarios each, severity table | ✅ kept as the only mode |
| Iterative/saturation mode (`--iterations N`, `--saturation`, novelty classification, TSV logging, composite scoring, dimension-rotation forcing) | ➡️ bỏ có lý do: this is the same iterative-saturation archetype dropped from predict — a bounded-loop novelty-detection algorithm is real engineering effort for a mode the plan didn't ask for (one-shot covers the stated v1 need: "pre-implementation risk discovery, QA planning, regression design") |
| Domain/focus hint flags | ➡️ bỏ có lý do: folded into "read the target, decide relevant dimensions" — an explicit flag isn't needed when the model can infer domain from the code/description directly |

**Điểm vượt**: output explicitly wired to `vc:cook`'s test-gate — each
Critical/High scenario row is meant to become a concrete test case, stated
in this kit's own vocabulary (test-gate, proof layers) rather than left as a
generic "pass to your test skill" instruction.

## vc:worktree vs ck:worktree (141 lines → 63 lines)

Biggest architectural trade-off in this wave: CK's worktree ships a bundled
`scripts/worktree.cjs` handling monorepo detection, JSON output, and 6
subcommands (create/remove/info/list/status/prune).

| CK capability | vc:worktree |
|---|---|
| Branch-type prefix detection from description | ✅ kept, same category list |
| Slug conversion, exact-branch-name passthrough | ✅ kept |
| Create/list/status/remove/prune commands | ✅ kept, run as direct `git worktree` invocations instead of a wrapper script |
| Monorepo project selection via `AskUserQuestion` | ➡️ bỏ có lý do: no bundled detection script in v1; a monorepo caller can just say which project directory, this skill doesn't need to auto-detect it |
| `.env*.example` → `.env*` auto-copy | ✅ kept, with an explicit "never copy real .env" guard CK's version doesn't state |
| JSON output fields for scripting | ➡️ bỏ có lý do: no script to emit JSON from — this skill is LLM-driven, not script-first, by design (matches the "LLM-driven analysis" archetype from the original ClaudeKit scout report: zero deps, lowest maintenance) |
| Dependency-install-per-lockfile automation | ➡️ bỏ có lý do: reporting the right install command and letting the caller run it is safer than auto-running installs in a freshly created worktree |

**Điểm vượt**: explicit secret-safety guard on the `.env` copy step — CK's
version describes the copy mechanically without stating the risk of copying
a real `.env` across worktrees; this version calls it out as a quality gate.

## Tổng kết

5/5 skills pass skill-lint gate (56/74/85/66/63 lines + 2 short references
for security-scan, all ≤300). Roster complete at 21/21. The two skills
absorbed from `autoresearch` (predict, scenario) both dropped their
heaviest mechanism (chain/saturation loops) for the same stated reason —
iterative novelty-detection loops are the highest-rewrite-cost pattern this
kit's earlier scout report flagged, and the one-shot/single-debate mode
already covers the v1 use case. vc:worktree is the clearest architecture
trade — script-first (CK) vs LLM-driven-with-plain-git (vc) — made
explicitly, not silently.

## Full-kit smoke result

`full-kit install smoke (v2 roster)`: 21 skills + 13 agents + 6 hooks
asserted present for claude-code; codex install confirms skills + agents
land adapted (`.toml`) and all 6 hooks skip-and-log. 139 vitest + 46
node:test, coverage 99.28%.

## Unresolved questions

None.
