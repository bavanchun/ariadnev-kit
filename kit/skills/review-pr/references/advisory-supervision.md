# Advisory supervision (`--advice`)

When `--advice` is present, run this skill under `kongming` supervision.
`kongming` is an advisory-only supervisor: it returns counsel, never code, and
the main agent stays responsible for every decision, edit, and gate.

Spawn `kongming` at these checkpoints (**per PR**, not once per run):

- **After the initial review completes** — pass the PR reference, the diff
  summary, the findings list with severities, and the tentative verdict; ask
  for a go/no-go on the verdict, missed findings, and — when `--fix` is set —
  which findings are actually worth fixing versus over-reach.
- **When the `--fix` loop is stuck** — same finding survives 3 attempts,
  `av:fix` is blocked, or CI keeps failing for the same reason; pass every
  approach already tried, the exact failure, and ask for a new angle or a
  legitimate stop condition.
- **Before posting `--reply`** — pass the final review body (summary, risk
  level, findings, verdict) and ask kongming to sanity-check tone, evidence,
  and severity assignments before the review lands on GitHub. If kongming
  flags a Critical/Important issue with the body, revise before posting; do
  not treat kongming counsel as a veto on the verdict itself.
- **Before triggering `--merge`** — pass the merge-readiness evidence
  (verdict, `reviewDecision`, `mergeable`, CI status, blockers) and ask for a
  risk sanity check before authorizing the merge. Do not weaken the
  merge-readiness gate documented under Merge mode.
- **MANDATORY after the PR is open AND CI is terminal-green** — spawn
  `kongming` to review the whole implementation (diff + PR body + linked
  issue when one exists), then post its assessment plus concrete next steps
  as a comment directly on the PR via the adaptive write helper
  (`_av_pr_comment "$OWNER" "$REPO" "$NUMBER"`, body on stdin; native first,
  REST fallback — see `github-api-compat.md`). Append the same-style
  traceability footer used by `--reply` so the source is obvious. This gate
  fires once per PR, after that PR's CI-green transition; it does not run per
  fix-loop iteration. When `--merge` is present, the transition happens inside
  the post-merge CI watch (`reply-and-merge.md`, Merge step 1). When `--merge`
  is absent, fire this gate at the end of the PR's iteration if
  `_av_pr_checks "$OWNER" "$REPO" "$NUMBER"` is terminal-green; otherwise skip
  it and note the reason (CI red, pending, or unavailable) in the run report.

Invoke with
`delegate_agent capability(subagent_type="kongming", prompt="<task, evidence, approaches tried, the exact question>", description="advice: <checkpoint>")`.
Give it enough context to answer in one reply; it does not interview.

**Empty-counsel fallback**: if `kongming` returns an empty final message,
errors, or is otherwise unreachable, record the failure in chat and continue
with the review/fix/reply/merge flow. Never fail the whole skill on a missing
advisory step.

**Forward-carry in the fix loop**: when `--advice` was originally set, the
`--fix` re-invocation of this skill must carry `--advice` forward alongside
`--reply` and `--merge` so supervision persists across iterations.
