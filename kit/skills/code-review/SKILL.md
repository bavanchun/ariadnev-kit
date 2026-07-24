---
name: vc:code-review
description: Review code changes for bugs, regressions, and risky patterns with evidence-based, ranked findings. Use for a diff, a PR number, a commit, or a whole-codebase audit — outside a cook cycle.
user-invocable: true
argument-hint: "[#PR | <commit> | --pending | codebase]"
metadata:
  author: vchun
  version: "1.0.0"
  category: core-loop
---

# Code Review

Evidence-based review of code you may not have written. Every finding cites
`file:line` and a concrete failure, ranked by severity — no rubber-stamps, no
style nitpicks dressed up as blockers.

Handles: a pending diff, a single commit, a GitHub PR, or a whole-codebase
audit. For reviewing a PR with GitHub actions (fix/reply/merge) use
`vc:review-pr`; this skill is the general reviewer. Fixing what it finds is
`vc:fix`; this skill only reports.

## Resolve the input mode first — know WHAT you review

| Argument | Mode | Diff source |
|---|---|---|
| `#123` / PR URL | PR | `gh pr diff 123` |
| `<7+ hex>` | Commit | `git show <sha>` |
| `--pending` *(default)* | Pending | `git diff HEAD` (staged + unstaged) |
| `codebase` | Audit | full scan, scoped to the named area |

No argument and no diff in context → ask the user which target (`AskUserQuestion`).

## Workflow

1. **Resolve mode** and load the diff. For modified files, read the *whole* file,
   not just the hunk — context is where regressions hide.
2. **Classify risk** by the shared lanes (`cook/references/risk-lanes.md`): count
   auth / data-model / public-contract / external-system / existing-behavior
   flags. A high-risk diff gets a deeper pass and an explicit regression walk of
   every caller of a changed function.
3. **Scout edge cases** before judging — invoke `vc:scout` on the changed files
   for data flows, error paths, and boundary conditions the diff ignores.
4. **Review** via the `vc-reviewer` agent for heavy analysis; pass it the diff,
   the stated intent, and the risk lane. Judge three things in order:
   spec-match (does it do what was asked?) → correctness/security → maintainability.
5. **Rank findings** by severity (`references/severity-rubric.md`) and state a
   verdict. Do not invent suggestions to look thorough.

## Hard rules

- Evidence before claims: every finding names `file:line` + the concrete failure
  (input → wrong output), never "this looks fragile".
- Assume the code may be AI-assisted — distrust polished shape, confident
  comments, and happy-path-only tests. Verify behavior, not vibes.
- Separate blocker from taste: only correctness/security/regression block; style
  is a suggestion.
- Report only — no edits. Route fixes to `vc:fix`, then re-review.

## Output format

```
<verdict emoji> Verdict: Approve | Request changes | Comment
Scope: <mode> · <N files, +A/-D> · risk lane: tiny|normal|high-risk

Findings (most severe first):
- [Critical] <file:line> — <failure: input → wrong result>
- [Important] <file:line> — <issue + why it matters>
- [Suggestion] <file:line> — <optional improvement>

Verification: <tests/build/lint run, or "unverified — <why>">
```

Proof/risk: findings that assert a bug must name the proof layer that would
catch it (`unit`/`integration`/`e2e`/`platform`, see `cook/references/risk-lanes.md`).

## Quality gates

Before returning, confirm:
- Every finding cites `file:line` and a concrete failure — zero vibes-only items.
- Verdict follows the rubric: any Critical/Important ⇒ not Approve.
- Each changed public contract (signature, schema, export, env var) is checked
  for callers, or explicitly noted as none.
- Verification line states what was actually run, or why it could not be.

## Workflow position

**Typically follows:** `vc:cook` (review after implementing), `vc:fix` (review after a fix)
**Typically precedes:** `vc:ship` (ship once review passes), `vc:git` (commit reviewed work)
**Related:** `vc:review-pr` (GitHub PR review with fix/reply/merge), `vc:scout` (edge-case scout), `vc:test` (run tests before reviewing)

Parity vs the AgentKit source: `references/parity.md`.
