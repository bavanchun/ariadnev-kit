# Reply and merge mechanics

The mechanics behind `--reply` and `--merge`: pre-flight, body construction, the
self-PR fallback, the length cap, idempotency, the post-merge CI watch, and
failure handling.

## Reply: pre-flight, fallbacks, and idempotency

Post the review back to GitHub as a formal review after the review (review-only) or after the fix loop converges (`--fix`).

### 1. Pre-flight checks

Run these checks. On any failure, **fall back to printing the review locally** and warn the user — never fail the whole skill:

```bash
command -v gh >/dev/null 2>&1 || { echo "gh CLI not installed — printing review locally"; exit 0; }
gh auth status >/dev/null 2>&1 || { echo "gh not authenticated — printing review locally"; exit 0; }
```

### 2. Build the review body

Construct the full markdown body containing the summary, risk level, findings (by severity), and verdict. Append a single-line footer for traceability:

```
*Posted by the installed review-pr skill at <ISO-8601 UTC timestamp>*
```

Use `date -u +"%Y-%m-%dT%H:%M:%SZ"` for the timestamp.

**Length cap**: GitHub limits comment bodies to ~65,536 chars. If the body exceeds 60,000 chars, truncate the *Findings* section and append `[truncated — N findings omitted; see local output]` so the reviewer knows to consult the full chat output.

### 3. Post

When `--advice` is originally set, run the "before posting `--reply`" checkpoint from `advisory-supervision.md` now: pass the final review body to `kongming`, apply any Critical/Important body revisions it flags (tone, missed evidence, mis-scoped severities), and only then post. Skip the checkpoint silently on the empty-counsel fallback.

The verdict-to-`gh pr review` flag mapping is the table under Reply mode in SKILL.md. Pipe the body via stdin to avoid shell-quoting issues with backticks and code blocks.

### 4. Self-PR fallback

GitHub blocks approving your own PR. If `gh pr review --approve` exits non-zero with a self-review error (HTTP 422, message matching "Can not approve your own pull request"), retry as a neutral formal review:

```bash
gh pr review "$PR_REF" --comment --body-file -
```

The review still lands in the timeline; the verdict text inside the body still reads "Approve". Note the downgrade in the chat output.

### 5. Composition with `--fix`

In `--fix --reply` mode, post **only the final re-review** when the loop converges. Iteration history lives in the commit log; the PR conversation stays clean.

If the loop terminates due to a blocker (non-converging, `av:fix` blocked, CI unresolvable), still post the final review — but the verdict will reflect remaining findings (likely **Request changes** or **Comment**), and the body should include the blocker so the human reviewer knows where to take over.

### 6. Idempotency

V1 does not dedupe. Re-running `review-pr 123 --reply` posts a fresh review each time.

## Merge: execution and failure handling

This stage runs LAST — after the review, after the fix loop converges (`--fix`), and after the review is posted (`--reply`).

When `--advice` is originally set, run the "before triggering `--merge`" checkpoint from `advisory-supervision.md` first — pass verdict, `reviewDecision`, `mergeable`, CI status, and any known blockers to `kongming`, treat its output as a risk sanity check, and proceed to the readiness gate regardless of counsel presence. The gate is the five conditions under Merge mode in SKILL.md; it is authoritative, and nothing below runs until it has passed.

### 1. Merge and watch CI

Activate `av:git merge-pr` with the PR reference:

```
av:git merge-pr <PR_REF>
```

`av:git merge-pr` (documented in the `av:git` skill) owns the mechanics:

- re-checks readiness, picks the repo's merge method, merges via `gh pr merge` (with `--auto` when required checks are still pending)
- watches post-merge CI on the target branch until every run for the merge commit concludes
- on deterministic CI failure, drives a follow-up fix (`av:fix --auto` on a new branch) and repeats, up to 3 attempts
- verifies follow-up: PR state `MERGED`, merge commit on the target branch, all watched runs green
- closes the index row of a plan-backed change (matches the merged PR to its plan via `--linked-pr` or head branch, then `av plan close`; skips silently when there is no plan) per the shared "Delivery finalization" protocol

Do not bypass its readiness gate or stop conditions. Do not stop this skill while post-merge CI is still pending — the run is complete only when target-branch CI is green, an external blocker remains, or the fix attempts are exhausted.

When `--advice` is originally set AND post-merge target-branch CI reaches terminal-green, run the MANDATORY post-CI-green checkpoint from `advisory-supervision.md`: spawn `kongming` to review the whole implementation, then post its assessment plus concrete next steps as a comment on the PR:

```bash
gh pr comment "$PR_REF" --body-file -
```

Pipe kongming's body via stdin. Append the same-style traceability footer used by `--reply` (`*Posted by the installed review-pr skill at <ISO-8601 UTC timestamp>*`) so the source is obvious. The comment fires once per invocation; do not repost per fix-loop iteration. Apply the empty-counsel fallback and honor the writing-language resolution from step 0.

### 2. Failure handling

- If `av:git merge-pr` refuses (gate failure, branch protection, conflicts): report the blocker; do not retry with different flags to force the merge.
- If post-merge CI ends red after exhausted fix attempts or an external blocker: report the failing runs, the fixes attempted, and hand off to the user.
