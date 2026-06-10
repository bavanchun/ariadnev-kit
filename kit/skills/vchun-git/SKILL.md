---
name: vc:vchun-git
description: "Personal git workflow (forked from ck:git). Conventional commits, branch protection, co-author footer for Pair Extraordinaire, full prc pipeline for Pull Shark farming."
user-invocable: true
when_to_use: "Invoke for commits, PRs, branch hygiene, or full git pipeline with achievement-friendly defaults."
category: dev-tools
keywords: [git, commits, staging, PR, merge, co-author, pair, pull-shark]
argument-hint: "cm|cp|pr|prc|merge|feat|fix [--solo|--team] [args]"
metadata:
  author: vchun
  version: "0.2.0"
  forked-from: "ck:git@1.0.0"
  upstream: "~/.claude/skills/git/SKILL.md"
---

# Git Operations (vchun edition)

Personal git skill. Two achievement-friendly goals built in:
- **Pull Shark** → `prc` enforces branch + PR + merge pipeline.
- **Pair Extraordinaire** → `--solo`/`--team` flags append `Co-authored-by:` footer.

## Default (No Arguments)

If invoked without arguments, use `AskUserQuestion` to present available operations:

| Operation | Description |
|-----------|-------------|
| `cm` | Stage files & create commits |
| `cp` | Stage files, create commits and push |
| `pr` | Create Pull Request |
| `prc` | Full pipeline: branch + commit + push + PR + squash-merge + cleanup |
| `feat <name>` | Create `feat/<name>` branch |
| `fix <name>` | Create `fix/<name>` branch |
| `merge` | Merge branches |

Execute git workflows via `git-manager` subagent to isolate verbose output.
Activate `ck:context-engineering` skill.

**IMPORTANT:**
- Sacrifice grammar for the sake of concision.
- Ensure token efficiency while maintaining high quality.
- Pass these rules to subagents.

## Arguments

### Sub-commands
- `cm` — Stage files & create commits
- `cp` — Stage + commit + push
- `pr [to-branch] [from-branch]` — Create PR (defaults: to=main, from=current)
- `prc` — **Full one-shot pipeline** (see `references/workflow-prc.md`)
- `feat <name>` — `git checkout -b feat/<name>`
- `fix <name>` — `git checkout -b fix/<name>`
- `merge [to-branch] [from-branch]` — Merge (defaults: to=main, from=current)

### Co-author flags (apply to `cm`, `cp`, `prc`)
- `--solo` — Append `Co-authored-by: YOUR_USERNAME` from `co-authors.json`
- `--team` — Prompt for teammate name+email; skip if not provided
- *(no flag)* — No co-author appended (default, safe)

### Optional flags for `prc`
- `--branch <name>` — Override auto-generated branch name
- `--title "<text>"` — Override auto-generated PR title

## Branch Protection

Protected branches: **`main`**, **`master`**, **`dev`**, **`develop`**.

`cm`, `cp` REFUSE direct commit on protected branches:

```
✗ blocked: direct commit to <branch> not allowed
→ Run: /vchun:git feat <name>   (creates feat/<name>)
→ Or:  /vchun:git fix <name>    (creates fix/<name>)
→ Or:  /vchun:git prc [--solo]  (auto-branch + full pipeline)
→ Then: /vchun:git cm [--solo|--team]
```

`prc` on protected branch → auto-creates `feat/<auto-slug>` branch first (no rejection).

**Exception:** if `git branch --show-current` returns empty (detached HEAD / orphan), warn but allow — let user decide.

## Quick Reference

| Task | Reference |
|------|-----------|
| Commit + co-author | `references/workflow-commit.md` |
| Full pipeline (prc) | `references/workflow-prc.md` |
| Push | `references/workflow-push.md` |
| Pull Request | `references/workflow-pr.md` |
| Merge | `references/workflow-merge.md` |
| Standards | `references/commit-standards.md` |
| Safety | `references/safety-protocols.md` |
| Branches | `references/branch-management.md` |
| GitHub CLI | `references/gh-cli-guide.md` |
| Co-author config | `co-authors.json` |

## Core Workflow (cm / cp)

### Step 0: Branch check
```bash
CURRENT=$(git branch --show-current)
case "$CURRENT" in
  main|master|dev|develop)
    echo "✗ protected branch; create feature branch first"
    exit 1 ;;
esac
```

### Step 1: Stage + Analyze
```bash
git add -A && git diff --cached --stat && git diff --cached --name-only
```

### Step 2: Security Check
```bash
git diff --cached | grep -iE "(api[_-]?key|token|password|secret|credential)"
```
**If secrets found:** STOP, warn user, suggest `.gitignore`.

### Step 3: Split Decision

**NOTE:**
- Search for related issues on GitHub and add to body.
- Only use `feat`, `fix`, or `perf` prefixes for files in `.claude` directory (do not use `docs`).

**Split commits if:**
- Different types mixed (feat + fix, code + docs)
- Multiple scopes (auth + payments)
- Config/deps + code mixed
- FILES > 10 unrelated

**Single commit if:**
- Same type/scope, FILES ≤ 3, LINES ≤ 50

### Step 4: Co-author footer (if flag)

If `--solo`:
```bash
SOLO_NAME=$(jq -r .solo.name ~/.claude/skills/vchun-git/co-authors.json)
SOLO_EMAIL=$(jq -r .solo.email ~/.claude/skills/vchun-git/co-authors.json)
FOOTER=$'\n\nCo-authored-by: '"$SOLO_NAME"' <'"$SOLO_EMAIL"'>'
```

If `--team`: AskUserQuestion → user provides `Name <email>` or skips.

### Step 5: Commit
```bash
git commit -m "$(cat <<'EOF'
type(scope): description

[body if any]

Co-authored-by: ... <...>
EOF
)"
```

**Multi-commit split:** only attach co-author footer to the code group commit, not to `chore(config)` / `chore(deps)` / `docs` groups.

### Step 6 (cp only): Push
```bash
git push -u origin <branch>
```

## Full Pipeline (prc)

See `references/workflow-prc.md` for complete details.

**TL;DR:**
1. Branch resolution (auto-create from protected branch)
2. Stage + security scan
3. Generate conventional commit message
4. Append co-author if `--solo`/`--team`
5. Commit
6. Push
7. `gh pr create`
8. `gh pr merge --squash --delete-branch`
9. Checkout default branch + pull

**Designed for solo repos.** Team repos with required reviews/CI gates will fail at merge step — use `cp` + `pr` manually.

## Output Format

```
✓ branch: feat/<name> (or current)
✓ staged: N files (+X/-Y lines)
✓ security: passed
✓ commit: HASH type(scope): description
✓ co-author: <name> <username>   (if --solo/--team)
✓ pushed: origin/<branch>          (cp/prc only)
✓ PR #N created: <url>             (prc only)
✓ PR #N squash-merged              (prc only)
✓ branch deleted                   (prc only)
✓ checked out: <default> (synced)  (prc only)

→ Pull Shark: +1 merged PR         (prc only)
→ Pair Extraordinaire: +1          (if co-author added)
```

## Error Handling

| Error | Action |
|-------|--------|
| Protected branch commit attempt | Block, suggest `feat`/`fix`/`prc` |
| Secrets detected | Block commit, show files |
| No changes | Exit cleanly |
| Push rejected | Suggest `git pull --rebase` |
| `gh` not authenticated | Stop, suggest `gh auth login` |
| PR merge blocked (protection/CI) | Report rule, keep PR open, exit non-zero |
| Co-author config missing | Warn, fall back to no footer |
| Merge conflicts | Suggest manual resolution |
| Detached HEAD on cm/cp | Warn, allow |

## Achievement Notes

| Badge | How `/vchun:git` helps | Threshold |
|---|---|---|
| Pull Shark | `prc` creates + merges PRs | 2 → 16 → 128 → 1024 |
| Pair Extraordinaire | `--solo`/`--team` adds Co-authored-by | 1 → 10 → 24 → 48 |
| Quickdraw | ❌ not in scope (close PR/issue <5min, manual) | — |
| Galaxy Brain | ❌ not in scope (Discussions answers) | — |
| YOLO | ❌ not in scope (merge w/o review on team repo) | — |

## References

- `references/workflow-commit.md` — Commit workflow + co-author footer
- `references/workflow-prc.md` — Full pipeline (prc)
- `references/workflow-push.md` — Push workflow
- `references/workflow-pr.md` — PR creation
- `references/workflow-merge.md` — Branch merge
- `references/commit-standards.md` — Conventional commit format
- `references/safety-protocols.md` — Secret detection
- `references/branch-management.md` — Naming, lifecycle
- `references/gh-cli-guide.md` — GitHub CLI reference
- `co-authors.json` — Co-author identities (--solo / --team data)

## Upstream Sync

When `/ck:git` (upstream) releases a new version, manually diff:
```bash
diff -u ~/.claude/skills/vchun-git/SKILL.md ~/.claude/skills/git/SKILL.md
diff -ru ~/.claude/skills/vchun-git/references ~/.claude/skills/git/references
```

Cherry-pick valuable changes. Bump version + update `forked-from` field.
