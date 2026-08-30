# GitHub API compatibility and multi-PR mechanics

What `gh-api-helpers.sh` does, how to load it, and how a run over several PRs
is organized. `SKILL.md` carries the loader ladder and the per-PR flow; this
file carries the detail behind them.

## Why the helpers exist

Some hosted environments (notably Claude Cloud Environment) block the GitHub
GraphQL API at the egress proxy. `gh pr view`, `gh pr diff`, `gh pr checks`, and
`gh pr list` all issue GraphQL under the hood and error with:

```
HTTP 403: This GraphQL query is not enabled for this session — only the pinned set of PR-review operations is served. Use REST via `gh api repos/{owner}/{repo}/...` instead.
```

A single shell library — `references/gh-api-helpers.sh` — owns the probe and
every adaptive command. Source it at the top of every per-PR bash block with the
ladder under GitHub API compatibility in `SKILL.md`. The ladder covers the
installed project scope (`.claude/skills/av-review-pr/…`), the installed user
scope (`~/.claude/skills/av-review-pr/…`), and this repository's own checkout
(`kit/skills/review-pr/…`); when the skill is installed for another provider the
installer rewrites the first two rungs to that provider's skills root. If no rung
resolves, the block fails fast with an explicit "not found" error instead of
sourcing an unchecked path. The library is bash (it uses `[[ =~ ]]`, `local`,
and `BASH_REMATCH`); run the blocks in bash, not `sh`.

## Functions the library exports

All are safe to call many times per run.

| Function                                | Purpose                                                                                     |
|-----------------------------------------|---------------------------------------------------------------------------------------------|
| `_av_probe_gh_api`                      | One-shot GraphQL availability probe. Sets `AV_GH_REST=1` when GraphQL is blocked.           |
| `_av_split_pr <ref>`                    | Splits `123` / `#123` / full PR URL into `OWNER REPO NUMBER`. Uses `git remote`, no API.    |
| `_av_pr_meta OWNER REPO NUMBER`         | JSON metadata — mirrors `gh pr view --json …`. GraphQL native or REST fallback.             |
| `_av_pr_diff OWNER REPO NUMBER`         | Unified diff. GraphQL native or REST via `Accept: application/vnd.github.v3.diff`.          |
| `_av_pr_files OWNER REPO NUMBER`        | Changed file list, one path per line.                                                       |
| `_av_pr_checks OWNER REPO NUMBER`       | CI check summary — `<name>\t<status>\t<conclusion>\t<url>` per run; `No checks found` else. |
| `_av_pr_body OWNER REPO NUMBER`         | PR body text — feeds `pr-body-contract.cjs` on stdin.                                       |
| `_av_pr_review OWNER REPO NUMBER EVENT` | Formal review from stdin. `EVENT` ∈ `APPROVE`, `REQUEST_CHANGES`, `COMMENT`. Native → REST. |
| `_av_pr_comment OWNER REPO NUMBER`      | Post an issue/PR comment from stdin. Native → REST.                                         |

The probe is silent by design; the library never fails hard on probe failure —
it falls back to REST as if GraphQL were blocked. Write helpers (`_av_pr_review`,
`_av_pr_comment`) skip the native attempt when the probe already reports
`AV_GH_REST=1`; when the probe reports GraphQL available they try native
`gh pr …` first (the proxy's "pinned set of PR-review operations" allowlist
accepts most write ops) and only fall back to REST if the native call fails.

Field shapes differ between the two paths. Native `_av_pr_meta` returns the
`gh pr view --json` fields (`state`, `mergeable`, `reviewDecision`, …); the REST
JSON carries `state` and `mergeable` but no `reviewDecision` — read the
decision from `gh api "repos/$OWNER/$REPO/pulls/$NUMBER/reviews"` (the latest
review per reviewer wins) when `AV_GH_REST=1`.

### Merge write op

`gh pr merge` belongs to `av:git merge-pr`, which reads readiness with native
`gh pr view` / `gh pr checks` and merges with `--auto` while checks are pending.
GitHub's auto-merge enable is **GraphQL-only** (`enablePullRequestAutoMerge`)
with no REST endpoint, so under `AV_GH_REST=1` the merge stage degrades from
"merge with `--auto` while checks pending" to "poll `_av_pr_checks` until every
run is terminal-green, then merge". If `gh pr merge` itself fails on the
GraphQL error, merge via REST:

```bash
gh api -X PUT "repos/$OWNER/$REPO/pulls/$NUMBER/merge" -f merge_method=<merge|squash|rebase>
```

Pick the method the way `av:git merge-pr` does (`.github` docs, recent merged
PRs, repo settings). Record in the run report that the merge went through REST.

### Self-PR approve

Approving your own PR returns HTTP 422 under both native and REST. The self-PR
fallback in `reply-and-merge.md` (downgrade to `COMMENT`) applies to both paths.

## Multi-PR mode

`$ARGUMENTS` may name multiple PRs at once (e.g. `123 456
https://github.com/o/r/pull/789`). Every non-flag token is one PR reference.
Accepted forms per token: bare number (`123`), `#123`, or a full PR URL. Tokens
may be whitespace- or comma-separated.

Execution is **sequential per PR**. For each `PR_REF` in `PR_REFS`, run the full
flow (Instructions → fix loop → reply → merge → advice checkpoints) end-to-end
before moving to the next. This keeps verdicts, commits, replies, and merge
results deterministic and easy to attribute in the final report. Within the
loop, `PR_REF` is the current iteration's ref and `OWNER REPO NUMBER` its split
form; the singular names are kept so every block reads the same in single- and
multi-PR runs.

Fail-fast is off by default — a fatal error on one PR (PR not found, GraphQL and
REST both denied, merge-readiness rejected) records the failure in that PR's row
of the per-PR table and continues with the next PR. Only stop the whole run when
an unrecoverable environment failure occurs (`gh` not installed, no auth at all).

A single-PR invocation is the one-element case: `PR_REFS` holds one ref, the
per-PR run report is the whole output, and the per-PR table and aggregate are
omitted.
