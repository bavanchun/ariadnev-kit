---
name: av:ship
description: "Ship a completed branch through tests, review, commit, push, and PR. Use for official/beta ships; --both stages beta then stable, --merge reviews and merges to green CI, --advice adds kongming."
user-invocable: true
when_to_use: "Invoke when a completed branch needs PR shipping workflow."
category: dev-tools
keywords: [ship, PR, merge, push, release, advice, kongming, review-pr]
argument-hint: "[official|stable|main|beta|dev|next] [--both] [--advice] [--merge] [--skip-tests] [--skip-review] [--skip-journal] [--skip-docs] [--social] [--yes-post] [--yes-post-private] [--dry-run]"
license: MIT
metadata:
  origin: ported
  author: upstream
  version: "2.3.0"
---

# Ship: Unified Ship Pipeline

Single command to ship a feature branch. Fully automated — only stops for test failures, critical review issues, or major version bumps.

**Inspired by:** gstack `/ship` by Garry Tan. Adapted for framework-agnostic, multi-language support.

## Arguments

| Flag | Effect |
|------|--------|
| `official`, `stable`, `main` | Normalize to `official`; ship to the detected default branch (main/master). Full pipeline with docs + journal |
| `beta`, `dev`, `next` | Normalize to `beta`; ship to the detected development branch (dev/beta/develop). Lighter pipeline, skip docs update |
| (none) | Auto-detect: if base branch is main/master → official, else → beta |
| `--both` | Dual-target ship: beta stage first, then a gated stable stage (see Dual-target ship). Supersedes a positional mode token |
| `--advice` | MUST run the ship-to-PR path under advisory-only `kongming` supervision |
| `--merge` | After PR creation, activate `av:review-pr <PR> --fix --reply --merge`; append `--advice` when both flags are present |
| `--skip-tests` | Skip test step (use when tests already passed) |
| `--skip-review` | Skip pre-landing review step |
| `--skip-journal` | Skip journal writing step (also honors `journal.auto=false` config preference) |
| `--skip-docs` | Skip docs update step |
| `--social` | Opt-in: after the PR is created, compose a build-in-public journal draft and publish it to social channels (see "Build-in-public publishing" below). Off by default — never fires on a plain `/av:ship`. |
| `--yes-post` | Required alongside `--social` to actually publish. Without it, the social step runs in dry-run mode: renders and prints the per-channel posts, makes no API call, exits 0. |
| `--yes-post-private` | Required alongside `--social --yes-post` when the repo is private — an explicit second opt-in for posting about non-public work. |
| `--dry-run` | Show what would happen without executing |

## Ship Mode Detection

```
Normalize one positional mode token before side effects:
  - official | stable | main → official
  - beta | dev | next        → beta
  - multiple or unknown tokens, including unknown `--flags` → stop and ask; never guess
If mode = "official" → target = main/master (auto-detect default branch)
If mode = "beta"     → target = dev/beta/develop (auto-detect dev branch)
If no mode token      → infer from current branch naming:
  - feature/* hotfix/* bugfix/* → official (target main)
  - dev/* beta/* experiment/*  → beta (target dev/beta)
  - unclear                    → ask_user capability
```

Aliases select a canonical mode; they do not force a literal branch name.

## Dual-target ship (`--both`)

When `--both` is present, ship to both targets in sequence — the beta pipeline
first, then a gated stable stage. `--both` supersedes a positional mode token;
if one is also given, warn once and continue in dual-target mode. It composes
with `--advice`, `--merge`, and the skip flags. With `--dry-run`, it simulates
the beta stage only and reports the stable stage as not-simulated.

Load `references/dual-stage-workflow.md` for the stage sequencing, the stable
stage gate (beta PR exists; with `--merge`, beta CI green first), the
promotion-convention path with its unrelated-work stop, and the completion
contract. The stable stage never force-pushes, never bypasses branch
protection, and never merges a promotion PR that sweeps unrelated work without
asking. `av:vibe --both` runs the same two stages through this skill.

## Advisory supervision (`--advice`)

When `--advice` is present, MUST spawn `kongming` to supervise the local
ship-to-PR path. Load `../av-cook/references/advisory-supervision.md` for the
supervisor contract and the delegation call. Kongming returns counsel, never
code; the main agent remains responsible for every decision, edit, and gate.

Mandatory normal-path checkpoints:

- **After pre-flight, before mutation** — pass the resolved canonical mode,
  detected target, branch/diff summary, constraints, and ask for a go/no-go plus
  the highest risk to watch.
- **After tests and local review, before versioning/commit/push/PR writes** — pass
  test evidence, findings and fixes, intended PR scope, and ask whether the
  evidence supports proceeding.
- **When stuck or before a high-stakes decision** — pass approaches tried, the
  exact blocker or irreversible choice, and ask for a legitimate next step.

Empty/error counsel is recorded as a non-fatal advisory failure; authoritative
ship gates still decide whether to proceed. If `--advice` is present and no
delegation call occurs, the workflow is incomplete.

When `--merge` is also present, forward `--advice` to `av:review-pr`. That skill
exclusively owns PR-level advisory checkpoints, review/fix/reply, merge
readiness, and post-merge CI. Do not duplicate those steps here.

`--advice` never bypasses tests, review blockers, branch protection, security
policy, or the downstream merge-readiness gate.

## When to Stop (blocking)

- On target branch already → abort
- Merge conflicts that can't be auto-resolved → stop, show conflicts
- Test failures → stop, show failures
- Critical review issues → ask_user capability per issue
- Major/minor version bump needed → ask_user capability

## When NOT to Stop

- Uncommitted changes → always include them
- Patch version bump → auto-decide
- Changelog content → auto-generate
- Commit message → auto-compose
- No version file → skip version step silently
- No changelog → skip changelog step silently

## Pipeline

```
Step 1:  Pre-flight      → Branch check, mode detection, status, diff analysis
Step 2:  Link Issues      → Find/create related GitHub issues
Step 3:  Merge target     → Fetch + merge origin/<target-branch>
Step 4:  Run tests        → Auto-detect test runner, run, check results
Step 5:  Review           → Two-pass checklist review (critical + informational)
Step 6:  Version bump     → Auto-detect version file, bump patch/minor
Step 7:  Changelog        → Auto-generate from commits + diff
Step 8:  Journal          → Write technical journal via /av:journal (see the shared "Journal step — opt-out" contract: --skip-journal flag or journal.auto config skips)
Step 9:  Docs update      → Update project docs via /av:docs update (official only)
Step 9b: Finalize plan    → av plan status completed (plan-backed; foreground, staged by Step 10)
Step 10: Commit           → Conventional commit with version/changelog
Step 11: Push             → git push -u origin <branch>
Step 12: Create PR        → gh pr create with structured body + linked issues
Step 12b: Note plan↔PR    → no CLI stores this; record the PR in the plan body (plan-backed)
Step 13: Review + merge   → if --merge: av:review-pr <PR> --fix --reply --merge [--advice]
Step 14: Social publish   → if --social: after Step 13 terminal-green when merging; otherwise after the green-PR-check gate
```

**Detailed steps:** Load `references/ship-workflow.md`
**Auto-detection:** Load `references/auto-detect.md`
**PR template:** Load `references/pr-template.md`
**Dual-target stages:** Load `references/dual-stage-workflow.md`
**Review + merge handoff:** Load `references/review-and-merge-workflow.md`
**Version, changelog, journal, docs, social:** Load `references/release-and-social-workflow.md`
**Writing language:** Load `../av-review-pr/references/writing-language.md`
**PR body contract:** Load `../av-review-pr/references/pr-body-contract.md`

## Writing language + PR body (#1195)

Before Step 12, resolve language with
`WL_BIN=.claude/hooks/av/_lib/writing-language.cjs
test -f "$WL_BIN" || WL_BIN=kit/hooks/_lib/writing-language.cjs
node "$WL_BIN" --json` and author the PR body in
that language. Titles stay English conventional commits. The body must include
the seven evidence sections (plus Linked Issues / Ship Mode). Prefer honest
`None` / `Not run` / `Unavailable` over invented narrative.

## Build-in-public publishing (`--social`)

Opt-in only — without `--social`, av-ship behavior is byte-identical to
today. When passed, after Step 12b and any requested Step 13 review/merge,
Step 14 composes
a build-in-public journal draft from the PR/issue/plan context (`Why this?`
/ `What changed` / `The tricky bit` / `What's next` / an optional thanks),
persists it via `av journal create` (so every social post traces back to a
durable journal entry), then publishes to the channels tagged
`groups.build_in_public` in `.ariadnev/journal.yaml` (falling back to all
configured channels if that group isn't defined).

Guardrails (never bypassed by any flag):
- **CI must be green.** If the PR's checks are failing, the step refuses to
  post and explains why — the ship itself still completed.
- **`--skip-journal` skips the whole social step**, not just the journal
  write — a social post always requires its journal record.
  `journal.auto = false` does **not** suppress this step: `--social` is an
  explicit user choice, distinct from the automatic per-ship journal (Step 8).
- **Collaborator-only signal.** Only PR review comments from
  `COLLABORATOR`/`MEMBER`/`OWNER` associations feed the draft's "The tricky
  bit" section — outside commenters are never quoted into a public post.
- **Dry-run by default.** Without `--yes-post`, the step renders every
  channel's post and stops — no API call. Re-run with `--social --yes-post`
  to actually publish.
- **Private-repo confirmation.** If the repository is private, `--social
  --yes-post` alone still refuses; add `--yes-post-private` too.

Full step-by-step commands: `references/release-and-social-workflow.md` (Step 14).

## Token Efficiency Rules

- Steps 4 (tests) and 5 (review): delegate to `tester` and `code-reviewer` subagents — don't inline
- Steps 8 (journal) and 9 (docs): run in **background** — don't block pipeline
- Step 2 (issues): use single `gh` command batch — avoid multiple API calls
- Skip steps early via flags to save tokens on unnecessary work
- Beta mode auto-skips: docs update (Step 9)
- Capture step outputs inline — don't re-read files already in context

## Quick Start

User says `/av:ship` → run full pipeline → output PR URL.
User says `/av:ship beta` → ship to dev branch with lighter pipeline.
User says `/av:ship official` → ship to main with full docs + journal.
User says `/av:ship stable` or `/av:ship main` → normalize to official mode.
User says `/av:ship dev` or `/av:ship next` → normalize to beta mode.
User says `/av:ship beta --advice --merge` → supervised ship, then reviewed merge and CI convergence.
User says `/av:ship --both --merge` → beta PR, reviewed beta merge to green, then the gated stable stage.

## Output format

```
✓ Pre-flight: branch feature/foo, 5 commits, +200/-50 lines (mode: official)
✓ Issues: linked #42, created #43
✓ Merged: origin/main (up to date)
✓ Tests: 42 passed, 0 failed
✓ Review: 0 critical, 2 informational
✓ Version: 1.2.3 → 1.2.4
✓ Changelog: updated
✓ Journal: written (background) / skipped (opt-out via --skip-journal or journal.auto)
✓ Docs: updated (background)
✓ Committed: feat(auth): add OAuth2 login flow
✓ Pushed: origin/feature/foo
✓ PR: https://github.com/org/repo/pull/123 (linked: #42, #43)
✓ Advice: 2 checkpoints completed / failed with reason / not requested
✓ Review: Approve / blocked(reason) / not requested
✓ Merge: merged / blocked(reason) / not requested
✓ CI: green / red / pending / n/a
```

With `--both`, add the two-stage lines from `references/dual-stage-workflow.md`.

## Quality gates

- Confirm the target branch, repository state, required checks, and release mode before mutation.
- Do not report tests, reviews, commits, pushes, publications, or merges that did not occur.
- Stop on failed required checks, unresolved critical review findings, or missing user authority.

## Important Rules

- **Never skip tests** (unless `--skip-tests`). If tests fail, stop.
- **Never force push.** Regular `git push` only.
- **Never ask for confirmation** except for critical review issues and major/minor version bumps.
- **Auto-detect everything.** Test runner, version file, changelog format, target branch — detect from project files.
- **Framework-agnostic.** Works for Node, Python, Rust, Go, Ruby, Java, or any project with a test command.
- **Subagent delegation.** Use `tester` for tests, `code-reviewer` for review, `journal-writer` for journal, `docs-manager` for docs. Don't inline.
- **Reviewed merge delegation.** `--merge` MUST activate `av:review-pr` with `--fix --reply --merge`; `--skip-review` skips only Step 5 and never the downstream review.
- **Fail closed on downstream state.** When `--merge` is requested, social publishing and merged/green completion claims require terminal `Verdict=Approve`, `Merge=merged`, and `CI=green`; a blocked, red, pending, or unavailable tuple stops those actions. Without `--merge`, the Step 14 green-PR-check gate still owns social eligibility.
- **Dry-run has no delegation side effects.** `--dry-run` stops before `kongming`, `av:review-pr`, or social publishing.
- **Background tasks.** Journal and docs run in background to not block the pipeline.

## Workflow position

**Typically follows:** `/av:code-review` (ship after review passes)
**Typically precedes:** `/av:journal` (document after shipping); `/av:review-pr` (Step 13 hands the PR to it under `--merge`)
**Related:** `/av:code-review` (review before shipping), `/av:test` (test before shipping), `/av:vibe` (runs this skill per stage, including `--both`)
