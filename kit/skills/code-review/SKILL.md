---
name: av:code-review
description: "Review code for bugs, regressions, security, public-contract breaks, and verification gaps with evidence-based rigor. Use on pending changes, a PR number, a commit hash, or a codebase scan."
user-invocable: true
when_to_use: "Invoke to review diffs, PRs, commits, or full codebases."
category: utilities
keywords: [review, quality, verification, reliability]
argument-hint: "[#PR | COMMIT | --pending | codebase [parallel]] [--ultra] [--yagni]"
metadata:
  origin: ported
  author: upstream
  version: "2.0.0"
---

# Code Review

Production-readiness code review with technical rigor, evidence-based claims, and verification over performative responses. Reviews focus on production risks, regression paths, and whether the implementation matches the requested change.

## Input Modes

Auto-detect from arguments. If ambiguous or no arguments, prompt via `ask_user capability`.

| Input | Mode | What Gets Reviewed |
|-------|------|--------------------|
| `#123` or PR URL | **PR** | Full PR diff fetched via `gh pr diff` |
| `abc1234` (7+ hex chars) | **Commit** | Single commit diff via `git show` |
| `--pending` | **Pending** | Staged + unstaged changes via `git diff` |
| *(no args, recent changes)* | **Default** | Recent changes in context |
| `codebase` | **Codebase** | Full codebase scan |
| `codebase parallel` | **Codebase+** | Parallel multi-reviewer audit |

**Resolution details:** `references/input-mode-resolution.md`

### No Arguments

If invoked WITHOUT arguments and no recent changes in context, use `ask_user capability` with header "Review Target", question "What would you like to review?":

| Option | Description |
|--------|-------------|
| Pending changes | Review staged/unstaged git diff |
| Enter PR number | Fetch and review a specific PR |
| Enter commit hash | Review a specific commit |
| Full codebase scan | Deep codebase analysis |
| Parallel codebase audit | Multi-reviewer codebase scan |

## Core Principle

**KISS**, **DRY** always. Requested scope is a constraint, not a finding — do not recommend cutting what the user asked for. If requested scope is genuinely unsafe, broken, or duplicates something that already exists, raise it as a question with the evidence, not as a cut. Flag speculative and unrequested code with its concrete cost. With `--yagni`, scope-cut findings are also in scope. Technical correctness over social comfort.
**Be honest, be brutal, straight to the point, and be concise.**

Default assumption: reviewed code may be AI-assisted. Do not trust polished shape, confident comments, or happy-path tests. Verify behavior, project-rule compliance, and scope discipline from evidence.

No rubber-stamp reviews. The reviewer is not trying to please the author or preserve momentum; the reviewer enforces the rulebook and blocks defects, regressions, hidden scope drift, and AI-slop patterns.

Verify before implementing. Ask before assuming. Evidence before claims.

## Practices

| Practice | When | Reference |
|----------|------|-----------|
| **Spec compliance** | After implementing from plan/spec, BEFORE quality review | `references/spec-compliance-review.md` |
| Receiving feedback | Unclear feedback, external reviewers, needs prioritization | `references/code-review-reception.md` |
| Requesting review | After tasks, before merge, stuck on problem | `references/requesting-code-review.md` |
| Verification gates | Before any completion claim, commit, PR | `references/verification-before-completion.md` |
| Edge case scouting | After implementation, before review | `references/edge-case-scouting.md` |
| **Checklist review** | Pre-landing, `av:ship` pipeline, security audit | `references/checklist-workflow.md` |
| **Tracked reviews** | Multi-file features (3+ files), parallel reviewers, fix cycles | `references/task-management-reviews.md` |

## Quick Decision Tree

```
SITUATION?
│
├─ Input mode? → Resolve diff (references/input-mode-resolution.md)
│   ├─ #PR / URL → fetch PR diff
│   ├─ commit hash → git show
│   ├─ --pending → git diff (staged + unstaged)
│   ├─ codebase → full scan (references/codebase-scan-workflow.md)
│   ├─ codebase parallel → parallel audit (references/parallel-review-workflow.md)
│   └─ default → recent changes in context
│
├─ Received feedback → STOP if unclear, verify if external, implement if human partner
├─ Completed work from plan/spec:
│   ├─ Stage 1: Spec compliance review (references/spec-compliance-review.md)
│   │   └─ PASS? → Stage 2 │ FAIL? → Fix → Re-review Stage 1
│   ├─ Stage 2: Code quality review (code-reviewer subagent)
│   │   └─ Scout edge cases → Review standards, performance
│   └─ Verification gate → Run required tests/builds before claims
├─ Completed work (no plan) → Scout → Code quality → Verification
├─ Pre-landing / ship → Load checklists → Two-pass review → Verification
├─ Multi-file feature (3+ files) → Track review pipeline (scout→review→fix→verify)
└─ About to claim status → RUN verification command FIRST
```

### Review Protocol

**Stage 1 — Spec Compliance** (load `references/spec-compliance-review.md`)
- Does code match what was requested?
- Any missing requirements? Any unjustified extras?
- MUST pass before Stage 2

**Stage 2 — Code Quality** (code-reviewer subagent)
- Only runs AFTER spec compliance passes
- Standards, security, performance, edge cases

**Final Verification**
- Runs AFTER Stage 2 passes
- Re-run the relevant tests, build, lint, or manual reproduction
- Verify accepted findings are fixed and no new regression is introduced
- Critical findings block merge until fixed and re-verified

## Receiving Feedback

**Pattern:** READ → UNDERSTAND → VERIFY → EVALUATE → RESPOND → IMPLEMENT
No performative agreement. Verify before implementing. Push back if wrong.

**Full protocol:** `references/code-review-reception.md`

## Requesting Review

**When:** After each task, major features, before merge

**Process:**
1. **Scout edge cases first** (see below)
2. Get SHAs: `BASE_SHA=$(git rev-parse HEAD~1)` and `HEAD_SHA=$(git rev-parse HEAD)`
3. Dispatch code-reviewer subagent with: WHAT, PLAN, BASE_SHA, HEAD_SHA, DESCRIPTION
4. Fix Critical immediately, Important before proceeding

**Full protocol:** `references/requesting-code-review.md`

## Edge Case Scouting

**When:** After implementation, before requesting code-reviewer

**Process:**
1. Invoke `/av:scout` with edge-case-focused prompt
2. Scout analyzes: affected files, data flows, error paths, boundary conditions
3. Review scout findings for potential issues
4. Address critical gaps before code review

**Full protocol:** `references/edge-case-scouting.md`

## Tracked Review Pipeline

**When:** Multi-file features (3+ changed files), parallel code-reviewer scopes, review cycles with Critical fix iterations.

Discover the live task-management surface at runtime. If available, represent
the `scout → review → fix → verify` dependency chain there. Otherwise, record
the same states in the active plan and run the chain sequentially. Plan files
are the durable source of truth; runtime tracking is only a working view.

**Parallel reviews:** Spawn scoped code-reviewer subagents for independent file groups (e.g., backend + frontend). Fix task blocks on all reviewers completing.

**Re-review cycles:** If fixes introduce new issues, add another review cycle. Limit 3 cycles, then escalate to the user.

**Full protocol:** `references/task-management-reviews.md`

## Verification Gates

**Iron Law:** NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE

**Gate:** IDENTIFY command → RUN full → READ output → VERIFY confirms → THEN claim

**Requirements:**
- Tests pass: Output shows 0 failures
- Build succeeds: Exit 0
- Bug fixed: Original symptom passes
- Requirements met: Checklist verified

**Red Flags:** "should"/"probably"/"seems to", satisfaction before verification, trusting agent reports

**Full protocol:** `references/verification-before-completion.md`

## Integration with Workflows

- **Subagent-Driven:** Scout → Review → Verify before next task
- **Pull Requests:** Scout → Code quality → Verify → Merge
- **Tracked Pipeline:** Record dependencies → advance only when prerequisites complete
- **Cook Handoff:** Cook completes phase → review pipeline completes → cook proceeds
- **PR Review:** `/av:code-review #123` → fetch diff → full review pipeline on PR changes
- **Commit Review:** `/av:code-review abc1234` → review specific commit with full pipeline

## Codebase Analysis Subcommands

| Subcommand | Reference | Purpose |
|------------|-----------|---------|
| `/av:code-review codebase` | `references/codebase-scan-workflow.md` | Scan & analyze the codebase |
| `/av:code-review codebase parallel` | `references/parallel-review-workflow.md` | Ultrathink edge cases, then parallel verify |

## Bottom Line

1. Resolve input mode first — know WHAT you're reviewing
2. Technical rigor over social performance
3. Scout edge cases before review
4. Evidence before claims

Verify. Scout. Question. Then implement. Evidence. Then claim.

## Ultra Verifier Mode (`--ultra`)

When `--ultra` is present, run the review as a best-of-5 verifier pass. The
controller runs the Stage 1 spec-compliance pass once, then fans **Stage 2**
(quality review) out to exactly five independent read-only reviewers in one
parallel wave over a shared evidence packet, and runs the final verification
gate once at the end.

- **Candidate task:** each reviewer independently produces a complete Stage 2
  review of the same scope with evidence (`file:line`) per finding.
- **Finalizer — union, not winner:** a single strongest-model verifier
  evidence-validates every candidate's findings, drops those it cannot confirm
  against cited evidence, and returns the **deduplicated union** of validated
  findings. The 1-20 ranking only orders severity and confidence; it never
  selects one review wholesale, because a real defect may surface in only one
  (possibly lower-ranked) candidate.
- **Conflict:** `--ultra` hard-conflicts with `codebase parallel` (both own the
  multi-reviewer strategy). Passing both is a hard-stop naming both, never a
  silent resolution.

Full mechanics — evidence packet, anonymization, the five-usable-candidate gate
with one bounded re-dispatch, the fail-closed runtime rule, reject-all, and the
Stage mapping — are in `../av-brainstorm/references/ultra-verifier-mode.md`.
`--ultra` composes with the `#PR` / `COMMIT` / `--pending` / non-parallel
`codebase` input modes and with `--yagni`. It is a best-of-5 verifier mode
inspired by LLM-as-a-Verifier, not the full framework; never claim its
logprob/tournament algorithm.

## Output format

Wrap the `code-reviewer` subagent's `## Code Review Summary` (its template lives
in `kit/agents/code-reviewer.md`: Scope, Overall Assessment, Findings grouped
Critical / High / Medium / Low, Edge Cases Found by Scout, Positive
Observations, Recommended Actions, Metrics, Unresolved Questions) in this frame:

```markdown
# Review: <PR #n | commit abc1234 | pending | codebase[ parallel]>
- Diff: <`gh pr diff n` | `git show sha` | `git diff` (staged+unstaged) | scan scope> · Files: <n> · Base: <branch/sha>
- Spec compliance (Stage 1): PASS | FAIL (<missing>) | WARN (<extras>) | N/A — no plan/spec
- Scout: <edge cases surfaced, or "skipped: <reason>">

<## Code Review Summary from the subagent, verbatim>

## Verification
- Ran: `<command>` → <exit code / failure count> — or "NOT RUN: <why>"

## Verdict
READY | READY WITH FIXES (<High+ items>) | BLOCKED (<Critical items>)
Cycles: <n of 3>
```

The older references in this skill rank findings Critical / Important / Minor;
map Important → High and Minor → Low when carrying their output into this frame.

## Quality gates

- [ ] The input mode was resolved before reading any code and is named at the
      top; an ambiguous argument was resolved by asking, not by guessing
      `--pending`.
- [ ] When a plan or spec existed, Stage 1 ran first and Stage 2 only after it
      passed; a FAIL stops the review at Stage 1.
- [ ] Every Critical or High finding cites `file:line` and the observed
      behavior or test, not a suspicion; "should"/"probably"/"seems to" never
      appears in a finding.
- [ ] The Verification block names a command that was actually run in this
      session with its exit status — a verdict of READY without it is not
      allowed.
- [ ] Requested scope was reviewed as a constraint: no finding asks to remove
      what the user asked for unless `--yagni` was passed.
- [ ] Re-review cycles stopped at 3 and escalated to the user.

Proof/risk: the review asserts which ladder rung the change cleared
(`unit` / `integration` / `e2e` / `platform`) from the Verification block; it
never raises the rung by reading code alone.

## Workflow position

**Typically follows:** `/av:cook` (review after implementation), `/av:fix`
(review after bug fix), and `/av:scout` (edge cases scouted before dispatch).
**Typically precedes:** `/av:ship` (ship after review passes) and `/av:test`
when the Verification block found no runnable suite and one must be written.
**Related:** `/av:review-pr` reviews a GitHub PR with `--reply`/`--merge`
capabilities; this skill reviews the diff without posting. `/av:security`
takes over when findings are trust-boundary defects that need a STRIDE audit.
