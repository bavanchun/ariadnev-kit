---
name: vc:review-pr
description: Review a GitHub pull request by number or URL for correctness, security, and breaking changes. Use with gh to fetch the PR and optionally fix, reply, or merge when CI is green.
user-invocable: true
argument-hint: "<PR number or URL> [--fix] [--reply] [--merge]"
metadata:
  author: vchun
  version: "1.0.0"
  category: core-loop
  upstream: "ak:review-pr"
  upstream_version: "2.2.0"
  upstream_digest: "sha256:5bbe943993ae7ed1b6f3b1d120b71f1c159d47efc883eaebd34881148265e132"
  upstream_relation: "distill"
---

# Review Pull Request

The GitHub-specialized sibling of `vc:code-review`: fetches a PR via `gh`,
reviews the diff, and can optionally act on it. Use `vc:code-review` for a local
diff/commit/codebase; use this when the target is a PR and you may want to fix,
reply, or merge it.

Shares one severity scale with `vc:code-review` — read
`../code-review/references/severity-rubric.md` (Critical/Important/Suggestion,
structural-vs-micro slop, the evidence rule) rather than inventing a second.

## Modes (flags compose, order-independent)

| Flag | Behavior |
|---|---|
| *(none)* | Review-only: print findings + verdict to chat. No edits. |
| `--fix` | Review → fix actionable findings via `vc:fix` → `vc:git` commit+push → re-review. Repeat until clean or a stop condition. |
| `--reply` | Post the final review to the PR via `gh pr review` (mapped by verdict). |
| `--merge` | LAST: if merge-ready, merge via `vc:git` and watch post-merge CI to green. |

## Workflow

1. **Resolve** `PR_REF` from the argument (strip flags). Fetch metadata + diff +
   checks: `gh pr view`, `gh pr diff`, `gh pr checks`.
2. **Judge scope**: compare stated intent vs `additions/deletions/changedFiles` —
   a wide gap is itself a signal.
3. **Review** the diff (read full modified files, not just hunks) via the
   `vc-reviewer` agent for: correctness, security, breaking changes, test
   coverage, and AI-slop. For a big/uncertain diff read `references/anti-ai-slop.md`.
4. **Rank + verdict** using the shared rubric. Then run any requested action mode.

## gh degradation

Every `gh` step is best-effort. If `gh` is missing or unauthenticated, **fall
back to printing the review locally and warn** — never fail the whole skill.
Check with `command -v gh` / `gh auth status` before `--reply`/`--merge`.

## Action-mode stop conditions

- `--fix`: stop when the re-review is clean, `vc:fix` is blocked on a decision, or
  the same finding survives 3 attempts. Never bypass `vc:fix`'s own gates.
- `--merge`: merge ONLY when verdict is Approve, PR is `OPEN` + `mergeable`, no
  other reviewer set `CHANGES_REQUESTED`, and CI is green or only pending. Any
  failure → report the exact unmet condition and stop. `--merge` authorizes a
  ready merge; it never forces an unready one.

## Output format

```
Summary: <1-2 lines: what the PR does>
Risk: Low | Medium | High
Verdict: Approve | Request changes | Comment

Findings (severity-ranked, file:line):
- [Critical] <file:line> — <failure>
- [Important] <file:line> — <issue + why>

Actions: fix=<iterations/commits | n/a> · reply=<posted|fell-back|n/a> · merge=<merged SHA|not-ready:<cond>|n/a>
```

Proof/risk: review is analysis; any `--fix` changes are proven by `vc:fix`'s own
verify step and CI, not by this skill asserting success.

## Quality gates

Before returning, confirm:
- Every finding cites `file:line` + a concrete failure, ranked by the shared rubric.
- Verdict matches the tiers (any Critical/Important ⇒ not Approve).
- `--merge` ran only through the readiness gate; an unmet condition is named, not skipped.
- `gh` failures degraded to local output with a warning — the skill did not hard-fail.

## Workflow position

**Typically follows:** a PR being opened (often by `vc:ship`)
**Typically precedes:** merge to the target branch
**Related:** `vc:code-review` (local review + shared rubric), `vc:fix` (`--fix` engine), `vc:git` (commit/push/merge mechanics)

Parity vs the AgentKit source: `references/parity.md`.
