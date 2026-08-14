---
name: av:ship
description: Orchestrate a finished branch through test, review, commit, push, and PR in one pass. Use to take feature or beta work from a local branch to a pull-request URL.
user-invocable: true
argument-hint: "[official|beta] [--skip-tests] [--skip-review] [--dry-run]"
metadata:
  author: vchun
  version: "1.0.0"
  category: core-loop
---

# Ship

The pipeline that takes a finished branch to a PR URL by *sequencing* the other
skills — test, review, then commit/push/PR. It orchestrates; it does not
reimplement any of them.

Distinct from `av:git`: git is the mechanics (stage, commit, push, PR); ship is
the pipeline that runs the quality gates *before* handing off to git. If you just
need a commit or PR, use `av:git` directly.

## Coupling (loose, by design)

Ship **references each step's skill by name and hands off to it** — it does not
embed their logic. Each named skill owns its own gates; ship owns only the
sequence and the stop conditions.

## Pipeline

| Step | Action | Delegates to |
|---|---|---|
| 1 | Pre-flight: branch, mode detection, diff scope | — |
| 2 | Merge target branch (`origin/main` or `origin/dev`) | `av:git` |
| 3 | Run the test gate | `av:test` |
| 4 | Pre-landing review | `av:code-review` |
| 5 | Commit + push + open PR | `av:git` |

Mode: `official` → target default branch (main/master), full pipeline. `beta` →
target dev/beta, lighter. No arg → infer from branch name (`feature/*` → official,
`dev/*`/`beta/*` → beta); unclear → ask the user.

## When to stop (blocking)

- Already on the target branch → abort.
- Merge conflict that will not auto-resolve → stop, show conflicts.
- `av:test` gate FAIL → stop, surface failures (route to `av:fix`).
- `av:code-review` returns Critical/Important → stop, ask the user per finding.

Flags: `--skip-tests` / `--skip-review` skip a gate (surface the risk in output);
`--dry-run` prints the plan without executing. Never force-push; never ask for
confirmation except on the blocking conditions above.

## Output format

```
<emoji> Ship: <mode> · branch <name> → <target>
✓ Pre-flight: <N commits, +A/-D>
✓ Merged: origin/<target>
✓ Tests: <av:test verdict>       (or ⚠ skipped)
✓ Review: <av:code-review verdict>  (or ⚠ skipped)
✓ Committed: <conventional message>
✓ Pushed: origin/<branch>
✓ PR: <url>
```

Proof/risk: ship asserts no correctness itself — the proof is the `av:test` step
(step 3). A `--skip-tests` run must flag the resulting unverified state in output.

## Quality gates

Before returning, confirm:
- Every non-skipped step actually ran and its verdict is shown — no assumed passes.
- A FAIL/Request-changes verdict stopped the pipeline; a PR URL is only emitted
  when the gates that ran passed.
- Any skipped gate is called out as an accepted risk, not hidden.
- The commit message is conventional and the push was non-force.

## Workflow position

**Typically follows:** `av:cook` (ship after implementing), `av:code-review` (ship after review), `av:test` (ship after green)
**Typically precedes:** `av:review-pr` (review the opened PR), `av:journal` (record the release)
**Related:** `av:git` (the mechanics ship delegates commit/push/PR to)

