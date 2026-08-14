---
name: av:worktree
description: Create, inspect, or clean up isolated git worktrees for parallel feature development. Use for feature isolation, stale-worktree cleanup, or before running parallel implementation phases.
user-invocable: true
argument-hint: "create <feature> | list | status | prune"
metadata:
  author: vchun
  version: "1.0.0"
---

# Worktree

Isolate a feature in its own git worktree using plain `git worktree` — no
bundled script, no monorepo-detection engine. Handles the common case
directly; a genuinely unusual repo layout is better handled by hand.

Handles: creating/removing/listing worktrees, stale-metadata cleanup.
Does not handle: dependency install automation across every package manager
— run the project's normal install command once the worktree exists.

## Branch naming

Detect prefix from the request: fix/bug/error → `fix`; refactor/restructure
→ `refactor`; docs → `docs`; test/spec → `test`; chore/cleanup → `chore`;
perf/optimize → `perf`; otherwise → `feat`. Slugify the description
(kebab-case, ≤50 chars). If the caller gives an exact branch name already
(ticket key, pre-formed slash path) — use it verbatim, skip prefixing.

## Commands

| Command | Do |
|---|---|
| Create | `git worktree add ../<repo>-<branch> -b <type>/<slug> <base>` — base is `origin/main` unless the caller names another |
| List | `git worktree list --porcelain` |
| Status | `git worktree list` + `git -C <path> status --short` + `git -C <path> log --oneline <base>..HEAD` for divergence |
| Remove | `git worktree remove <path>` (add `--force` only if the caller confirmed discarding uncommitted changes) |
| Prune | `git worktree prune --dry-run` first, then without `--dry-run` once confirmed |

## Workflow

1. `git worktree list` to see current state before creating another.
2. Determine base branch: prefer `main`, fall back to `master` if that's
   what `git branch --show-current` on the primary checkout resolves to.
3. Create at a sibling path (`../<repo-name>-<slug>`) unless the caller
   specifies a location.
4. Copy `.env*.example` → `.env*` in the new worktree if present (strip the
   `.example` suffix) — never copy a real `.env` with secrets across worktrees.
5. Report the path and remind the caller to run the project's install
   command there — this skill doesn't guess which one applies.

## Output format

```
Worktree: <path>
Branch: <name> (base: <base>)
Next: cd <path> && <install command for this stack>
```

## Quality gates

- [ ] Base branch stated explicitly, not silently assumed
- [ ] `remove`/`prune` with actual data loss potential confirmed with the caller first
- [ ] No secrets copied between worktrees (`.env` excluded, only `.example` templates copied)

## Workflow position

**Typically follows:** `av:plan` (a phase needs isolation from the current
checkout) or a decision to run implementation streams in parallel.
**Typically precedes:** `av:cook` / `av:fix` inside the new worktree, then
`av:git` to commit and push from there.
**Related:** `av:git` owns branches and commits; `av:worktree` owns the
checkouts those branches live in. Cleanup (`prune`) usually follows a merged
`av:ship` run.
