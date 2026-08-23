# GitHub Issue Projection (`--github`, optional publish)

How a validated plan is projected onto a GitHub issue. Read when the
invocation carries `--github`. The files stay canonical either way; the
publish-safety rules are the ones stated below.

When `--github` is present, publish an OPTIONAL visibility projection of the
validated plan to a GitHub issue after validation and red-team gates finish and
before implementation handoff. `plan.md` + phase files remain canonical either
way — this step never replaces them and is skipped entirely in a repo with no
GitHub remote or `gh` auth (report the skip, do not fail the plan).

**How to publish — the agent uses `gh` / the GitHub API directly.** The `av` CLI
does not publish to GitHub; projecting a plan onto an issue is the agent's job.
When `gh` is installed and authenticated (or a GitHub token is available for the
API), create or update the issue with the `gh` sequence below. Gate it on repo
visibility and a secret scan before writing anything to GitHub.

**When GitHub is not reachable** (`gh` not installed, not authenticated, or no
token): do not fail the plan and do not invoke any `av plan publish` command —
there is none. Report the skip to the user, name what is missing, and suggest the
concrete next step (e.g. `gh auth login`, or exporting a token) so they can enable
publishing if they want it. The plan is fully usable as files either way.

**Required issue fields:**
- Branch name from `git branch --show-current`.
- Plan summary.
- Repo-relative link to `plan.md`.
- Repo-relative link to `plan.html` when `--html` is present.
- Repo-relative link to the brainstorm report when one exists; otherwise state
  `Brainstorm report: None found`.
- Open questions when present; otherwise state `Open questions: None`.
- Acceptance criteria from the validated plan.

**Required label:** `ready to review`.

AK lifecycle labels (`ready to cook`, `in progress`, `ready to ship *`) are
owned by av-vibe/av-issue-to-plan; `ready to review` marks a
plan-awaiting-human-review stage before `ready to cook`.

**`gh` sequence:**
```bash
gh label list --json name --jq '.[].name' | grep -Fx "ready to review" >/dev/null \
  || gh label create "ready to review" --color "C5DEF5" --description "Plan ready for human review"
gh issue create --title "<plan title>" --body-file "<body.md>" --label "ready to review"
```

- If an issue already exists for the same plan or branch, update/comment on it
  instead of creating a duplicate.
- All links posted to GitHub must be repo-relative. Do not post absolute local
  filesystem paths.
- Redact secrets, env values, tokens, customer data, private logs, and local
  machine-specific details before writing issue bodies or comments.
- If `gh` cannot create labels or issues, stop and report the exact error to the
  user; do not treat it as a plan-creation failure.
