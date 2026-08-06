---
name: vc:ship
description: Orchestrate a finished branch through test, review, commit, push, and PR in one pass. Use to take feature or beta work from a local branch to a pull-request URL.
user-invocable: true
argument-hint: "[official|beta] [--skip-tests] [--skip-review] [--dry-run]"
metadata:
  author: vchun
  version: "1.0.0"
  category: core-loop
  upstream: "ak:ship"
  upstream_version: "2.1.0"
  upstream_digest: "sha256:533030fdfff4789aee6fe71b31f41afbcbb47671d74fe49b409e2f9dc94b223b"
  upstream_relation: "distill"
---

# Ship

The pipeline that takes a finished branch to a PR URL by *sequencing* the other
skills — test, review, then commit/push/PR. It orchestrates; it does not
reimplement any of them.

Distinct from `vc:git`: git is the mechanics (stage, commit, push, PR); ship is
the pipeline that runs the quality gates *before* handing off to git. If you just
need a commit or PR, use `vc:git` directly.

## Coupling (loose, by design)

Ship **references each step's skill by name and hands off to it** — it does not
embed their logic. Each named skill owns its own gates; ship owns only the
sequence and the stop conditions.

## Pipeline

| Step | Action | Delegates to |
|---|---|---|
| 1 | Pre-flight: branch, mode detection, diff scope | — |
| 2 | Merge target branch (`origin/main` or `origin/dev`) | `vc:git` |
| 3 | Run the test gate | `vc:test` |
| 4 | Pre-landing review | `vc:code-review` |
| 5 | Commit + push + open PR | `vc:git` |

Mode: `official` → target default branch (main/master), full pipeline. `beta` →
target dev/beta, lighter. No arg → infer from branch name (`feature/*` → official,
`dev/*`/`beta/*` → beta); unclear → ask the user.

## When to stop (blocking)

- Already on the target branch → abort.
- Merge conflict that will not auto-resolve → stop, show conflicts.
- `vc:test` gate FAIL → stop, surface failures (route to `vc:fix`).
- `vc:code-review` returns Critical/Important → stop, ask the user per finding.

Flags: `--skip-tests` / `--skip-review` skip a gate (surface the risk in output);
`--dry-run` prints the plan without executing. Never force-push; never ask for
confirmation except on the blocking conditions above.

## Output format

```
<emoji> Ship: <mode> · branch <name> → <target>
✓ Pre-flight: <N commits, +A/-D>
✓ Merged: origin/<target>
✓ Tests: <vc:test verdict>       (or ⚠ skipped)
✓ Review: <vc:code-review verdict>  (or ⚠ skipped)
✓ Committed: <conventional message>
✓ Pushed: origin/<branch>
✓ PR: <url>
```

Proof/risk: ship asserts no correctness itself — the proof is the `vc:test` step
(step 3). A `--skip-tests` run must flag the resulting unverified state in output.

## Quality gates

Before returning, confirm:
- Every non-skipped step actually ran and its verdict is shown — no assumed passes.
- A FAIL/Request-changes verdict stopped the pipeline; a PR URL is only emitted
  when the gates that ran passed.
- Any skipped gate is called out as an accepted risk, not hidden.
- The commit message is conventional and the push was non-force.

## Workflow position

**Typically follows:** `vc:cook` (ship after implementing), `vc:code-review` (ship after review), `vc:test` (ship after green)
**Typically precedes:** `vc:review-pr` (review the opened PR), `vc:journal` (record the release)
**Related:** `vc:git` (the mechanics ship delegates commit/push/PR to)

Parity vs the AgentKit source: `references/parity.md`.
