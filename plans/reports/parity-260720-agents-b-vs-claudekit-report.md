# Parity: vc-debugger/vc-developer/vc-git-manager/vc-simplifier vs ClaudeKit

Date: 2026-07-20 | Phase 3 of `plans/260720-0116-vc-kit-v2-agents-harness-skills/`
CK sources read in full: `~/.claude/agents/{debugger,fullstack-developer,git-manager,code-simplifier}.md` (171/120/18/54 lines).

## vc-debugger vs debugger.md (171 lines → 50 lines)

| CK capability | vc-debugger |
|---|---|
| Persona: Senior SRE, prove don't guess | ✅ kept |
| Behavioral checklist (evidence-first, 2-3 hypotheses, elimination path, root cause w/ evidence) | ✅ kept (condensed to 6 items) |
| Database/log/perf/CI tool inventory (psql, repomix, gemini, docs-seeker) | ➡️ bỏ có lý do: static tool laundry list goes stale; agent discovers the repo's actual tools instead of trusting a hardcoded list |
| Root-cause loop detail (reproduce→hypothesize→prove→fix→verify) | ➡️ bỏ có lý do: trỏ `vc:fix`'s `references/root-cause.md` — 1 nguồn sự thật, không lặp |
| Executive Summary / Technical Analysis / Best Practices / Communication sections | ➡️ bỏ có lý do: report-writing scaffolding beyond the persona+checklist+output formula; condensed into one Output block |
| Memory Maintenance / Team Mode | ➡️ bỏ có lý do (như phase 2 — ngoài scope v1 agent formula) |

**Điểm vượt**: (1) recurrence-guard field mandatory in output — CK's "propose monitoring improvements" is a suggestion, vc makes it a required line; (2) no tool-laundry-list to go stale; (3) DRY link to vc:fix instead of a second copy of the loop.

## vc-developer vs fullstack-developer.md (120 lines → 54 lines)

| CK capability | vc-developer |
|---|---|
| Behavioral checklist (error handling, input validation, no TODO, clean interfaces, file ownership, tests, type safety, build passes) | ✅ all 8 kept |
| Phase Analysis / Pre-Implementation Validation / QA 5-step process | ✅ condensed to a 5-step workflow, same substance |
| File Ownership Rules (CRITICAL) as a separate section | ✅ folded into the checklist — one violation type, one place |
| Backend+frontend+infra generalist scope | ✅ kept, explicitly named "generalist" in description per brainstorm decision (UQ#1) — deep frontend/design work deferred to a future dedicated agent, not silently absorbed |
| Output Format (Phase Implementation Report) | ✅ kept, condensed |
| `{plan-dir}/phase-XX-*.md` CLI-coupled path convention | ➡️ bỏ có lý do: vc:plan's format (no `ck` CLI dependency) — same idea, no infra coupling |
| Memory / Team Mode | ➡️ bỏ có lý do |

**Điểm vượt**: (1) test-first stated as the default (from `vc:cook`), not merely "tests added" after the fact — CK's checklist item 6 is retrospective, vc's is a process requirement; (2) explicit scope honesty ("generalist... wait for a dedicated UI agent") rather than CK's implicit full-stack claim.

## vc-git-manager vs git-manager.md (18 lines → 44 lines)

CK's version is a single paragraph pointing at a `git` skill with a 2-4 tool
call budget and team-mode section. vc keeps the tool-call discipline but adds
real behavior since the plan flagged CK's version as "too thin":

| Addition | Why |
|---|---|
| Secret-scan gate before staging | Never in CK's version — a git-manager that stages `.env` by accident is a real risk this kit's `privacy-block` hook only catches for Read/Edit/Bash, not for git add |
| Commit message derived from re-read `git diff --cached` | CK doesn't state this explicitly; prevents a bland/guessed message |
| Explicit "only requested operation" rule | CK implies it via team-mode "only perform requested"; vc states it plainly in the main behavioral checklist, not buried in team-mode |

**Điểm vượt**: secret-scan-before-stage is the standout — a capability CK's
git-manager genuinely lacks, not a rewording.

## vc-simplifier vs code-simplifier.md (54 lines → 51 lines)

| CK capability | vc-simplifier |
|---|---|
| Preserve functionality, never change behavior | ✅ kept, made a checked/verifiable item (test before/after) instead of a stated principle |
| Apply project standards | ✅ folded into workflow step 3 |
| Enhance clarity (reduce nesting, remove redundancy, guard clauses, explicit > compact) | ✅ kept as a concrete pattern list |
| Maintain balance (avoid over-simplification) | ✅ kept as checklist item 6 |
| Focus scope: recently modified code by default | ✅ kept |
| Refinement process 6 steps | ✅ condensed to 5-step workflow, same substance |
| Memory / Team Mode | ➡️ bỏ có lý do |

**Điểm vượt**: "behavior identical" is enforced by an explicit before/after
test-run requirement in the checklist, not just stated as a goal — CK says
"never change what code does" but has no verification step; vc requires
running the same tests (or manual check) before and after and comparing.

## Tổng kết

4/4 agents pass agent-lint gate, all ≤120 lines (50/54/44/51). No sentence
copied verbatim from CK. vc-git-manager is the clearest net addition (CK's
version was genuinely thin, as the plan predicted) — secret-scan-before-stage
is a real capability gap closed, not just a rewrite.

## Unresolved questions

None.
