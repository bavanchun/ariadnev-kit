---
name: av:code-review
description: Review code changes for bugs, regressions, and risky patterns with evidence-based, ranked findings. Use for a diff, a PR number, a commit, or a whole-codebase audit — outside a cook cycle.
user-invocable: true
argument-hint: "[#PR | <commit> | --pending | codebase [parallel]]"
metadata:
  author: vchun
  version: "1.0.0"
  category: core-loop
---

# Code Review

Review an explicit target for requirement gaps, production defects,
regressions, and unjustified complexity. Findings must be reproducible and
ranked; a clean review is earned, not padded with stylistic suggestions.

This skill is read-only. Route accepted fixes to `av:fix`, then review fresh
evidence. Use `av:review-pr` instead when GitHub reply/merge actions are wanted.

## Resolve input mode first

| Argument | Mode | Evidence source |
|---|---|---|
| `#123` / PR URL | PR | `gh pr view` metadata + `gh pr diff` |
| 7–40 hex characters | Commit | commit metadata + full `git show` diff |
| `--pending` | Pending | staged and unstaged changes versus `HEAD` |
| `codebase [scope]` | Audit | scoped source/test/config scan |
| `codebase parallel` | Parallel audit | independent read-only reviewer scopes, then join |
| no argument + recent context | Default | the concrete changes already in context |

No argument, no recent changes, or ambiguous input → ask for the review target.
Read [input and pipeline](references/input-and-review-pipeline.md) for command
resolution, errors, scouting, reviewer handoff, and tracked fix cycles.

## Review order

1. **Load intent and rules.** Read repository instructions, the target diff,
   whole modified files, and the accepted plan/spec when one exists.
2. **Stage 1 — spec compliance.** Map every requirement and acceptance criterion
   to implementation evidence. This must pass before Stage 2.
3. **Scout edge cases.** Trace affected files, callers, data flows, error paths,
   boundary conditions, races, and compatibility surfaces.
4. **Stage 2 — code quality.** Apply YAGNI, KISS, then DRY; check correctness,
   security, reliability, performance, and maintainability.
5. **Apply the baseline checklist.** Always read
   [review checklist](references/review-checklist.md); use API/web overlays only
   when the project surface matches.
6. **Rank and prove findings.** Use
   [severity rubric](references/severity-rubric.md). Every finding includes
   `file:line`, problem, concrete failure path, and recommended fix.
7. **Verify the verdict.** Read [spec and evidence](references/spec-and-evidence.md)
   and name fresh commands/results or state exactly what remains unverified.

## Review stance

- KISS and DRY always. Requested scope is a constraint, not a finding — do
  not recommend cutting what the user asked for. Flag only additions beyond
  the request, or genuinely unsafe / redundant requested scope raised as a
  question with evidence. With `--yagni`, scope-cut recommendations are also
  in scope. Technical correctness over social comfort.
- Assume reviewed code may be AI-assisted. Do not trust polished shape,
  confident comments, or happy-path tests; verify behavior, project-rule
  compliance, and scope discipline from evidence.
- Red flags include “should”, “probably”, “seems to”, satisfaction before
  verification, and trusting agent reports.
- Read the full relevant file and diff before flagging a local pattern; nearby
  code may already address it.
- Separate defects from preferences. Do not invent findings to look thorough.
- Respect verified project and user decisions. Push back on review concerns that
  lack new evidence rather than reversing accepted scope silently.

## Scope depth

For changed public contracts, inspect every caller or list the search used to
establish there are none. For auth, data model, external systems, concurrency,
or migration changes, trace both success and failure paths and require the
appropriate integration/e2e/platform proof.

Parallel audit is only for disjoint subsystem scopes. Every reviewer receives
the same intent, rules, edge cases, and evidence format. Join all results before
ranking; never duplicate or count an unverified agent report as a finding.

## Output format

```markdown
Verdict: Approve | Request changes | Comment
Scope: <mode, range, files, +A/-D, risk>
Spec compliance: PASS | FAIL — <requirement evidence/gaps>

Findings (severity order):
- [Critical|Important|Suggestion] <file:line> — <problem>
  Failure: <input/state → wrong behavior>
  Fix: <cause-aligned correction>
  Proof: <unit|integration|e2e|platform check>

Verification: <fresh commands and results, or unverified reason>
Residual risks: <items or "none">
```

No actionable finding means `Approve`; suggestions-only means `Comment`; any
Critical or Important finding means `Request changes`.

Proof/risk: review findings are hypotheses until tied to source behavior or a
reproduction. A downstream fix is complete only after the original failure and
relevant regression suite pass with fresh evidence.

## Quality gates

Before returning, confirm:

1. Review target and intent are unambiguous.
2. Spec compliance passed before quality review, or the review stopped on gaps.
3. Edge cases and indirect callers were scouted before judging the diff.
4. Every finding has `file:line`, problem, failure path, fix, and proof layer.
5. Severity and verdict follow the shared rubric; style never blocks.
6. Suppressed/no-op/already-fixed patterns were not reported.
7. Verification is fresh command output, not “should pass” or an agent claim.
8. The skill made no edits and named `av:fix` as the owner of accepted changes.

## Workflow position

**Typically follows:** `av:cook` or `av:fix` after implementation and focused
tests; can also start from an explicit diff, commit, PR, or audit scope.

**Typically precedes:** `av:fix` for accepted findings, then re-review and
`av:ship`/`av:git` after a clean verdict.

**Related:** `av:review-pr` for PR actions, `av:scout` for edge-case discovery,
and `av:test` for execution proof.
