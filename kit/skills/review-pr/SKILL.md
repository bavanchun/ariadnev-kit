---
name: av:review-pr
description: "Use to review one or more GitHub PRs by number or URL with gh (REST fallback if GraphQL is blocked): correctness, security, breaking changes, AI slop. --fix, --reply, --merge to CI green."
user-invocable: true
when_to_use: "Invoke to review one or more GitHub PRs by number/URL, optionally fix findings, optionally post the review back to GitHub, optionally merge when ready and watch CI."
category: utilities
keywords: [pr, pull request, review, github, gh, fix, reply, merge, ci, anti-slop, ai-slop, multi-pr, graphql, rest, cloud-environment]
argument-hint: "<PR number or URL> [<PR number or URL> ...] [--fix] [--reply] [--merge] [--advice] [--ultra]"
allowed-tools:
  - Bash(gh pr view *)
  - Bash(gh pr diff *)
  - Bash(gh pr checks *)
  - Bash(gh pr review *)
  - Bash(gh pr comment *)
  - Bash(gh pr merge *)
  - Bash(gh pr list *)
  - Bash(gh run view *)
  - Bash(gh run list *)
  - Bash(gh run watch *)
  - Bash(sleep *)
  - Bash(gh api *)
  - Bash(gh auth status *)
  - Bash(source *)
  - Bash(. *)
  - Bash(command *)
  - Bash(git log *)
  - Bash(git fetch *)
  - Bash(git diff *)
  - Bash(git status *)
  - Bash(git branch *)
  - Bash(git rev-parse *)
  - Bash(git add *)
  - Bash(git commit *)
  - Bash(git push *)
  - Bash(date *)
  - Read
  - Edit
  - MultiEdit
  - Write
  - Glob
  - Grep
  - Task
metadata:
  origin: ported
  author: upstream
  version: "2.5.0"
---

# Review Pull Request

Review PR(s) `$ARGUMENTS` in this repository: read each whole diff with its surrounding files, check correctness, security, breaking changes, AI-slop patterns and project rules, and deliver a severity-graded verdict per PR; with flags, also fix, post to GitHub, and merge. Uncommitted local changes or a commit outside a PR are `av:code-review`'s.

## Modes

- **Review-only** (default): review the PR(s) and print findings to chat. Do not edit, commit, or push.
- **Fix loop** (`--fix`): review, fix all actionable findings, commit+push, then re-review. Repeat until no actionable findings remain.
- **Reply** (`--reply`): after the review (or after the fix loop converges), post the review back to the PR as a formal review.
- **Merge** (`--merge`): after all other modes complete, if the PR is ready to merge, activate `av:git merge-pr` to merge it, watch post-merge CI until green, and verify follow-up before stopping.
- **Advice** (`--advice`): run under `kongming` advisory supervision — read `references/advisory-supervision.md` for the five checkpoints, the empty-counsel fallback, and forward-carry through the fix loop.
- **Ultra** (`--ultra`): run the initial review as a best-of-5 verifier pass — read `references/ultra-review-mode.md` for the candidate task, the union finalizer, and why fix-loop re-reviews stay single-pass.

Flags compose: `review-pr 123 --fix --reply` runs the fix loop and posts the final re-review at the end. `review-pr 123 --fix --reply --merge` additionally merges once the loop converges on Approve. `--advice` layers on top of any combination; `--ultra` layers onto the initial review only. Flag order does not matter.

## Multi-PR mode and argument parsing

Every non-flag token of `$ARGUMENTS` is one PR reference — `123`, `#123`, or a full PR URL, whitespace- or comma-separated. The Context prelude strips the mode flags and tokenizes the rest into `PR_REFS` (with `PR_COUNT`). Detect flags by substring match, in any order: `--fix` → fix loop, `--reply` → reply, `--merge` → merge, `--advice` → advisory supervision, `--ultra` → ultra verifier mode for the initial review.

Run the PRs **sequentially**: for each `PR_REF` in `PR_REFS`, complete the full flow (Instructions → fix loop → reply → merge → advice checkpoints) before starting the next, so verdicts, commits, replies, and merges stay attributable. A fatal error on one PR (not found, GraphQL and REST both denied, merge-readiness rejected) goes into that PR's row and the run continues; stop the whole run only for an environment failure (`gh` missing, no auth at all). A single PR is the one-element case and behaves exactly as before. Detail: `references/github-api-compat.md`.

## GitHub API compatibility

Some hosted environments (notably Claude Cloud Environment) block the GitHub GraphQL API at the egress proxy, and `gh pr view` / `diff` / `checks` / `list` all issue GraphQL. `references/gh-api-helpers.sh` owns the one-shot probe (`AV_GH_REST=1` when blocked) and every adaptive read and write; `references/github-api-compat.md` has the function table, the probe semantics, and the merge and self-approve gaps. Source it at the top of every per-PR bash block with this ladder (installed project scope, installed user scope, then this repository's checkout) and split the current ref:

```bash
_av_lib=.claude/skills/av-review-pr/references/gh-api-helpers.sh
test -f "$_av_lib" || _av_lib="$HOME/.claude/skills/av-review-pr/references/gh-api-helpers.sh"
test -f "$_av_lib" || _av_lib=kit/skills/review-pr/references/gh-api-helpers.sh
test -f "$_av_lib" || { echo "gh-api-helpers.sh not found" >&2; exit 1; }
. "$_av_lib"
read OWNER REPO NUMBER < <(_av_split_pr "$PR_REF")
```

Every block below assumes this prelude has run in the same shell; `OWNER REPO NUMBER` is the current PR.

## Context

Detected PRs, API mode, and helper location (per-PR metadata loads inside Instructions):
```
!`PR_REFS="$(printf '%s' "$ARGUMENTS" | sed -E 's/[[:space:]]*--(fix|reply|merge|advice|ultra)([[:space:]]+|$)/ /g; s/,/ /g; s/^[[:space:]]+//; s/[[:space:]]+$//')"; printf 'PR_REFS=%s\nPR_COUNT=%s\n' "$PR_REFS" "$(printf '%s\n' "$PR_REFS" | awk '{print NF}')"; _av_lib=.claude/skills/av-review-pr/references/gh-api-helpers.sh; test -f "$_av_lib" || _av_lib="$HOME/.claude/skills/av-review-pr/references/gh-api-helpers.sh"; test -f "$_av_lib" || _av_lib=kit/skills/review-pr/references/gh-api-helpers.sh; test -f "$_av_lib" && . "$_av_lib" && _av_probe_gh_api 2>/dev/null; printf 'AV_GH_REST=%s (%s)\nLIB=%s\n' "${AV_GH_REST:-?}" "$( [ "${AV_GH_REST:-0}" = 1 ] && echo 'GraphQL blocked — REST fallback active' || echo 'GraphQL available — native gh pr commands preferred' )" "$( test -f "$_av_lib" && echo "$_av_lib" || echo not-found )"`
```

## Instructions

Review **each PR in `PR_REFS`**, one at a time: steps 0–4, then the fix loop, reply, and merge modes whose flags are set, then the next PR.

### 0. Resolve writing language and load the PR
```bash
WL_BIN=.claude/hooks/av/_lib/writing-language.cjs
test -f "$WL_BIN" || WL_BIN=kit/hooks/_lib/writing-language.cjs
node "$WL_BIN" --json
```
Load `references/writing-language.md`. Author Summary, Risk level, Findings, Verdict, blocker/handoff text, and reply prose in that language. Keep severity labels and GitHub review mechanics (`--approve` / `--request-changes` / `--comment`) independent of language. If `fallbackReason` is set, note the fallback in the review body.

Also load `references/pr-body-contract.md` and validate the PR description. The contract is `av:ship`'s template: run the validator bare when the body carries a `Ship Mode` (or localized `Chế độ ship`) section — ship wrote it — and with `--loose` for any other PR:
```bash
PR_BIN=.claude/hooks/av/_lib/pr-body-contract.cjs
test -f "$PR_BIN" || PR_BIN=kit/hooks/_lib/pr-body-contract.cjs
_av_pr_body "$OWNER" "$REPO" "$NUMBER" | node "$PR_BIN"           # ship-authored PR
_av_pr_body "$OWNER" "$REPO" "$NUMBER" | node "$PR_BIN" --loose   # any other PR
```
It always prints a JSON object (`ok`, `missingRequired`, `missingTraceability`, `findings`) and exits 1 exactly when `findings` is non-empty. Grade its entries by the `av:review-pr validation` rules in that reference: every entry is **Important** on a ship-authored PR; on any other PR downgrade the missing-section entries to **Suggestion** yourself — that body was never bound to the template — while unsupported claims stay **Important**. Do not encourage content padding; prefer honest gaps.

Then load the PR's metadata, full diff, CI check status, and changed-file list (use the last to gauge scope against the description's claims):
```bash
_av_pr_meta   "$OWNER" "$REPO" "$NUMBER"
_av_pr_diff   "$OWNER" "$REPO" "$NUMBER"
_av_pr_files  "$OWNER" "$REPO" "$NUMBER" | head -50
_av_pr_checks "$OWNER" "$REPO" "$NUMBER"
```

### 1. Understand the PR
- Read the PR title, description, and linked issues
- Understand the intent and scope of the changes
- Compare stated scope vs `additions`/`deletions`/`changedFiles` — a wide gap is itself a signal (see anti-slop reference)

### 2. Analyze the diff
- Read every changed file carefully
- For modified files, read the full file (not just the diff) to understand surrounding context
- Check if the changes align with the stated PR purpose

### 3. Check for issues

**Correctness**
- Logic errors, off-by-one, nil/null dereference
- Missing error handling or swallowed errors
- Race conditions in concurrent code
- Edge cases not handled

**Security**
- Injection (SQL, XSS, command, SSRF, path traversal)
- Hardcoded secrets or credentials
- Missing input validation at system boundaries
- Authentication/authorization gaps

**Breaking changes**
- API contract changes (request/response shapes, status codes)
- Database schema changes without migrations
- Config format changes without backwards compatibility
- Removed or renamed exports/public interfaces

**Code quality (anti-slop — terse checklist)**
Scan the diff for these high-signal patterns:

- New file in dumping-ground dirs (`utils/`, `helpers/`, `lib/common/`, `*manager.ts`) without a clear domain anchor
- Parallel reimplementation of a utility that already exists in the repo (grep for prior art)
- New abstraction (interface + factory + builder) with only one caller — premature
- New config flag for behavior that should be hardcoded
- Defensive paranoia — try/catch around code that cannot throw; null checks on typed-non-null params
- Catch-and-swallow — `catch (e) { console.log(e) }` or `catch { return null }`
- Over-comment — comments paraphrasing code (`// increment counter` next to `counter++`)
- One-line wrappers that add indirection with no value
- Re-implementing stdlib (`chunk`, `range`, `groupBy`) when language or existing dep covers it
- `any` widening, `@ts-ignore`, `// eslint-disable` introduced to silence (not fix) warnings
- Phantom test coverage — tests that exercise lines without meaningful assertions
- Unused imports / exports / parameters / variables introduced
- File grows past the project's size limit (commonly 200 lines) without splitting
- Diff size doesn't match scope ("fix typo" with +800/−60)
- Touches files unrelated to stated purpose
- Commit messages with generic LLM phrasing ("improve code quality and enhance maintainability")

**Load the full taxonomy** in `references/anti-ai-slop.md` when ANY of:
- diff adds >300 lines, OR
- ≥2 inline anti-slop flags above fire, OR
- PR creates >2 new files in `utils/`/`helpers/`/`lib/common/`, OR
- you cannot confidently judge whether a pattern is genuine YAGNI vs slop

The reference covers structural, micro, and process slop, how to phrase a finding without an AI witch-hunt, when NOT to flag, and a Go / React-TS / Tailwind appendix.

**Project-specific compliance**
- Read the project's loaded instruction surfaces and follow its documentation navigation to locate current architecture, coding, data, UI, and review standards
- Verify every cited rule against the current path, source, tests, or configuration that owns it
- Check the diff against project conventions for: architecture patterns, ID scoping, SQL store rules, i18n catalogs, UI/CSS conventions, package manager, file-size limits
- See `references/project-rules-example.md` for a worked example of project-specific compliance rules (Go gateway, React/Tailwind UI)

**Testing**
- Are new code paths covered by tests?
- Do existing tests still pass with these changes?
- Are edge cases tested?
- Watch for phantom coverage (assertions that always pass)

### 4. Summarize findings

Write the review block in the shape under Output format. Severity follows the anti-slop rule: **structural** slop (new dumping-ground file, parallel reimpl, abstraction with one caller, schema change without migration, large file growth) → **Important**; **micro** slop (over-comments, defensive paranoia, one-line wrappers) → **Suggestion**. This keeps `--fix` from churning the diff with cosmetic rewrites the original author won't recognize.

## Fix loop mode (`--fix`)

If `$ARGUMENTS` contains `--fix`, follow this loop after the review steps above, **per PR**:

1. **Decide whether fixing is needed.** No actionable findings → stop and report **Approve** for this PR. Actionable = all **Critical** + **Important** findings, plus **Suggestion** findings that are concrete, low-risk, and tied to PR scope. Do not invent new style-only suggestions to keep the loop running.
2. **Fix all findings.** Activate `av:fix --auto "Fix all actionable findings from review-pr <PR_REF>: <finding summary>"` with the exact evidence: PR reference, base and head branch, changed files, and for each finding its severity, file path, line/function, expected behavior, actual behavior, and why it matters. Constraints: preserve PR scope, avoid unrelated refactors, keep public contracts backward compatible unless the finding requires a contract change. `av:fix` performs its own scout, diagnose, implementation, verification, and prevention flow — do not bypass its hard gates.
3. **Commit and push.** After `av:fix` verifies the fixes, activate `av:git cp` to stage, commit, and push to the PR head branch. Do not run it if verification failed, secrets are detected, or the working tree contains unrelated user changes.
4. **Re-review.** After the push succeeds, activate `review-pr <PR_REF> --fix` again (carrying `--reply`, `--merge`, and `--advice` forward if they were originally set — never `--ultra`: re-reviews stay single-pass) and repeat **for this PR only**; do not advance to the next PR while this loop is unresolved.

Stop only when one of: the re-review finds no actionable findings; `av:fix` is blocked by a missing user/business decision; the same finding survives 3 consecutive fix attempts; CI or local verification fails in a way `av:fix` cannot resolve without user input. With `--advice`, spawn the "loop is stuck" checkpoint before declaring a stop condition.

## Reply mode (`--reply`)

Post the review as a formal GitHub review after the review, or after the fix loop converges, per PR.

1. **Pre-flight.** `gh` must be installed and authenticated (`command -v gh`, `gh auth status`). On any failure, print the review locally and warn — never fail the whole skill.
2. **Body.** The review block from Output format plus one footer line: `*Posted by the installed review-pr skill at <ISO-8601 UTC timestamp>*` (`date -u +"%Y-%m-%dT%H:%M:%SZ"`).
3. **Post.** Map the verdict to `EVENT` — Approve → `APPROVE`, Request changes → `REQUEST_CHANGES`, Comment → `COMMENT` — and pipe the body via stdin into the adaptive helper, native `gh pr review` first and `gh api …/reviews` when GraphQL is blocked: `printf '%s\n' "$REVIEW_BODY" | _av_pr_review "$OWNER" "$REPO" "$NUMBER" "$EVENT"`

In `--fix --reply` mode post only the final re-review; if the loop stopped on a blocker, still post, with the blocker in the body. For the self-PR fallback (GitHub refuses approving your own PR on either path), the 60,000-char length cap, idempotency, and the `--advice` pre-post checkpoint, read `references/reply-and-merge.md`.

## Merge mode (`--merge`)

Runs LAST for each PR — after the review, after the fix loop converges, and after the review is posted. Merge ONLY when ALL of these hold:

- Verdict is **Approve** (no Critical or Important findings; in `--fix` mode the loop converged with no actionable findings).
- The fix loop (if run) did not terminate on a blocker.
- PR is `OPEN` and `mergeable` (no conflicts): `_av_pr_meta "$OWNER" "$REPO" "$NUMBER"` → `state`, `mergeable`, `reviewDecision` (under REST the decision comes from `gh api "repos/$OWNER/$REPO/pulls/$NUMBER/reviews"`).
- `reviewDecision` is not `CHANGES_REQUESTED` from another reviewer.
- CI checks are all passing, or only pending (pending is acceptable — the merge step uses auto-merge; under `AV_GH_REST=1` there is no auto-merge, so poll `_av_pr_checks` to terminal-green first).

If any condition fails, do NOT merge: record the PR as not-ready with the exact failed condition, and move on to the next PR. `--merge` authorizes merging a ready PR, never forcing an unready one through. When the gate passes, activate `av:git merge-pr <PR_REF>` — it owns the merge method, auto-merge on pending checks, the post-merge CI watch, up to 3 follow-up fixes, and confirming that a plan-backed change's `status: completed` reached the target branch. Do not advance to the next PR while post-merge CI is still pending. For the `--advice` checkpoints around the merge, the mandatory post-CI-green PR comment, the REST merge fallback, and failure handling, read `references/reply-and-merge.md`.

## Output format

The review block, printed to chat for every PR in every mode and posted verbatim by `--reply`:

```markdown
**Summary**: <1–2 sentences — what the PR does>

**Risk level**: Low | Medium | High — <scope, complexity, breakage potential>

**Findings**:
- **Critical** — `<file>:<line>` — <what is wrong> · <why it matters> · <what to change>
- **Important** — `<file>:<line>` — …
- **Suggestion** — `<file>:<line>` — …
(or "none" under a severity)

**Verdict**: Approve | Request changes | Comment
```

Critical = must fix before merge (bugs, security, data loss); Important = should fix (logic issues, missing validation, structural slop); Suggestion = nice to have (style, micro slop). Approve = no Critical or Important; Request changes = either present; Comment = minor suggestions only, safe to merge as-is.

After a PR's modes complete, its run report follows the block, one line per item and only for the modes that ran:

```markdown
Verdict: <Approve | Request changes | Comment>
Fix loop: <N> iteration(s) · commits pushed: <sha…> · remaining findings: <list or none>
Reply: posted as <approve | request-changes | comment> | downgraded to comment (self-PR) | printed locally (<reason>)
Merge: merged <sha>, post-merge CI <conclusions>, follow-up fixes <list or none> | not-ready (<failed condition>) | blocked (<reason>)
Advice: <N> checkpoint(s) fired · post-CI-green comment posted | skipped (<CI not green | empty counsel | unavailable>) · advice-flagged risks that shaped the verdict or fix scope: <list or none>
Blockers: <list or none>
Unresolved questions: <list or none>
```

When `PR_COUNT` > 1, close the run with a per-PR table and an aggregate:

```markdown
| PR | Verdict | Iterations | Commits | Reply | Merge | CI |
|----|---------|------------|---------|-------|-------|----|
| `<PR_REF>` | Approve / Request changes / Comment | N (`--fix`) | SHAs (`--fix`) | posted / downgraded / printed locally (`--reply`) | merged / not-ready (<reason>) / blocked (`--merge`) | green / red / pending / n/a |

Aggregate: <N> PRs · <totals per verdict> · AV_GH_REST=<0|1>, <N> PRs hit the REST path · advice checkpoints fired: <N> · blockers and unresolved questions per PR: <list or none>
```

## Quality gates

- [ ] Every finding names `file:line` (or the function), why it matters, and what to change — the fix loop hands findings to `av:fix` as they are written, so a vague finding becomes a vague fix
- [ ] Severity follows the anti-slop rule — structural slop is Important, micro slop is Suggestion — and no Suggestion was invented to keep `--fix` looping
- [ ] The verdict follows from the findings: Approve only with zero Critical and zero Important, and the `--reply` flag and `--merge` gate both agree with it
- [ ] The PR body went through `pr-body-contract.cjs` in the mode its author earns, and each section it reported missing is a finding — Important as returned on a ship-authored PR, downgraded to Suggestion on any other — not a request to pad the description
- [ ] Summary, findings, and verdict prose are in the resolved writing language; severity labels and `gh pr review` flags were not translated
- [ ] A failed pre-flight or readiness gate ended in printing locally or not merging, with the exact failed condition named — never in a forced post or merge
- [ ] Every PR in `PR_REFS` got its own review block and run report; a per-PR failure was recorded in its row, not allowed to abort the run; every `gh` read and write went through the helpers so the run behaves the same with `AV_GH_REST` at 0 or 1

## Workflow position

**Typically follows:** `av:ship`, which opens the PR this skill usually takes as its subject, or `av:github`, which routes any PR review, fix loop, or merge-with-CI-watch here. `av:vibe` invokes it with `--fix --reply` as the review stage of its pipeline.

**Typically precedes:** `av:fix --auto`, which each `--fix` iteration hands the findings to, and `av:git` — `cp` pushes the fixes, `merge-pr` executes the merge this skill has judged ready and watches post-merge CI.

**Related:** `av:code-review` reviews the same kind of diff without the GitHub lifecycle — pending changes, a commit, a codebase scan, or a PR number — and prints findings; this skill is the one that loops fixes in, posts a formal review, and merges. `av:ship` reads `references/writing-language.md` and `references/pr-body-contract.md` from this skill when it writes the PR body that step 0 later validates.
