# prc — PR Complete (Full Pipeline)

One-shot command: stage → commit → push → PR → squash-merge → cleanup.

Designed for solo repos to farm **Pull Shark** (merged PRs) and **Pair Extraordinaire** (co-authored commits).

## Usage

```
/vchun:git prc [--solo|--team] [--branch <name>] [--title "<text>"]
```

| Flag | Effect |
|---|---|
| `--solo` | Append `Co-authored-by: YOUR_USERNAME` from `co-authors.json` |
| `--team` | Prompt for teammate name+email; skip if not provided |
| `--branch <name>` | Override auto-generated branch name |
| `--title "<text>"` | Override auto-generated PR title (defaults to commit subject) |

## Pipeline Steps

### Step 1: Branch resolution

```bash
CURRENT=$(git branch --show-current)
PROTECTED=(main master dev develop)
```

**If `$CURRENT` ∈ PROTECTED:**
1. Run `git diff --cached --stat` and `git diff --stat` to inspect changes
2. Infer commit type from changes:
   - new files in `src/` or feature dirs → `feat`
   - changes in test files → `test`
   - changes in `docs/` or `*.md` → `docs` (but skip for `.claude/` dir)
   - bug-fix keywords in diff comments → `fix`
   - default → `feat`
3. Generate slug (kebab-case, ≤40 chars) from top-level changed paths
4. Branch name: `<type>/<slug>` (or use `--branch` override)
5. `git checkout -b <branch>`

**Else:** continue on `$CURRENT`.

### Step 2: Stage

```bash
git add -A
git diff --cached --stat
git diff --cached --name-only
```

If nothing to stage → exit with `✓ nothing to commit`.

### Step 3: Security scan

```bash
git diff --cached | grep -iE "(api[_-]?key|token|password|secret|credential|BEGIN.*PRIVATE KEY)"
```

If matches → **STOP**, list files, suggest `.gitignore`. Do not proceed.

### Step 4: Commit message

Generate conventional commit:
```
<type>(<scope>): <description>

[optional body explaining why]
```

Rules:
- `<type>`: from Step 1 inference (`feat`/`fix`/`refactor`/`perf`/`test`/`docs`)
- `<scope>`: top-level dir or module name
- For files in `.claude/` dir: only use `feat`/`fix`/`perf` (no `docs`/`chore`)

### Step 5: Co-author footer (if flag)

**`--solo`:**
```bash
SOLO_NAME=$(jq -r .solo.name ~/.claude/skills/vchun-git/co-authors.json)
SOLO_EMAIL=$(jq -r .solo.email ~/.claude/skills/vchun-git/co-authors.json)
```
Append (with blank line above — required by GitHub parser):
```

Co-authored-by: YOUR_NAME <YOUR_GITHUB_ID+YOUR_USERNAME@users.noreply.github.com>
```

**`--team`:** Use `AskUserQuestion`:
- Q: "Co-author teammate for this commit?"
- Options: "Enter name + email" | "Skip co-author"
- If entered → validate `<name> <email>` format → append footer
- If skip → no footer

### Step 6: Commit

```bash
git commit -m "$(cat <<'EOF'
<message>
EOF
)"
```

### Step 7: Push

```bash
git push -u origin <branch>
```

If push rejected → suggest `git pull --rebase` and stop.

### Step 8: Create PR

```bash
gh pr create \
  --title "<commit subject>" \
  --body "<commit body or auto-generated>" \
  --base "$(gh repo view --json defaultBranchRef -q .defaultBranchRef.name)"
```

Capture PR number from output.

### Step 9: Squash-merge

```bash
gh pr merge <pr-number> --squash --delete-branch
```

**If merge fails:**
- Branch protection rules / required reviews → report clearly, do NOT auto-bypass
- CI not passing → report, suggest `--auto` flag for queued merge
- Conflicts → suggest manual resolution

On failure: PR remains open, branch remains. User can finish manually. Exit non-zero.

### Step 10: Cleanup

```bash
DEFAULT_BRANCH=$(gh repo view --json defaultBranchRef -q .defaultBranchRef.name)
git checkout "$DEFAULT_BRANCH"
git pull --ff-only origin "$DEFAULT_BRANCH"
git branch -D <feature-branch> 2>/dev/null || true  # already deleted by gh
```

## Output Format

```
✓ branch: feat/add-co-author-flag (auto-created from main)
✓ staged: 3 files (+45/-12)
✓ security: passed
✓ commit: a3f9c2b feat(skill): add --solo flag for co-author
✓ co-author: YOUR_NAME <YOUR_USERNAME>
✓ pushed: origin/feat/add-co-author-flag
✓ PR #42 created: https://github.com/<owner>/<repo>/pull/42
✓ PR #42 squash-merged
✓ branch deleted (local + remote)
✓ checked out: main (synced)

→ Pull Shark: +1 merged PR
→ Pair Extraordinaire: +1 co-authored commit (if --solo/--team)
```

## Failure Modes

| Failure | Behavior |
|---|---|
| `gh` not authenticated | Stop, suggest `gh auth login` |
| Remote `origin` missing | Stop, suggest `git remote add origin ...` |
| Default branch detection fails | Fallback to `main`, warn user |
| PR merge blocked by branch protection | Report rule, keep PR open, exit |
| Secrets detected in diff | Block at Step 3, no commit created |
| Network failure mid-pipeline | Report last successful step, leave state for manual recovery |

## Scope Limitations

- **Designed for solo repos.** Team repos with required reviews will fail at Step 9 — use `cp` + `pr` instead.
- **Squash-merge only.** No rebase/merge-commit option (KISS).
- **No CI wait.** Doesn't wait for CI green before merging (use `gh pr merge --auto` manually if needed).
