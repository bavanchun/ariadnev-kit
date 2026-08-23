---
name: av:review-pr
description: "Use to review a GitHub PR by number or URL with gh: correctness, security, breaking changes, AI slop. --fix loops fixes in, --reply posts a formal review, --merge merges and watches CI to green."
user-invocable: true
when_to_use: "Invoke to review a GitHub PR by number/URL, optionally fix findings, optionally post the review back to GitHub, optionally merge when ready and watch CI."
category: utilities
keywords: [pr, pull request, review, github, gh, fix, reply, merge, ci, anti-slop, ai-slop]
argument-hint: "<PR number or URL> [--fix] [--reply] [--merge] [--advice]"
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
  version: "2.3.0"
---

# Review Pull Request

Review PR `$ARGUMENTS` in this repository: read the whole diff with its surrounding
files, check correctness, security, breaking changes, AI-slop patterns and project
rules, and deliver a severity-graded verdict; with flags, also fix, post to GitHub,
and merge. Uncommitted local changes or a commit outside a PR are `av:code-review`'s.

## Modes

- **Review-only** (default): review the PR and print findings to chat. Do not edit, commit, or push.
- **Fix loop** (`--fix`): review, fix all actionable findings, commit+push, then re-review. Repeat until no actionable findings remain.
- **Reply** (`--reply`): after the review (or after the fix loop converges), post the review back to the PR via `gh pr review`.
- **Merge** (`--merge`): after all other modes complete, if the PR is ready to merge, activate `av:git merge-pr` to merge it, watch post-merge CI until green, and verify follow-up before stopping.
- **Advice** (`--advice`): run under `kongming` advisory supervision — read `references/advisory-supervision.md` for the five checkpoints, the empty-counsel fallback, and forward-carry through the fix loop.

Flags compose: `review-pr 123 --fix --reply` runs the fix loop and posts the final re-review at the end. `review-pr 123 --fix --reply --merge` additionally merges once the loop converges on Approve. `--advice` layers on top of any combination.

## Argument parsing

Derive `PR_REF` from `$ARGUMENTS` by stripping all mode flags (`--fix`, `--reply`, `--merge`, `--advice`):

```
!`PR_REF="$(printf '%s' "$ARGUMENTS" | sed -E 's/[[:space:]]*--(fix|reply|merge|advice)([[:space:]]+|$)/ /g; s/^[[:space:]]+//; s/[[:space:]]+$//')" && printf 'PR_REF=%s\n' "$PR_REF"`
```

Detect flags by substring match, in any order: `--fix` → fix loop, `--reply` → reply, `--merge` → merge, `--advice` → advisory supervision.

## Context

PR metadata, full diff, CI check status, and the changed-file list (use the last to gauge scope against the description's claims):
```
!`PR_REF="$(printf '%s' "$ARGUMENTS" | sed -E 's/[[:space:]]*--(fix|reply|merge|advice)([[:space:]]+|$)/ /g; s/^[[:space:]]+//; s/[[:space:]]+$//')"; echo "== metadata =="; gh pr view "$PR_REF" --json title,body,author,baseRefName,headRefName,files,additions,deletions,changedFiles; echo "== diff =="; gh pr diff "$PR_REF"; echo "== checks =="; gh pr checks "$PR_REF" 2>/dev/null || echo "No checks found"; echo "== changed files =="; gh pr diff "$PR_REF" --name-only 2>/dev/null | head -50`
```

## Instructions

### 0. Resolve writing language
```bash
WL_BIN=.claude/hooks/av/_lib/writing-language.cjs
test -f "$WL_BIN" || WL_BIN=kit/hooks/_lib/writing-language.cjs
node "$WL_BIN" --json
```
Load `references/writing-language.md`. Author Summary, Risk level, Findings,
Verdict, blocker/handoff text, and reply prose in that language. Keep severity
labels and GitHub review mechanics (`--approve` / `--request-changes` /
`--comment`) independent of language. If `fallbackReason` is set, note the
fallback in the review body.

Also load `references/pr-body-contract.md` and validate the PR description. The
contract is `av:ship`'s template: run the validator bare when the body carries
a `Ship Mode` (or localized `Chế độ ship`) section — ship wrote it — and with
`--loose` for any other PR:
```bash
PR_REF="$(printf '%s' "$ARGUMENTS" | sed -E 's/[[:space:]]*--(fix|reply|merge|advice)([[:space:]]+|$)/ /g; s/^[[:space:]]+//; s/[[:space:]]+$//')"
PR_BIN=.claude/hooks/av/_lib/pr-body-contract.cjs
test -f "$PR_BIN" || PR_BIN=kit/hooks/_lib/pr-body-contract.cjs
gh pr view "$PR_REF" --json body -q .body | node "$PR_BIN"           # ship-authored PR
gh pr view "$PR_REF" --json body -q .body | node "$PR_BIN" --loose   # any other PR
```
It always prints a JSON object (`ok`, `missingRequired`, `missingTraceability`,
`findings`) and exits 1 exactly when `findings` is non-empty; every entry it
returns is **Important**. On a ship-authored PR each entry is a finding as
returned. On any other PR, downgrade its missing-section entries to
**Suggestion** yourself — that body was never bound to the template.
Unsupported claims in sections that are present are **Important** either way.
Do not encourage content padding; prefer honest gaps.

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

Write the review block in the shape under Output format. Severity follows the
anti-slop rule: **structural** slop (new dumping-ground file, parallel reimpl,
abstraction with one caller, schema change without migration, large file
growth) → **Important**; **micro** slop (over-comments, defensive paranoia,
one-line wrappers) → **Suggestion**. This keeps `--fix` from churning the diff
with cosmetic rewrites the original author won't recognize.

## Fix loop mode (`--fix`)

If `$ARGUMENTS` contains `--fix`, follow this loop after the review steps above:

1. **Decide whether fixing is needed.** No actionable findings → stop and report **Approve**. Actionable = all **Critical** + **Important** findings, plus **Suggestion** findings that are concrete, low-risk, and tied to PR scope. Do not invent new style-only suggestions to keep the loop running.
2. **Fix all findings.** Activate `av:fix --auto "Fix all actionable findings from review-pr <PR_REF>: <finding summary>"` with the exact evidence: PR reference, base and head branch, changed files, and for each finding its severity, file path, line/function, expected behavior, actual behavior, and why it matters. Constraints: preserve PR scope, avoid unrelated refactors, keep public contracts backward compatible unless the finding requires a contract change. `av:fix` performs its own scout, diagnose, implementation, verification, and prevention flow — do not bypass its hard gates.
3. **Commit and push.** After `av:fix` verifies the fixes, activate `av:git cp` to stage, commit, and push to the PR head branch. Do not run it if verification failed, secrets are detected, or the working tree contains unrelated user changes.
4. **Re-review.** After the push succeeds, activate `review-pr <PR_REF> --fix` again (carrying `--reply`, `--merge`, and `--advice` forward if they were originally set) and repeat.

Stop only when one of: the re-review finds no actionable findings; `av:fix` is blocked by a missing user/business decision; the same finding survives 3 consecutive fix attempts; CI or local verification fails in a way `av:fix` cannot resolve without user input. With `--advice`, spawn the "loop is stuck" checkpoint before declaring a stop condition.

## Reply mode (`--reply`)

Post the review as a formal GitHub review after the review, or after the fix loop converges.

1. **Pre-flight.** `gh` must be installed and authenticated (`command -v gh`, `gh auth status`). On any failure, print the review locally and warn — never fail the whole skill.
2. **Body.** The review block from Output format plus one footer line: `*Posted by the installed review-pr skill at <ISO-8601 UTC timestamp>*` (`date -u +"%Y-%m-%dT%H:%M:%SZ"`).
3. **Post.** Map the verdict to the flag and pipe the body via stdin to avoid shell-quoting issues:

| Verdict | gh command |
|---|---|
| Approve | `gh pr review "$PR_REF" --approve --body-file -` |
| Request changes | `gh pr review "$PR_REF" --request-changes --body-file -` |
| Comment | `gh pr review "$PR_REF" --comment --body-file -` |

In `--fix --reply` mode post only the final re-review; if the loop stopped on a blocker, still post, with the blocker in the body. For the self-PR fallback (GitHub refuses `--approve` on your own PR), the 60,000-char length cap, idempotency, and the `--advice` pre-post checkpoint, read `references/reply-and-merge.md`.

## Merge mode (`--merge`)

Runs LAST — after the review, after the fix loop converges, and after the review is posted. Merge ONLY when ALL of these hold:

- Verdict is **Approve** (no Critical or Important findings; in `--fix` mode the loop converged with no actionable findings).
- The fix loop (if run) did not terminate on a blocker.
- PR is `OPEN` and `mergeable` (no conflicts): `gh pr view "$PR_REF" --json state,mergeable,reviewDecision`.
- `reviewDecision` is not `CHANGES_REQUESTED` from another reviewer.
- CI checks are all passing, or only pending (pending is acceptable — the merge step uses auto-merge).

If any condition fails, do NOT merge: report the PR as not-ready with the exact failed condition, and stop. `--merge` authorizes merging a ready PR, never forcing an unready one through. When the gate passes, activate `av:git merge-pr <PR_REF>` — it owns the merge method, auto-merge on pending checks, the post-merge CI watch, up to 3 follow-up fixes, and confirming that a plan-backed change's `status: completed` reached the target branch. Do not stop this skill while post-merge CI is still pending. For the `--advice` checkpoints around the merge, the mandatory post-CI-green PR comment, and failure handling, read `references/reply-and-merge.md`.

## Output format

The review block, printed to chat in every mode and posted verbatim by `--reply`:

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

Critical = must fix before merge (bugs, security, data loss); Important = should fix
(logic issues, missing validation, structural slop); Suggestion = nice to have (style,
micro slop). Approve = no Critical or Important; Request changes = either present;
Comment = minor suggestions only, safe to merge as-is.

After all modes complete, the run report follows the block, one line per item
and only for the modes that ran:

```markdown
Verdict: <Approve | Request changes | Comment>
Fix loop: <N> iteration(s) · commits pushed: <sha…> · remaining findings: <list or none>
Reply: posted as <approve | request-changes | comment> | downgraded to comment (self-PR) | printed locally (<reason>)
Merge: merged <sha>, post-merge CI <conclusions>, follow-up fixes <list or none> | not-ready (<failed condition>) | blocked (<reason>)
Advice: <N> checkpoint(s) fired · post-CI-green comment posted | skipped (<CI not green | empty counsel | unavailable>) · advice-flagged risks that shaped the verdict or fix scope: <list or none>
Blockers: <list or none>
Unresolved questions: <list or none>
```

## Quality gates

- [ ] Every finding names `file:line` (or the function), why it matters, and what to change — the fix loop hands findings to `av:fix` as they are written, so a vague finding becomes a vague fix
- [ ] Severity follows the anti-slop rule — structural slop is Important, micro slop is Suggestion — and no Suggestion was invented to keep `--fix` looping
- [ ] The verdict follows from the findings: Approve only with zero Critical and zero Important, and the `--reply` flag and `--merge` gate both agree with it
- [ ] The PR body went through `pr-body-contract.cjs` in the mode its author earns, and each section it reported missing is a finding — Important as returned on a ship-authored PR, downgraded to Suggestion on any other — not a request to pad the description
- [ ] Summary, findings, and verdict prose are in the resolved writing language; severity labels and `gh pr review` flags were not translated
- [ ] A failed pre-flight or readiness gate ended in printing locally or not merging, with the exact failed condition named — never in a forced post or merge

## Workflow position

**Typically follows:** `av:ship`, which opens the PR this skill usually takes as
its subject, or `av:github`, which routes any PR review, fix loop, or
merge-with-CI-watch here. `av:vibe` invokes it with `--fix --reply` as the
review stage of its pipeline.

**Typically precedes:** `av:fix --auto`, which each `--fix` iteration hands the
findings to, and `av:git` — `cp` pushes the fixes, `merge-pr` executes the merge
this skill has judged ready and watches post-merge CI.

**Related:** `av:code-review` reviews the same kind of diff without the GitHub
lifecycle — pending changes, a commit, a codebase scan, or a PR number — and
prints findings; this skill is the one that loops fixes in, posts a formal
review, and merges. `av:ship` reads `references/writing-language.md` and
`references/pr-body-contract.md` from this skill when it writes the PR body
that step 0 later validates.
